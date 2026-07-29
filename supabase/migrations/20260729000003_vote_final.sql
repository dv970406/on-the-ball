-- =====================================================================
-- 투표 확정 정책 — "한 번 던진 표는 바꿀 수 없다"
--
-- 제거하는 기존 정책 (0001_init):
--   * 첫 투표 후 24시간 안에 1회 변경 (CHANGE_LIMIT / CHANGE_WINDOW_OVER)
--   * 유니폼(kit) 같은 선택지 재탭 시 투표 취소 (status = 'cancelled')
--
-- 이후 cast_vote는 첫 표만 기록한다:
--   * 표 없음      → 기록 후 'voted'
--   * 같은 선택지  → 'unchanged' (더블탭·네트워크 재시도 멱등 처리)
--   * 다른 선택지  → VOTE_LOCKED 예외
-- =====================================================================

-- "24시간 안에 한 번만 변경" 정책 카운터 — 정책이 사라져 읽고 쓰는 곳이 없다
alter table public.votes drop column if exists changed_count;

create or replace function public.cast_vote(p_poll_id bigint, p_option_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_poll public.polls;
  v_existing public.votes;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_poll from public.polls where id = p_poll_id;
  if not found then
    raise exception 'POLL_NOT_FOUND';
  end if;
  if v_poll.closes_at is not null and v_poll.closes_at < now() then
    raise exception 'POLL_CLOSED';
  end if;

  if not exists (
    select 1 from public.poll_options
    where id = p_option_id and poll_id = p_poll_id
  ) then
    raise exception 'INVALID_OPTION';
  end if;

  -- 동시 요청 직렬화 — 같은 유저의 기존 표를 잠그고 검사
  select * into v_existing
  from public.votes
  where poll_id = p_poll_id and user_id = v_user
  for update;

  if found then
    -- 같은 선택지 재요청은 멱등 응답, 다른 선택지는 확정된 표라 거절
    if v_existing.option_id = p_option_id then
      return jsonb_build_object('status', 'unchanged', 'option_id', p_option_id);
    end if;
    raise exception 'VOTE_LOCKED';
  end if;

  begin
    insert into public.votes (poll_id, option_id, user_id)
    values (p_poll_id, p_option_id, v_user);
  exception when unique_violation then
    -- 첫 투표 동시 경합 — 먼저 기록된 표를 유지하고 멱등 응답
    select * into v_existing
    from public.votes
    where poll_id = p_poll_id and user_id = v_user;
    return jsonb_build_object('status', 'unchanged', 'option_id', v_existing.option_id);
  end;

  return jsonb_build_object('status', 'voted', 'option_id', p_option_id);
end;
$$;

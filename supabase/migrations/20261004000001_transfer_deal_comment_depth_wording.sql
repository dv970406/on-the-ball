-- 답글 깊이 트리거의 사유 문구를 화면 문구 규칙에 맞춘다
--
-- - "삭제되었을" → "삭제됐을": 화면 문구는 줄임형으로 통일한다.
-- - "다른 이적의 댓글" → "다른 딜의 댓글": 화면 용어는 "딜"이다.
--
-- ⚠ 첫 번째 문구는 클라이언트(`features/write-comment`의 `REPLY_TARGET_MISSING_MESSAGE`)와
--   **글자 하나까지 같아야 한다** — 그 값과 대조해 "답글 대상이 지워졌다"를 판정한다.
--   원격에는 이 마이그레이션을 **앱 배포보다 먼저** 적용한다. 순서가 뒤집히면 그 사이 판정이 빗나가
--   답글 칸이 대상 소실 안내를 겹쳐 띄운다(기능은 그대로다).
--
-- 함수 본문 외에는 바꾸지 않는다 — invoker · search_path 고정 · 트리거 연결은 원래 마이그레이션
-- (20260927000001_transfer_deal_comment.sql)의 판단 그대로다. create or replace라 권한도 유지된다.
create or replace function public.transfer_deal_comment_check_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_deal_id   bigint;
  v_parent_parent_id bigint;
begin
  if new.parent_id is null then
    return new;
  end if;

  select deal_id, parent_id
    into v_parent_deal_id, v_parent_parent_id
    from public.transfer_deal_comment
   where id = new.parent_id;

  if not found then
    raise exception '답글을 달 댓글을 찾을 수 없어요. 삭제됐을 수 있어요.' using errcode = 'P0001';
  end if;

  if v_parent_deal_id <> new.deal_id then
    raise exception '다른 딜의 댓글에는 답글을 달 수 없어요.' using errcode = 'P0001';
  end if;

  if v_parent_parent_id is not null then
    raise exception '답글에는 다시 답글을 달 수 없어요.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

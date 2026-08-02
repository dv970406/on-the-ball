-- =====================================================================
-- 좋아요 토글 RPC + 카운터/타임스탬프 동기화 트리거
-- =====================================================================

-- ---------------------------------------------------------------------
-- 좋아요 토글
--
-- 왜 RPC인가:
--   like_count를 클라에서 SELECT → +1 → UPDATE 하면 두 요청이 동시에 0을 읽어
--   결과가 2가 아니라 1이 된다(lost update). 행 잠금(FOR UPDATE)이 필요한데
--   supabase-js에는 행 잠금 옵션이 없다 → DB 함수로 내린다.
--
-- 왜 유저 id를 인자로 받지 않는가:
--   security definer는 RLS를 우회하므로, 유저 id를 클라이언트가 넘기면
--   로그인한 아무나 남의 uuid를 실어 타인 명의 좋아요를 조작할 수 있다.
--   auth.uid()는 PostgREST가 access token을 검증해 request.jwt.claims에 심어둔 값을
--   읽는 것이라 위조가 불가능하다. security definer가 바꾸는 것은 "무엇을 할 수 있는가"
--   (권한)이지 "누가 호출했는가"(세션 컨텍스트)가 아니므로 함수 안에서도 그대로 쓸 수 있다.
--
-- search_path 고정:
--   security definer 함수는 호출자가 search_path를 조작해 다른 스키마의 동명 테이블을
--   붙잡게 만드는 권한 상승 공격이 가능하다. 빈 문자열로 고정하고 public. 접두사를 명시한다.
-- ---------------------------------------------------------------------
create or replace function public.toggle_post_like(p_post_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다' using errcode = 'P0001';
  end if;

  -- 게시글 행을 잠근다 — 동시 토글을 직렬화하고 존재·생존 여부를 함께 검증
  perform 1 from public.post
   where id = p_post_id and deleted_at is null
     for update;
  if not found then
    raise exception '존재하지 않는 게시글입니다' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.post_like
     where post_id = p_post_id and user_id = v_user_id
  ) then
    insert into public.post_like (post_id, user_id) values (p_post_id, v_user_id);
    update public.post set like_count = like_count + 1 where id = p_post_id;
    return true;   -- 좋아요 켜짐
  else
    delete from public.post_like where post_id = p_post_id and user_id = v_user_id;
    update public.post set like_count = like_count - 1 where id = p_post_id;
    return false;  -- 좋아요 꺼짐
  end if;
end;
$$;

-- ⚠ 함수는 기본적으로 PUBLIC에 EXECUTE가 부여된다. 그대로 두면 비로그인도 호출할 수 있다.
--   위 v_user_id null 가드와 층이 다르다 — 이쪽은 PostgREST의 anon 역할 경로를 막고,
--   가드는 JWT 없이 함수에 도달하는 모든 경로(psql 등)를 막는다.
revoke execute on function public.toggle_post_like(bigint) from public, anon;
grant  execute on function public.toggle_post_like(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 게시글 소프트 삭제
--
-- 왜 RPC인가 (toggle_post_like와 이유가 다르다 — 동시성이 아니라 RLS 때문이다):
--   Postgres는 UPDATE의 **새 행**에도 SELECT 정책을 적용한다. post_select_alive가
--   "deleted_at is null"이라 deleted_at을 채운 새 행이 정책을 통과하지 못해
--   클라이언트의 직접 UPDATE는 "new row violates row-level security policy"로 거부된다.
--
--   정책을 "deleted_at is null or author_id = auth.uid()"로 푸는 선택지도 있었지만,
--   그러면 "deleted_at is null" 필터가 모든 조회 쿼리로 흩어져 한 곳만 빠뜨려도
--   삭제된 글이 샌다. 정책은 엄격하게 두고 쓰기만 RPC로 내린다.
--
-- 덤: RLS 위반은 0행 UPDATE로 조용히 지나가지만 RPC는 예외를 던진다 →
--     "남의 글 삭제 시도"가 침묵하지 않고 에러로 드러난다.
-- ---------------------------------------------------------------------
create or replace function public.soft_delete_post(p_post_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_author_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다' using errcode = 'P0001';
  end if;

  select author_id into v_author_id
    from public.post
   where id = p_post_id and deleted_at is null
     for update;
  if not found then
    raise exception '존재하지 않는 게시글입니다' using errcode = 'P0001';
  end if;

  -- P0001로 던진다 — toDbErrorMessage가 "P0001 = 우리가 의도적으로 띄운 한국어 메시지"로
  -- 보고 그대로 노출한다. 42501은 Postgres 자신의 영어 권한 거부 메시지용으로 남겨둔다.
  if v_author_id <> v_user_id then
    raise exception '본인 글만 삭제할 수 있습니다' using errcode = 'P0001';
  end if;

  update public.post set deleted_at = now() where id = p_post_id;
end;
$$;

revoke execute on function public.soft_delete_post(bigint) from public, anon;
grant  execute on function public.soft_delete_post(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 댓글 수 동기화
--
-- 좋아요와 달리 댓글은 분기가 없다(항상 insert). 그래서 트리거로 충분하다 —
-- comment_count = comment_count + 1은 그 자체로 원자적이라(같은 행 UPDATE를
-- Postgres가 직렬화) 별도 잠금이 필요 없고, 어떤 경로로 들어와도 카운트가 어긋나지 않는다.
--
-- ⚠ security definer가 필수다. 트리거 함수는 기본적으로 호출자 권한으로 돌아서
--   post_update_own 정책("본인 글만")에 걸린다 — 남의 글에 댓글을 달면 UPDATE가
--   0행으로 조용히 실패하고 comment_count가 어긋난다(에러도 안 난다).
--   위에서 카운터 컬럼의 UPDATE 권한도 회수했으므로 그것도 우회해야 한다.
-- ---------------------------------------------------------------------
create or replace function public.sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.post set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  end if;
  -- DELETE: 게시글이 cascade로 함께 지워지는 경우 대상 행이 없어 0행 update가 되며, 정상이다
  update public.post set comment_count = comment_count - 1 where id = old.post_id;
  return old;
end;
$$;

create trigger comment_count_sync
  after insert or delete on public.comment
  for each row execute function public.sync_post_comment_count();

-- ---------------------------------------------------------------------
-- updated_at 자동 갱신
--
-- 클라이언트에게 updated_at UPDATE 권한을 주지 않았으므로(board_init의 grant 참고)
-- 서버가 트리거로 찍는다 → 위조 불가. created_at과 다르면 "수정됨"이다.
-- 소프트 삭제도 UPDATE라 이때 함께 움직이지만, 죽은 글은 조회에서 빠지므로 무해하다.
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger post_touch_updated_at
  before update on public.post
  for each row execute function public.touch_updated_at();

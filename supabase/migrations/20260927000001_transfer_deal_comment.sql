-- =====================================================================
-- 이적 딜 댓글 — transfer_deal_comment / transfer_deal_comment_vote
--
-- 옛 게시판 댓글(`comment`, 20260926000001에서 걷어냈다)의 구조를 그대로 옮기고
-- 부모만 게시글(`post`)에서 이적 딜(`transfer_deal`)로 바꾼다.
--
--  * 읽기는 전체 공개(비로그인·크롤러 포함), 쓰기·삭제는 본인 것만. 수정 경로는 없다.
--  * 답글은 깊이 1까지만 — 정책이 아니라 트리거가 P0001로 사유를 말한다.
--  * 좋아요·싫어요는 행 하나가 곧 한 표다(복합 PK가 "1인 1표"를 겸한다).
--    합계(up_count·down_count)는 트리거가 단독으로 관리한다 — 어느 경로로 표가 생기고
--    사라지든(탈퇴 cascade 포함) 숫자가 맞아야 하기 때문이다.
--
-- ⚠ 옛 구현에서 빠진 것: 부모 생존 판정(`post_is_alive` — 딜에는 소프트 삭제가 없다)과
--   차단 판정(`is_blocked` — user_block을 걷어냈다). 그래서 SELECT 정책이 `using (true)`다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 댓글
-- ---------------------------------------------------------------------
create table public.transfer_deal_comment (
  id bigint generated always as identity primary key,
  -- ⚠ **restrict다(관심의 cascade가 아니다).** 딜은 파생 스크립트가 매시 다시 만들고, 어떤 보도도
  --   가리키지 않게 된 딜을 지운다. cascade면 재파생 한 번에 사용자가 쓴 글이 조용히 사라진다 →
  --   파생기가 댓글 달린 딜을 삭제 대상에서 빼고(`findOrphanDeals`), 이 FK가 그 약속을 구조로 지킨다.
  deal_id bigint not null references public.transfer_deal (id) on delete restrict,
  user_id uuid   not null references public.profiles (id) on delete cascade,
  -- null = 루트 댓글. 깊이 1까지만(아래 트리거). 루트를 지우면 딸린 답글이 함께 사라진다
  parent_id bigint references public.transfer_deal_comment (id) on delete cascade,
  content text not null,
  up_count   int not null default 0 check (up_count   >= 0),
  down_count int not null default 0 check (down_count >= 0),
  created_at timestamptz not null default now(),
  -- 화면 300그래핌 / DB 3,000코드포인트(K=10 — api-and-db.md "길이 한도는 두 단위로 겹쳐 건다")
  constraint transfer_deal_comment_content_length check (char_length(content) between 1 and 3000),
  constraint transfer_deal_comment_content_visible check (public.has_visible_char(content))
);

comment on table public.transfer_deal_comment is
  '이적 딜 댓글. 읽기 공개 · 쓰기/삭제 본인만 · 수정 없음. 답글은 깊이 1(transfer_deal_comment_check_depth)';
comment on column public.transfer_deal_comment.content is
  '댓글 본문(평문). char_length 상한 3000은 abuse bound이고, 사용자 한도는 클라이언트의 300그래핌이다(K=10)';
comment on column public.transfer_deal_comment.up_count is
  '좋아요 수. transfer_deal_comment_vote의 트리거(sync_transfer_deal_comment_vote_count)만 갱신한다';
comment on column public.transfer_deal_comment.down_count is
  '싫어요 수. transfer_deal_comment_vote의 트리거(sync_transfer_deal_comment_vote_count)만 갱신한다';

-- 상세 화면의 "이 딜의 댓글 최신 N개"(created_at desc, id desc)를 한 인덱스로 덮는다
create index transfer_deal_comment_deal_created_idx
  on public.transfer_deal_comment (deal_id, created_at desc, id desc);
-- 탈퇴 cascade가 user_id 방향으로 훑는다
create index transfer_deal_comment_user_id_idx on public.transfer_deal_comment (user_id);
-- 대부분의 행이 루트라 부분 인덱스로 충분하다. cascade의 where parent_id = $1도 이걸 탄다
create index transfer_deal_comment_parent_id_idx
  on public.transfer_deal_comment (parent_id) where parent_id is not null;

-- ---------------------------------------------------------------------
-- 2. 답글 깊이 제한 — 정책이 아니라 트리거
--
-- ⚠ RLS의 with check에 두면 안 된다. WITH CHECK 안의 함수는 **호출자 EXECUTE 권한으로 평가**되어
--   revoke하는 순간 모든 댓글 작성이 42501로 죽고, 정책 위반은 영어 42501뿐이라 "왜 거부됐는지"를
--   말하지 못한다. 트리거는 P0001로 한국어 사유를 그대로 노출한다(toDbErrorMessage가 통과시킨다).
--
-- ⚠ **invoker다(옛 check_comment_depth는 definer였다).** 옛 댓글은 SELECT 정책이 부모 글의 생존·차단에
--   걸려 있어 부모 행을 읽으려면 RLS를 넘어야 했지만, 이제 댓글은 전부 공개라 호출자 권한으로 읽힌다.
--
-- ⚠ "트리거의 첫 줄은 명의를 확인한다"(api-and-db.md)를 **두지 않는다.** 그 규약의 이유는 에러 코드가
--   정책이 감춘 행을 드러내는 오라클이 되는 것인데, 이 트리거가 말하는 것(부모의 딜·깊이)은 누구나
--   SELECT로 읽을 수 있는 값이다 — 감춘 것이 없어 샐 것도 없다. 반대로 명의 검사를 두면 auth.uid()가
--   비는 service_role·마이그레이션 경로에서 깊이 검사가 통째로 꺼진다.
--
-- 경합 걱정 없음: parent_id는 update 권한도 정책도 없어 루트가 나중에 답글로 바뀌지 않고,
-- 부모가 동시에 삭제되면 FK가 23503으로 막는다 → 검사와 삽입 사이의 TOCTOU가 없다.
-- ---------------------------------------------------------------------
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
    raise exception '답글을 달 댓글을 찾을 수 없어요. 삭제되었을 수 있어요.' using errcode = 'P0001';
  end if;

  if v_parent_deal_id <> new.deal_id then
    raise exception '다른 이적의 댓글에는 답글을 달 수 없어요.' using errcode = 'P0001';
  end if;

  if v_parent_parent_id is not null then
    raise exception '답글에는 다시 답글을 달 수 없어요.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger transfer_deal_comment_depth_guard
  before insert on public.transfer_deal_comment
  for each row execute function public.transfer_deal_comment_check_depth();

-- ---------------------------------------------------------------------
-- 3. 좋아요·싫어요 — 행 하나가 곧 한 표
--
-- (user_id, comment_id) 복합 PK가 "1인 1표"를 겸한다. 표를 바꾸는 것은 value UPDATE,
-- 거두는 것은 delete다 — 클라이언트가 지금 내 표를 보고 셋 중 하나를 보낸다.
-- ⚠ PostgREST upsert를 쓰지 않는다 — ON CONFLICT DO UPDATE가 payload의 모든 컬럼(키 포함)에
--   UPDATE 권한을 요구한다(api-and-db.md). 키 컬럼을 열면 표를 남의 댓글로 옮길 수 있다.
-- ---------------------------------------------------------------------
create table public.transfer_deal_comment_vote (
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  comment_id bigint not null references public.transfer_deal_comment (id) on delete cascade,
  -- 1 = 좋아요, -1 = 싫어요. 0(표 없음)은 행이 없는 것으로 나타낸다
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

-- 복합 PK의 선두가 user_id라 comment_id 단독 조회(댓글 삭제 cascade · 목록 임베딩)는 인덱스를 못 탄다
create index transfer_deal_comment_vote_comment_id_idx on public.transfer_deal_comment_vote (comment_id);

comment on table public.transfer_deal_comment_vote is
  '댓글 좋아요·싫어요(1인 1표). SELECT·INSERT·UPDATE(value)·DELETE 정책이 전부 본인 행만 연다. '
  '목록 select의 transfer_deal_comment_vote(value) 임베딩이 곧 내 표다(transfer_deal_watch와 같은 트릭)';
comment on column public.transfer_deal_comment_vote.created_at is
  '처음 표를 던진 시각. INSERT grant 목록 밖이라 클라이언트가 실을 수 없다(시각 위조 차단)';

-- ---------------------------------------------------------------------
-- 4. 표 수 동기화 — 트리거가 단독 관리
--
-- ⚠ security definer가 필수다. 호출자 권한으로 돌면 댓글에 UPDATE 정책도 grant도 없어
--   남의 댓글(대부분이 그렇다)의 카운터 UPDATE가 0행으로 조용히 실패한다.
-- ⚠ RPC가 아니라 트리거인 이유: 탈퇴(auth.users → profiles → vote) cascade는 RPC를 거치지 않는다.
--   옛 like_count가 RPC 관리였다가 실제보다 큰 채 영구히 남았던 사고의 대응과 같다(20260801000004).
-- ⚠ UPDATE는 옛 값을 빼고 새 값을 더한다 — 같은 값으로의 UPDATE는 알짜 0이다.
--   comment_id가 바뀌는 UPDATE(grant가 없어 superuser만 가능하다)도 양쪽 행을 각각 고친다.
-- ⚠ 댓글이 지워져 표가 cascade로 사라지는 경로에서는 대상 댓글이 이미 없어 0행 UPDATE가 되며, 정상이다.
-- ---------------------------------------------------------------------
create or replace function public.sync_transfer_deal_comment_vote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.transfer_deal_comment
       set up_count   = up_count   - (old.value =  1)::int,
           down_count = down_count - (old.value = -1)::int
     where id = old.comment_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    update public.transfer_deal_comment
       set up_count   = up_count   + (new.value =  1)::int,
           down_count = down_count + (new.value = -1)::int
     where id = new.comment_id;
  end if;

  return null; -- after 트리거라 반환값을 쓰지 않는다
end;
$$;

create trigger transfer_deal_comment_vote_count_sync
  after insert or update or delete on public.transfer_deal_comment_vote
  for each row execute function public.sync_transfer_deal_comment_vote_count();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.transfer_deal_comment      enable row level security;
alter table public.transfer_deal_comment_vote enable row level security;

-- 감출 행이 없다 — 딜 상세가 색인 대상이라 비로그인·크롤러에게도 그대로 열린다
create policy "transfer_deal_comment_select_all" on public.transfer_deal_comment
  for select using (true);

create policy "transfer_deal_comment_insert_own" on public.transfer_deal_comment
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ⚠ 루트를 지우면 딸린 **남의 답글까지** cascade로 사라진다 — cascade는 RI 내부 트리거가 수행해
--   RLS를 적용받지 않는다(이 정책의 간접 우회로다). 포럼 관례로 수용하고, 화면의 삭제 확인 문구가
--   이 사실을 알린다(api-and-db.md "on delete cascade는 RLS를 적용받지 않는다").
create policy "transfer_deal_comment_delete_own" on public.transfer_deal_comment
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ⚠ UPDATE 정책을 두지 않는다 = 수정 경로가 없다(카운터는 definer 트리거가 넘는다).

-- 표는 본인만 본다 — 합계는 댓글의 카운터로 읽으므로 남의 표를 볼 필요가 없고, 이 정책 덕에
-- 임베딩 결과가 자동으로 "내 표"만 남는다(남의 표가 새는 사고가 구조적으로 불가능하다).
create policy "transfer_deal_comment_vote_select_own" on public.transfer_deal_comment_vote
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "transfer_deal_comment_vote_insert_own" on public.transfer_deal_comment_vote
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- with check까지 두어 표 소유권 이전을 막는다(user_id는 grant 밖이라 이중 방어다)
create policy "transfer_deal_comment_vote_update_own" on public.transfer_deal_comment_vote
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "transfer_deal_comment_vote_delete_own" on public.transfer_deal_comment_vote
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 6. 권한 위생
--
-- public 스키마 기본 권한이 anon/authenticated에 ALL이라 먼저 회수하고 필요한 것만 다시 준다.
-- ---------------------------------------------------------------------
revoke all on public.transfer_deal_comment      from anon, authenticated;
revoke all on public.transfer_deal_comment_vote from anon, authenticated;

grant select on public.transfer_deal_comment to anon, authenticated;
-- 카운터 2개·created_at은 뺀다 — 트리거와 default만 채운다(위조 차단)
grant insert (deal_id, user_id, parent_id, content) on public.transfer_deal_comment to authenticated;
grant delete on public.transfer_deal_comment to authenticated;

-- ⚠ **anon에도 SELECT를 준다** — transfer_deal_watch와 같은 형태다. 행을 막는 것은 정책
--   (`to authenticated`)이고 grant는 임베딩의 통로다. 빼면 댓글 목록의 내 표 임베딩이 42501로 죽어
--   비로그인에게 댓글이 통째로 안 보인다. anon은 정책에서 걸려 항상 빈 배열을 받는다.
grant select (user_id, comment_id, value) on public.transfer_deal_comment_vote to anon, authenticated;
grant insert (user_id, comment_id, value) on public.transfer_deal_comment_vote to authenticated;
-- 표를 바꾸는 것만 — 키 컬럼을 열면 표를 다른 댓글·다른 사람으로 옮길 수 있다
grant update (value) on public.transfer_deal_comment_vote to authenticated;
grant delete on public.transfer_deal_comment_vote to authenticated;

-- 트리거 함수의 PUBLIC 기본 EXECUTE를 닫는다(rls.sql 17d 전수 가드). 트리거 발화는 EXECUTE를
-- 검사하지 않으므로 동작에는 영향이 없다.
revoke execute on function public.transfer_deal_comment_check_depth()      from public, anon, authenticated;
revoke execute on function public.sync_transfer_deal_comment_vote_count()  from public, anon, authenticated;

-- identity 시퀀스는 테이블 revoke에 딸려오지 않는다
revoke all on all sequences in schema public from anon, authenticated;

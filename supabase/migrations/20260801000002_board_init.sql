-- =====================================================================
-- 게시판 — post / comment / post_like
--
-- 설계 원칙
--  * 데이터 접근은 브라우저 supabase 클라이언트가 직접 수행한다.
--    Route Handler라는 중간 검증층이 없으므로 RLS + 컬럼 권한이 유일한 방어선이다.
--  * 읽기는 전체 공개, 쓰기는 본인 것만.
--  * like_count / comment_count는 비정규화 카운터 —
--    like_count는 toggle_post_like RPC가, comment_count는 트리거가 단독 관리한다.
--    일반 유저에게는 이 두 컬럼의 UPDATE 권한을 주지 않는다.
--  * 유저 참조는 auth.users가 아니라 public.profiles를 향한다.
--    profiles.id가 auth.users(id)를 cascade로 물고 있어 삭제 연쇄는 동일하고,
--    PostgREST가 관계를 인식해 닉네임을 임베딩할 수 있게 된다.
-- =====================================================================

-- ========== 게시글 ==========
create table public.post (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 20000),
  like_count int not null default 0 check (like_count >= 0),
  comment_count int not null default 0 check (comment_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table  public.post is '게시글 — content는 마크다운 원문(렌더는 클라이언트 react-markdown)';
comment on column public.post.like_count    is 'toggle_post_like RPC만 갱신. 일반 유저에게 update 권한 없음';
comment on column public.post.comment_count is 'comment 트리거만 갱신. 일반 유저에게 update 권한 없음';
comment on column public.post.updated_at    is 'before update 트리거가 갱신. created_at과 다르면 "수정됨"';
comment on column public.post.deleted_at    is 'null = 살아있는 글. 소프트 삭제 — hard delete 경로는 없다';

-- 목록은 항상 "살아있는 글만 최신순" → 부분 인덱스로 죽은 행을 인덱스에서 제외
create index post_alive_created_at_idx on public.post (created_at desc) where deleted_at is null;
create index post_author_id_idx        on public.post (author_id);

-- ========== 댓글 ==========
create table public.comment (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.post (id) on delete cascade,
  user_id uuid   not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- 상세 화면의 "이 글의 댓글을 오래된 순으로"를 한 인덱스로 커버
create index comment_post_id_created_at_idx on public.comment (post_id, created_at);
create index comment_user_id_idx            on public.comment (user_id);

-- ========== 좋아요 ==========
-- (post_id, user_id) 복합 PK가 "한 사람이 한 번만" 제약을 겸한다
create table public.post_like (
  post_id bigint not null references public.post (id) on delete cascade,
  user_id uuid   not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 복합 PK의 선두가 post_id라 user_id 단독 조회는 인덱스를 못 탄다 → 별도 인덱스
create index post_like_user_id_idx on public.post_like (user_id);

-- =====================================================================
-- RLS
--
-- (select auth.uid()) 서브쿼리 래핑은 Supabase 공식 성능 권고 —
-- 그냥 auth.uid()면 행마다 재평가되지만, 감싸면 InitPlan으로 승격되어 쿼리당 1회다.
-- =====================================================================
alter table public.post      enable row level security;
alter table public.comment   enable row level security;
alter table public.post_like enable row level security;

-- ---------- post ----------
-- 삭제 필터를 정책에 박는다 — 조회마다 .is("deleted_at", null)을 붙이는 것보다 안전하다
-- (한 곳만 빠뜨려도 삭제된 글이 새는 구조를 원천 차단)
create policy "post_select_alive" on public.post
  for select using (deleted_at is null);

create policy "post_insert_own" on public.post
  for insert to authenticated
  with check (author_id = (select auth.uid()));

-- with check까지 두어야 author_id 바꿔치기(글 소유권 이전)를 막는다
create policy "post_update_own" on public.post
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- ⚠ DELETE 정책을 두지 않는다 — post의 삭제는 deleted_at을 찍는 소프트 삭제뿐이다.
--   두 경로가 공존하면 어느 쪽이 진짜 삭제인지 모호해지고,
--   hard delete는 댓글·좋아요까지 cascade로 날려 복구가 불가능해진다.
--
-- ⚠ 그 소프트 삭제도 클라이언트가 직접 UPDATE할 수 없다. Postgres는 UPDATE의 **새 행**에
--   SELECT 정책까지 적용하므로, deleted_at을 채운 행이 post_select_alive를 통과하지 못해
--   "new row violates row-level security policy"로 거부된다(실측 확인).
--   → soft_delete_post RPC(board_rpc 마이그레이션)가 담당한다.
--   정책을 느슨하게 푸는 대신 RPC로 내린 이유: 정책을 풀면
--   "deleted_at is null" 필터가 모든 조회 쿼리로 흩어져 한 곳만 빠뜨려도 삭제된 글이 샌다.

-- ---------- comment ----------
create policy "comment_select_all" on public.comment
  for select using (true);

create policy "comment_insert_own" on public.comment
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 댓글 수정은 미지원 — UPDATE 정책을 두지 않는 것으로 차단한다
create policy "comment_delete_own" on public.comment
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- post_like ----------
-- SELECT 정책만 둔다. 총 좋아요 수는 post.like_count로 읽으므로 남의 행을 볼 필요가 없고,
-- 이 정책 덕에 임베딩(post_like(user_id)) 결과가 자동으로 내 행만 남는다 →
-- "내 user_id로 필터"를 잊어 남의 좋아요가 새는 사고가 구조적으로 불가능하다.
-- INSERT/DELETE 정책이 없으므로 클라이언트 직접 쓰기는 전부 차단되고,
-- SECURITY DEFINER인 toggle_post_like RPC만 이 테이블을 변경할 수 있다.
create policy "post_like_select_own" on public.post_like
  for select to authenticated
  using (user_id = (select auth.uid()));

-- =====================================================================
-- 컬럼 권한 — RLS만으로는 막히지 않는 구멍을 닫는다
--
-- ⚠ post_update_own 정책만 있으면 "작성자가 자기 글의 like_count를 9999로 UPDATE"가
--   통과한다. 클라이언트가 supabase를 직접 호출하는 구조라 실제로 가능한 공격이다.
--   → 카운터·타임스탬프 컬럼을 UPDATE 대상에서 제외한다.
--
-- Supabase는 public 스키마 신규 테이블에 anon/authenticated ALL을 기본 부여하므로
-- 먼저 회수하고 필요한 컬럼만 다시 준다.
-- =====================================================================
revoke insert, update, delete on public.post from anon, authenticated;
grant  insert (author_id, title, content) on public.post to authenticated;
-- 클라이언트가 직접 쓸 수 있는 것은 제목·본문뿐이다.
-- 카운터 2개·타임스탬프 3개는 전부 제외 — RPC와 트리거만 건드린다.
grant  update (title, content)            on public.post to authenticated;

revoke insert, update on public.comment from anon, authenticated;
grant  insert (post_id, user_id, content) on public.comment to authenticated;

-- 좋아요는 RPC 전용 — 직접 쓰기 경로를 테이블 권한 레벨에서도 닫는다
revoke insert, update, delete on public.post_like from anon, authenticated;

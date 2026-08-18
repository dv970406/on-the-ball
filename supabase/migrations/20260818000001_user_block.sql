-- =====================================================================
-- 차단 — 내 화면에서 상대의 글·댓글을 감춘다 (단방향)
--
-- 설계 원칙
--  * **숨김은 정책이 한다.** 조회 훅마다 필터를 붙이면 한 곳만 빠뜨려도 새는데, 그건
--    소프트 삭제에서 이미 결론을 낸 문제다(20260801000002의 post_select_alive 주석).
--    차단은 목록·상세·댓글·서버 메타데이터 조회·수정 페이지의 존재 확인까지 **다섯 곳**에
--    동시에 걸려 위험이 더 크다. 게다가 클라이언트 필터는 `.limit(30)` **뒤에** 오므로
--    차단분을 걷어내면 페이지가 쪼그라들고 그 자리를 채울 방법이 없다(페이지네이션 없음).
--
--  * **단방향이다.** 차단당한 쪽에는 아무 제약이 없고(내 글에 댓글·좋아요 그대로),
--    자기가 차단당했는지 알 수도 없다 — SELECT 정책이 blocker 본인 행만 연다.
--
--  * **자기 자신은 차단할 수 없다(CHECK).** 취향이 아니라 **정책의 전제**다. Postgres는
--    UPDATE의 **새 행**에도 SELECT 정책을 적용하므로(20260801000002:95의 그 성질),
--    자기차단이 가능하면 `post_select_visible`을 새 행이 통과하지 못해 **자기 글 수정이
--    통째로 막힌다**(실측: CHECK를 뺀 채 자기차단하면 `UPDATE 0`에 내 글이 전부 사라진다).
--    이 CHECK가 사라지는 회귀는 rls.sql 섹션 28의 **[❌차단] 자기 자신 차단** 검사가 잡는다 —
--    CHECK가 없으면 그 insert가 성공해 run-rls.sh의 ②(차단 기대인데 통과)에 걸린다.
--
--  * **정책에 인라인 exists를 쓰지 않는다.** 상관관계를 잃어 비상관화되는 것(20260801000004의
--    실측 4.76ms vs 0.61ms)도 이유지만, 여기서는 그보다 큰 것이 걸린다 — 정책이 다른 테이블을
--    직접 참조하면 **호출자의 SELECT 권한과 그 테이블의 RLS까지 함께 걸린다**(user_block이
--    자기 정책을 다시 평가한다). stable security definer 헬퍼가 둘을 한꺼번에 끊는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

create table public.user_block (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 복합 PK가 "한 사람을 두 번 차단할 수 없다"를 겸한다(post_like와 같은 형태)
  primary key (blocker_id, blocked_id),
  constraint user_block_not_self check (blocker_id <> blocked_id)
);

-- 복합 PK의 선두가 blocker_id라 blocked_id 단독 조회는 인덱스를 못 탄다.
-- 탈퇴 cascade가 그 방향으로 훑는다(post_like_user_id_idx와 같은 사유).
create index user_block_blocked_id_idx on public.user_block (blocked_id);

comment on table public.user_block is
  '차단 — blocker의 화면에서 blocked의 글·댓글을 감춘다. 단방향이고 상대에게 알리지 않는다 '
  '(SELECT 정책이 본인 행만 연다). 숨김 판정은 is_blocked()가 단독으로 갖는다';

-- ---------------------------------------------------------------------
-- 2. 정책 헬퍼 — "지금 이 요청자가 이 유저를 차단했는가"
--
-- post_is_alive와 같은 형태·같은 이유다(위 머리말의 인라인 exists 항목 참고).
-- ---------------------------------------------------------------------
create or replace function public.is_blocked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_block b
     where b.blocker_id = (select auth.uid())
       and b.blocked_id = p_user_id
  )
$$;

comment on function public.is_blocked(uuid) is
  'post·comment의 SELECT 정책이 부르는 숨김 판정. anon에 EXECUTE가 열려 있다 '
  '— rls.sql 섹션 17d 화이트리스트에 등재된 이유는 아래 grant 주석에';

revoke execute on function public.is_blocked(uuid) from public;
-- ⚠ **anon에도 연다.** post의 SELECT 정책에 `to` 절이 없어 비로그인 조회도 이 함수를 지난다
--   — 닫으면 목록·상세가 통째로 42501로 죽는다. 비로그인은 auth.uid()가 null이라 항상
--   false를 받는다(= 아무것도 감춰지지 않는다). 함수가 입력 외의 정보를 돌려주지 않으므로
--   열어도 안전하다는 판단은 post_is_alive·has_visible_char와 같다.
grant execute on function public.is_blocked(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------
alter table public.user_block enable row level security;

-- ⚠ 반대 방향(누가 나를 차단했나)을 열지 않는다 — 열면 차단이 상대에게 드러나
--   "단방향이고 알리지 않는다"는 계약이 깨진다.
create policy "user_block_select_own" on public.user_block
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "user_block_insert_own" on public.user_block
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "user_block_delete_own" on public.user_block
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ⚠ UPDATE 정책을 두지 않는다 = 차단 행은 불변이다(해제는 delete).
--   created_at 위조 경로도 이것으로 함께 닫힌다.

-- ---------------------------------------------------------------------
-- 4. 기존 SELECT 정책 교체
--
-- ⚠ 이름을 바꾼다 — 조건이 둘이 됐는데 `alive`로 부르면 이름이 거짓말을 한다.
-- ---------------------------------------------------------------------

drop policy "post_select_alive" on public.post;
create policy "post_select_visible" on public.post
  for select using (deleted_at is null and not public.is_blocked(author_id));

-- ⚠ comment의 작성자 컬럼은 **user_id**다(post의 author_id가 아니다).
drop policy "comment_select_alive_post" on public.comment;
create policy "comment_select_visible" on public.comment
  for select using (public.post_is_alive(post_id) and not public.is_blocked(user_id));

/*
 * ⚠ **정책에 함수가 들어가면 정렬 인덱스가 없는 목록이 무너진다.**
 *
 *   `is_blocked`는 definer라 인라인되지 않는 함수 호출이고, RLS 술어는 security qual이라
 *   **다른 필터보다 먼저** 평가된다. 그래서 지원 인덱스가 없는 정렬은 테이블 전체에 대해
 *   함수를 돌린다 — 글 5만 건 기준 인기순이 **8.7ms → 151.6ms(17배)** 로 뛰었다(실측).
 *   최신순은 `post_alive_created_idx`가 순서를 주어 30행만 훑으므로 0.3ms로 멀쩡했다.
 *
 *   → 나머지 두 정렬에도 같은 형태의 부분 인덱스를 준다. 인덱스가 순서를 주면 함수가
 *     limit만큼만 돌아 **0.33ms**로 돌아온다(실측). 덤으로 차단과 무관한 기존 seq scan도 사라진다.
 *
 *   ⚠ 이 인덱스들은 **말머리 필터가 없는** 정렬을 덮는다. 말머리+인기순 조합이 느려지면
 *     `post_alive_category_created_idx`처럼 선두에 category를 둔 인덱스를 그때 더한다 —
 *     조합마다 미리 깔지 않는다.
 */
create index post_alive_like_idx    on public.post (like_count desc, created_at desc, id desc)
  where deleted_at is null;
create index post_alive_comment_idx on public.post (comment_count desc, created_at desc, id desc)
  where deleted_at is null;

/*
 * ⚠ **post_is_alive에는 차단 조건을 넣지 않는다.**
 *   이 함수는 comment·poll·poll_vote의 **쓰기** 정책과 poll_results가 함께 쓴다. 뷰어에
 *   종속된 조건이 들어가면 "이 글에 댓글을 달 수 있는가"가 보는 사람마다 달라진다.
 *
 * ⚠ **profiles_select_all도 그대로 둔다.**
 *   차단한 사람의 닉네임까지 감추면 /profile의 "차단한 사용자" 목록이 통째로 비어
 *   **해제할 대상을 알아볼 수 없게 된다**(임베딩이 null로 온다).
 *
 * ⚠ definer 함수 넷(toggle_post_like·increment_post_view·create_post_with_poll·
 *   poll_results)에는 차단이 닿지 않는다. **의도된 경계**다 — 넷 다 "내게 보이지 않아
 *   도달 경로가 없는 글"에만 남아 있고, 여기에 차단을 넣으면 뷰어 종속성이 definer 전반으로
 *   번져 보안 표면이 넓어진다.
 */

-- ---------------------------------------------------------------------
-- 5. 권한 위생
--
-- public 스키마 기본 권한이 anon/authenticated에 ALL이라, revoke를 한 번만 잊어도
-- 즉시 구멍이 된다(rls.sql 섹션 17이 전수로 잡는다).
-- ---------------------------------------------------------------------
revoke all on public.user_block from anon, authenticated;

-- ⚠ anon에는 select도 주지 않는다 — post_like·poll_vote와 달리 **임베딩 소비자가 없다**
--   (차단 목록은 로그인한 본인만 본다). 열 이유가 없으면 열지 않는다.
grant select on public.user_block to authenticated;
grant insert (blocker_id, blocked_id) on public.user_block to authenticated;
grant delete on public.user_block to authenticated;

-- identity 시퀀스는 테이블 revoke에 딸려오지 않는다
revoke all on all sequences in schema public from anon, authenticated;

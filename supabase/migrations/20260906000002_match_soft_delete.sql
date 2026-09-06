-- =====================================================================
-- 승부예측 — 소프트 삭제 · 수정 시각 · 동기화 잠금
--
-- 어드민이 경기를 고치고 지울 수 있게 하려면 세 컬럼이 필요하고, 셋의
-- 뜻이 서로 다르다.
--
--   voided_at       경기가 실제로 취소·몰수됐다(세상의 사실).
--                   동기화(matchState)가 소유하고 매 실행이 덮어쓴다.
--                   화면에는 "취소"로 **보인다**.
--   deleted_at      우리 DB의 이 행이 잘못됐다(운영 판단). 어드민이 소유한다.
--                   화면에서 **사라진다**.
--   admin_locked_at 어드민이 손댔으니 동기화가 이 행을 건드리지 마라.
--
-- ⚠ **admin_locked_at이 없으면 어드민 수정이 조용히 원복된다.**
--   scripts/sync-matches.mjs의 toRow()가 season·matchday·팀·kickoff_at·
--   스코어·finished_at·voided_at을 전부 페이로드에 실어 on conflict do
--   update하기 때문이다. 화면은 "저장됐어요"라 말하고 몇 시간 뒤 값이
--   돌아온다 — 재현도 로그도 없이 터지는 종류다.
--
-- ⚠ deleted_at은 그 payload에 없으므로 **동기화가 보존한다**(삭제한 경기가
--   되살아나지 않는다). 대신 삭제된 경기도 계속 갱신되는데, 복구하면 최신
--   데이터가 있다는 뜻이라 해가 없다.
--
-- ⚠ result 생성식에 deleted_at을 넣지 않는다. 생성식 변경은 컬럼 drop/add
--   (전 테이블 rewrite)를 부르는데, 행 자체가 안 보이면 채점에서 이미
--   빠지므로 얻는 것이 없다.
-- =====================================================================

alter table public.match
  add column updated_at      timestamptz not null default now(),
  add column deleted_at      timestamptz,
  add column admin_locked_at timestamptz;

comment on column public.match.deleted_at is
  '운영 판단으로 감춘 행. voided_at(실제 경기 취소)과 다르다 — 이건 화면에서 사라진다';
comment on column public.match.admin_locked_at is
  '어드민이 수정한 행. sync-matches.mjs가 이 행을 upsert 페이로드에서 제외한다';

-- ---------------------------------------------------------------------
-- 수정 시각
--
-- ⚠ **WHEN 절에 컬럼을 명시한다.** 조건 없이 걸면 동기화 한 번에 380행의
--   updated_at이 전부 갱신된다. 지금 app/sitemap.ts는 lastModified로
--   finished_at을 쓰지만(미래 시각 함정을 피하려고), 누군가 "이제
--   updated_at이 있으니 그걸 쓰자"고 바꾸는 순간 **동기화마다 "전 경기가
--   방금 바뀌었다"는 거짓 신호**가 크롤러에게 나간다.
--
--   빠지는 컬럼과 사유:
--     deleted_at      삭제를 "수정됨"으로 분류하지 않는다(post 선례)
--     admin_locked_at 잠금은 내용 변경이 아니다
--     live_minute     라이브 폴링이 5분마다 흔든다
-- ---------------------------------------------------------------------
create trigger match_touch_updated_at
  before update on public.match
  for each row
  when ((old.season, old.matchday, old.home_team, old.away_team, old.kickoff_at,
         old.home_score, old.away_score, old.finished_at, old.voided_at)
     is distinct from
        (new.season, new.matchday, new.home_team, new.away_team, new.kickoff_at,
         new.home_score, new.away_score, new.finished_at, new.voided_at))
  execute function public.touch_updated_at();

-- 목록은 살아 있는 경기만 훑는다 (post_alive_* 부분 인덱스와 같은 형태)
create index match_alive_kickoff_idx on public.match (kickoff_at) where deleted_at is null;

-- ---------------------------------------------------------------------
-- 부모 생존 판정 — 자식 정책이 공유한다
--
-- ⚠ **인라인 exists를 쓰지 않는다.** 정책 안의 상관 서브쿼리는 security
--   barrier 안으로 들어가면서 등가류가 전파되지 않아 부모 테이블 전체를
--   훑는다(post_is_alive를 만든 것과 같은 사유 — 실측 4.76ms vs 0.61ms).
--
-- ⚠ **anon에 EXECUTE를 연다.** 자식 정책에 `to` 절이 없어 비로그인 조회도
--   이 함수를 지나기 때문이다 — 닫으면 크롤러의 경기 상세가 통째로 42501로
--   죽는다. anon은 이 함수로 아무것도 알아낼 수 없다(입력한 id의 생존
--   여부만 돌려주고, 그건 match 조회로 이미 알 수 있다).
--   → `rls.sql` 섹션 17d의 화이트리스트가 이 함수만큼 늘어난다.
-- ---------------------------------------------------------------------
create or replace function public.match_is_alive(p_match_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.match m
     where m.id = p_match_id and m.deleted_at is null
  )
$$;

revoke execute on function public.match_is_alive(bigint) from public;
grant  execute on function public.match_is_alive(bigint) to anon, authenticated;

-- ---------------------------------------------------------------------
-- SELECT 정책 — 삭제된 경기는 아무에게도 보이지 않는다
--
-- ⚠ **`or public.is_admin()`을 얹지 않는다.** 그러면 관리자가 /matches를
--   열었을 때 삭제한 경기가 그대로 섞여 보이고(조회 훅에는 deleted_at
--   필터가 없다 — 정책에 맡기는 것이 이 프로젝트의 규약이다),
--   useMyAccuracyQuery의 match!inner 때문에 **관리자의 적중률만 다른
--   분모로** 계산된다. 관리자야말로 사용자와 같은 화면을 봐야 하는
--   사람인데 정확히 그 사람의 시야만 조용히 오염된다.
--   → 어드민 조회는 별도 definer RPC가 갖는다(20260906000005).
-- ---------------------------------------------------------------------
drop policy "match_select_all" on public.match;
create policy "match_select_alive" on public.match
  for select using (deleted_at is null);

-- ---------------------------------------------------------------------
-- 자식 — 부모의 소프트 삭제에 함께 묶는다
--
-- ⚠ 안 묶으면 삭제된 경기의 라인업·사건·스탯이 REST로 그대로 읽힌다.
--   화면 경로는 404라 아무도 눈치채지 못한다 — comment가 실제로 그렇게
--   샜던 사고의 재현이다(api-and-db.md "부모의 소프트 삭제는 자식 정책까지
--   함께 묶어야 한다").
--
-- ⚠ 넷 다 match_id 컬럼을 직접 갖고 있어 한 번만 타면 된다.
-- ---------------------------------------------------------------------
drop policy "match_lineup_select_all"        on public.match_lineup;
drop policy "match_lineup_player_select_all" on public.match_lineup_player;
drop policy "match_event_select_all"         on public.match_event;
drop policy "match_stat_select_all"          on public.match_stat;

create policy "match_lineup_select_alive" on public.match_lineup
  for select using (public.match_is_alive(match_id));

create policy "match_lineup_player_select_alive" on public.match_lineup_player
  for select using (public.match_is_alive(match_id));

create policy "match_event_select_alive" on public.match_event
  for select using (public.match_is_alive(match_id));

create policy "match_stat_select_alive" on public.match_stat
  for select using (public.match_is_alive(match_id));

-- ---------------------------------------------------------------------
-- definer 함수 — RLS가 닿지 않으므로 삭제 판정을 안에서 직접 한다
--
-- ⚠ match_prediction_results는 **anon에 열려 있다.** 빠뜨리면 id를 훑는
--   것만으로 "삭제된 경기 중 예측이 있던 것"이 식별된다 —
--   post_poll_results가 post_is_alive를 빠뜨려 삭제된 글이 새던 사고와
--   같은 클래스다.
-- ---------------------------------------------------------------------
create or replace function public.match_is_open(p_match_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.match m
     where m.id = p_match_id
       and m.kickoff_at > now()
       -- 취소된 경기에는 새로 예측할 수 없다
       and m.voided_at is null
       -- 감춘 경기도 마찬가지다 (definer라 RLS가 닿지 않는다)
       and m.deleted_at is null
  )
$$;

create or replace function public.match_prediction_results(p_match_id bigint)
returns table(pick public.match_pick, vote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.pick, count(*)
    from public.match_prediction p
   where p.match_id = p_match_id
     and exists (
       select 1 from public.match m
        where m.id = p_match_id
          and m.kickoff_at <= now()
          -- ⚠ voided_at은 일부러 보지 않는다(취소돼도 던져진 예측은 실재했다).
          --   deleted_at은 본다 — 그 행은 존재하지 않는 것으로 다룬다.
          and m.deleted_at is null
     )
   group by p.pick
$$;

notify pgrst, 'reload schema';

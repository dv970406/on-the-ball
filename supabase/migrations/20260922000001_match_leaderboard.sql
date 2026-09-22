-- =====================================================================
-- 승부예측 랭킹 — 시즌·라운드별 적중 순위
--
-- 지금까지 적중률은 "나"만 볼 수 있었다(`match_prediction`의 SELECT 정책이 "내 행만").
-- 랭킹은 **남의 적중 수를 세야** 성립하므로 그 경계를 넘는 집계가 필요하다 →
-- `match_prediction_results`와 같은 자리(집계 읽기 definer)에 함수 하나를 더한다.
--
-- ⚠ **카운터·랭킹 테이블을 만들지 않는다.** `20260830000002`가 적어 둔 판단 그대로다 —
--   적중 수를 흔드는 경로가 다섯이고(예측 생성·변경·채점·**스코어 정정**·무효화, 그리고
--   탈퇴 cascade), 어긋날 값을 두면 `like_count`의 사고를 되풀이한다. 원본에서 그때그때
--   센다. 비로그인 요청은 서버가 Data Cache(30초)에 태우므로 크롤러가 DB를 두드리지 않는다.
--   ⚠ 느려지는 날(참여자 × 시즌 경기 수가 커지는 날) 머티리얼라이즈드 뷰로 옮긴다 —
--     그때도 원본은 그대로이고 파생만 늦게 만든다.
--
-- 순위 규칙 (이 함수가 단독으로 소유한다 — 화면은 받은 순위를 그리기만 한다):
--   1. 적중 수가 많을수록 앞선다.
--   2. 같으면 **채점된 예측 수가 적을수록** 앞선다(같은 적중을 더 적은 시도로 냈다).
--   3. 둘 다 같으면 **공동 순위**다(`rank()` — 1, 1, 3). 화면 순서만 user_id로 고정한다.
--
-- ⚠ 적중률(%)로 순위를 매기지 않는다. 1경기 1적중이 100%로 1등이 되고, 그걸 막으려면
--   "최소 N경기" 같은 임의의 문턱이 필요해진다. 적중 수 기준이면 참여가 곧 기회라
--   늦게 합류한 사람도 라운드 랭킹에서 바로 경쟁할 수 있다(시즌을 나눈 것과 같은 이유).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 집계 — **채점이 끝난 경기만 센다**
--
-- ⚠ **킥오프가 지난 경기만 센다 — `result`만 믿지 않는다.** "킥오프 전에는 스코어가 없다"를
--   DB가 강제하지 않는다. 어드민 경로는 막혀 있지만(`admin_update_match` — rls.sql 33j)
--   동기화는 제공자가 준 `kickoff_at`과 종료 상태를 그대로 쓴다 — 제공자가 "종료 + 미래 날짜"를
--   주는 순간(데이터 오류·종료 후 재편성) 예측이 아직 열린 경기의 적중이 순위에 잡혀
--   **마감 전 남의 선택이 새는 옆문**이 된다. 판정을 쓰는 쪽에 맡기지 않고 여기서 직접 막는다
--   (`match_prediction_results`가 킥오프로 게이팅하는 것과 같은 축이다).
-- ⚠ 돌려주는 것은 개인별 합계이고 경기별 선택은 없다. **다만 경기별 적중 여부는 추론된다** —
--   라운드에 채점된 경기가 하나뿐일 때 라운드 판을 부르거나, 채점 전후의 두 판을 비교하면
--   사용자마다 그 경기를 맞혔는지가 보인다. 전부 **킥오프 후**의 사실이라(분포도 그때 공개된다)
--   적중률을 오염시키지 않으므로 수용한다. 막으려면 "라운드가 전부 채점된 뒤에만"류의 게이트가
--   필요한데, 그러면 경기 중 순위가 움직이는 재미를 잃는다.
--
-- ⚠ definer라 RLS가 닿지 않으므로 **삭제된 경기를 함수 안에서 직접 거른다**
--   (`match_prediction_results`가 `deleted_at`을 안에서 보는 것과 같은 이유 — 빠뜨리면
--   어드민이 감춘 경기의 적중이 순위에 그대로 남는다).
-- ⚠ 무효 경기는 `result`가 이미 null이라 따로 거르지 않는다 — DB가 두 술어를 하나로
--   접어 둔 덕이다(`useMyAccuracyQuery`와 같은 판정이라 내 적중률과 랭킹의 숫자가 갈리지 않는다).
--
-- ⚠ **차단을 보지 않는다.** 차단은 글·댓글에 거는 개인 취향 필터이고, definer에 뷰어
--   종속성을 넣으면 그 성질이 definer 전반으로 번진다(`api-and-db.md`의 "차단이 닿지 않는 곳").
--
-- 인자:
--   p_season   '2025-26' 형태. 없는 시즌이면 0행이다.
--   p_matchday null이면 시즌 전체, 값이 있으면 그 라운드만.
--   p_limit    상위 몇 명까지. **1~100으로 클램프한다** — 인자를 믿으면 한 요청으로
--              참여자 전원을 긁어 가는 응답이 된다(공개 정보지만 크기가 무한정이다).
--
-- ⚠ **호출자 본인의 행은 상한 밖이어도 함께 돌려준다**(`is_me`). "나는 몇 등인가"가 이
--   기능의 절반인데, 따로 부르게 하면 두 호출이 서로 다른 순간의 순위를 볼 수 있다.
--   비로그인은 `auth.uid()`가 null이라 `is_me`가 전부 false다(`is not distinct from`이라
--   null이 새지 않는다 — `=`이면 null이 나와 화면의 불리언이 셋이 된다).
-- ---------------------------------------------------------------------
create or replace function public.match_leaderboard(
  p_season   text,
  p_matchday smallint default null,
  p_limit    integer  default 50
)
returns table (
  rank        bigint,
  user_id     uuid,
  nickname    text,
  avatar_path text,
  hits        bigint,
  total       bigint,
  is_me       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with scored as (
    select p.user_id,
           count(*) filter (where p.pick = m.result) as hits,
           count(*)                                  as total
      from public.match_prediction p
      join public.match m on m.id = p.match_id
     where m.season = p_season
       and (p_matchday is null or m.matchday = p_matchday)
       and m.result is not null
       and m.kickoff_at <= now()
       and m.deleted_at is null
     group by p.user_id
  ),
  ranked as (
    select s.user_id, s.hits, s.total,
           rank()       over (order by s.hits desc, s.total asc)            as rank,
           -- 화면 순서의 고정 — 공동 순위끼리 요청마다 자리가 바뀌면 목록이 흔들린다
           row_number() over (order by s.hits desc, s.total asc, s.user_id) as ord
      from scored s
  )
  select r.rank, r.user_id, pr.nickname, pr.avatar_path, r.hits, r.total,
         r.user_id is not distinct from (select auth.uid()) as is_me
    from ranked r
    join public.profiles pr on pr.id = r.user_id
   where r.ord <= least(greatest(coalesce(p_limit, 50), 1), 100)
      or r.user_id = (select auth.uid())
   order by r.ord
$$;

comment on function public.match_leaderboard(text, smallint, integer) is
  '승부예측 랭킹. 채점된 경기(result not null, 킥오프 경과, 삭제 제외)의 적중 수 → 적은 예측 수 순. '
  '개인별 합계만 돌려주고 경기별 선택은 드러내지 않는다(적중 여부는 차분으로 추론된다 — 킥오프 후라 수용). 호출자 본인의 행은 상한 밖이어도 '
  '함께 온다(is_me). anon에 열려 있다 — 비로그인·크롤러가 보는 공개 콘텐츠다';

-- ---------------------------------------------------------------------
-- 2. 권한
--
-- ⚠ **anon에 연다.** 랭킹은 비로그인도 보는 공개 콘텐츠이고 크롤러가 색인한다
--   (`match_prediction_results`가 킥오프 후 비로그인에게 열린 것과 같은 판단).
--   → `rls.sql` 섹션 17d의 화이트리스트와 `api-and-db.md`의 anon EXECUTE 표를 함께 늘렸다.
--   안전한 근거: 입력(시즌·라운드) 외에 아무것도 받지 않고, 돌려주는 것은 이미 공개인
--   닉네임·아바타 경로와 **킥오프가 지나 채점이 끝난** 경기의 합계뿐이다.
-- ---------------------------------------------------------------------
revoke execute on function public.match_leaderboard(text, smallint, integer) from public;
grant  execute on function public.match_leaderboard(text, smallint, integer) to anon, authenticated;

notify pgrst, 'reload schema';

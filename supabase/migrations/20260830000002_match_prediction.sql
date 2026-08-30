-- ---------------------------------------------------------------------
-- 승부예측 — team · match · match_prediction
--
-- 입축구(`survey`)와 **일부러 분리한다.** 표면적으로는 둘 다 "선택지를 고르고 집계를 본다"
-- 이지만, 결과 공개의 **축이 정반대**다:
--
--   입축구  : 참여했는가 → 참여자만 본다 (마감 전후가 같다)
--   승부예측: 킥오프가 지났는가 → 전에는 아무도, 후에는 비로그인 포함 전부
--
-- 마감 전에 남의 예측 분포가 보이면 다수파를 따라가 **적중률이 오염된다** — 게임의 전제가
-- 무너진다. 반대로 마감 후에는 "커뮤니티의 68%가 이렇게 봤다"가 그 자체로 공유되는
-- 콘텐츠라 비로그인에게도 열어야 한다. 한 테이블에 두면 이 분기가 definer 함수 안으로
-- 들어가는데, 그 함수는 RLS를 우회하는 자리라 분기를 넣을수록 위험이 곱해진다.
--
-- 갈리는 이유가 셋 더 있다 — 마감 시각의 소유자(자기 자신 ↔ 외부 경기), 부모의 유무,
-- 그리고 쓰기 주체(마이그레이션 ↔ 자동 동기화).
--
-- ⚠ **EPL 한 리그로 시작한다.** 범위를 넓히면 참여가 흩어져 "68%"의 표본이 묽어지는데,
--   그 숫자가 이 기능의 콘텐츠 자체다. `competition` 컬럼을 두지 않은 이유이기도 하다 —
--   지금 모든 행이 EPL이라 나중에 `update ... set competition = 'epl'` 한 줄로 정확히
--   백필된다(백필이 가능한 것은 지금 만들지 않는다).
--
-- ⚠ **적중률 카운터도 뱃지 테이블도 두지 않는다.** 카운터를 흔드는 경로가 다섯이고
--   (예측 생성·변경·채점·**스코어 정정**·무효화, 그리고 탈퇴 cascade), `like_count`는
--   그중 **하나**(cascade)에서 어긋나 영구히 과대로 남았다. 여기 필요한 값은 전부
--   원본에서 다시 세어지고, 정말 카운터가 필요해지는 날 `update ... from (select …)`
--   한 번으로 과거까지 채워진다 → **원본은 지금 완벽하게, 파생은 최대한 늦게.**
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. 예측 값
--
-- ⚠ 여기는 enum이 맞다 — 값이 셋으로 **닫혀 있고 늘어날 일이 없다.** 축구의 정규시간
--   결과는 홈승·무·원정승이 전부다. `post_category`와 같은 판단이고, 아래 `team`이
--   반대 판단(lookup)인 것과 대비된다.
-- ---------------------------------------------------------------------
create type public.match_pick as enum ('home', 'draw', 'away');

-- ---------------------------------------------------------------------
-- 2. 팀 — **enum이 아니라 lookup 테이블이다**
--
-- 말머리(`post_category`)와 갈리는 지점이 규약 그대로다: 값이 스무 개를 넘고, 외부 API
-- id 같은 **부가 정보를 데이터로 들어야** 한다. enum이면 `add value`만 되고 지울 수
-- 없어 승격·강등마다 죽은 값이 영구히 쌓인다.
--
-- ⚠ **정수 id가 아니라 `code text primary key`다.** 저장값이 `liverpool` 그대로 읽혀야
--   `match` 행을 열었을 때 조인 없이 뜻을 안다(api-and-db.md의 lookup 규약).
-- ---------------------------------------------------------------------
create table public.team (
  -- ⚠ URL·로그에 그대로 실릴 수 있는 값이라 슬러그 형태를 강제한다
  code text primary key check (code ~ '^[a-z][a-z0-9-]*$' and char_length(code) <= 40),

  -- ⚠ 클라이언트 쓰기 경로가 없어 겹쳐 걸 화면 한도가 없다 — 이 CHECK가 유일한 한도이고
  --   abuse bound로만 기능한다(`survey.title`과 같은 취급).
  name text not null
    check (char_length(name) between 1 and 100)
    check (public.has_visible_char(name)),

  -- ⚠ 장식이 아니다. 430px 프레임에 두 팀 이름을 나란히 놓는 것이 이 기능의 첫 화면인데
  --   "맨체스터 유나이티드 vs 울버햄프턴 원더러스"는 그 폭에 들어가지 않는다.
  short_name text not null
    check (char_length(short_name) between 1 and 10)
    check (public.has_visible_char(short_name)),

  -- 동기화 스크립트가 API의 팀과 우리 행을 잇는 값. 없으면 재실행이 멱등하지 않다.
  -- ⚠ **PK로 삼지 않는다** — API 제공자를 갈아타는 순간 모든 참조가 깨진다.
  external_id text unique check (external_id is null or char_length(external_id) <= 64)
);

-- ---------------------------------------------------------------------
-- 3. 경기
--
-- 확장의 축이다 — 나중에 선수 평점·매치 스레드가 붙으면 전부 이 테이블을 부모로 삼는다.
-- 그래서 URL도 `/matches/[id]`가 되어야 한다(`/predictions/[id]`에 평점을 붙이면 그
-- 순간 경로가 거짓말을 시작한다 — URL은 영구 계약이다).
-- ---------------------------------------------------------------------
create table public.match (
  id bigint generated always as identity primary key,

  -- ⚠ **`kickoff_at`에서 파생시키지 않는다.** 8월~5월 창으로 접는 것은 휴리스틱이라
  --   6월로 연기된 경기를 조용히 다음 시즌으로 밀어 넣는다. API가 주는 값을 그대로 받는다.
  -- ⚠ 이 값이 없으면 적중률이 영원히 누적되기만 해서 **늦게 합류한 사람이 절대 1등을 못
  --   한다** — 신규 유입을 죽이는 구조다. 시즌별 랭킹이 성립하려면 여기 있어야 한다.
  season text not null check (season ~ '^[0-9]{4}-[0-9]{2}$'),

  -- 라운드. ⚠ 킥오프 시각에서 유도할 수 없다(일정이 수시로 재배치된다) → API가 준 값을 받는다.
  -- ⚠ 상한 38은 **EPL의 값**이다. 다른 대회를 들이는 날 이 CHECK부터 다시 본다.
  matchday smallint not null check (matchday between 1 and 38),

  home_team text not null references public.team (code),
  away_team text not null references public.team (code),
  check (home_team <> away_team),

  -- **예측 마감이 곧 이 값이다.** 예정 시각이라 현재형이다(`survey.closes_at`과 같은 규약 —
  -- 사건이 아니라 예정이면 `-ed_at`을 쓰지 않는다).
  kickoff_at timestamptz not null,

  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  -- 스코어는 쌍으로만 들어온다 — 한쪽만 있으면 result가 뜻을 갖지 못한다
  check ((home_score is null) = (away_score is null)),

  -- 결과가 확정된 시각. **사건이라 과거형이다.**
  finished_at timestamptz,
  check ((finished_at is null) = (home_score is null)),

  -- 취소·기권·재경기로 무효가 된 시각. 적중률 계산에서 통째로 빠진다.
  voided_at timestamptz,

  /*
   * ⚠ **정답 컬럼을 따로 두지 않는다 — 스코어에서 파생시킨다.**
   *
   * `correct_pick`을 사람이 채우게 두면 채점이 경기 수만큼의 수작업이 되고, 무엇보다
   * **재채점이 지옥이 된다.** 오심 정정·API 수정으로 스코어가 바뀌면 이미 매긴 정답을
   * 손으로 되돌려야 하는데, 그 위에 적중률 카운터까지 얹혀 있으면 되돌릴 대상이 배로 는다.
   * 파생으로 두면 스코어 한 줄을 고치는 순간 그 위의 모든 판정이 저절로 맞아진다 —
   * 투표에 득표수 컬럼을 두지 않은 것과 **같은 미학**이다(어긋날 값 자체를 없앤다).
   *
   * ⚠ **생성 타입이 이 컬럼을 막아주지 못한다.** supabase 생성기가 identity는 `id?: never`로
   *   걸러내면서 생성 컬럼은 `Insert`·`Update`에 쓰기 가능한 것처럼 남긴다(실측) — 타입은
   *   통과하고 Postgres가 런타임에 거부한다. 지금은 `match`에 정책도 grant도 없어 클라이언트
   *   쓰기 경로 자체가 없으므로 닫혀 있지만, **여기에 쓰기를 여는 순간 이 구멍이 열린다.**
   *
   * ⚠ **무효 경기는 여기서 null이 된다.** `voided_at`을 따로 걸러야 한다면 그 필터를
   *   빠뜨리는 조회가 반드시 생긴다 → `result is not null` **하나**가 "이 경기는 채점
   *   가능하다"의 유일한 술어가 되게 한다.
   */
  result public.match_pick generated always as (
    case
      when voided_at is not null    then null
      when home_score is null       then null
      when home_score > away_score  then 'home'::public.match_pick
      when home_score < away_score  then 'away'::public.match_pick
      else                               'draw'::public.match_pick
    end
  ) stored,

  -- ⚠ `team.external_id`와 달리 **not null**이다. 결과 동기화가 이 값으로 행을 찾으므로
  --   비어 있으면 그 경기는 영원히 채점되지 않는다.
  external_id text not null unique check (char_length(external_id) <= 64)
);

-- 다가오는 경기 · 최근 경기 목록이 타는 인덱스
create index match_kickoff_at_idx on public.match (kickoff_at);
-- 라운드별 화면·랭킹 집계가 타는 인덱스
create index match_season_matchday_idx on public.match (season, matchday);

comment on table public.team is
  '리그 팀 lookup. code가 그대로 읽히는 PK이고 external_id는 동기화용 매핑일 뿐이다 '
  '(제공자를 바꿔도 PK가 흔들리지 않는다). 쓰기 정책도 grant도 없다';
comment on table public.match is
  'EPL 경기. 예측 마감이 곧 kickoff_at이고, 정답(result)은 스코어에서 파생된다 — '
  '스코어를 정정하면 그 위의 모든 적중 판정이 저절로 따라온다. '
  'voided_at이 찍히면 result가 null이 되어 채점 대상에서 빠진다. '
  '쓰기 정책도 grant도 없다 — 유일한 경로는 service_role 동기화 스크립트다';

-- ---------------------------------------------------------------------
-- 4. 예측
--
-- ⚠ **"한 사람 한 표"를 기본키가 겸한다.** 재예측 차단이 애플리케이션 로직이 아니라
--   제약이라, 동시 요청 두 건이 들어와도 하나만 살아남는다(23505).
-- ---------------------------------------------------------------------
create table public.match_prediction (
  match_id bigint not null references public.match (id)    on delete cascade,
  user_id  uuid   not null references public.profiles (id) on delete cascade,
  pick     public.match_pick not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

-- "내 예측" 목록과 적중률 집계가 타고, 탈퇴 cascade도 여기로 훑는다
-- (match_id별 집계는 PK의 선두 컬럼이라 따로 필요 없다).
create index match_prediction_user_id_idx on public.match_prediction (user_id);

-- ⚠ 갈아탄 적이 있는지가 `updated_at <> created_at`으로 남는다. 클라이언트에 UPDATE
--   권한을 주지 않았으므로 서버가 찍어야 위조가 불가능하다.
-- ⚠ **when 절로 좁힌다** — 실제로 고른 값이 바뀔 때만 발화시킨다(`post_touch_updated_at`이
--   좋아요 UPDATE에도 발화해 "수정됨"이 잘못 붙었던 사고와 같은 형태다).
create trigger match_prediction_touch_updated_at
  before update on public.match_prediction
  for each row
  when (old.pick is distinct from new.pick)
  execute function public.touch_updated_at();

comment on table public.match_prediction is
  '한 사람 한 표(기본키가 겸한다). DELETE 정책이 없어 취소가 불가능하고, '
  '킥오프 전까지만 갈아탈 수 있다(match_is_open). SELECT 정책이 "내 행만"이라 '
  '임베딩 결과가 곧 "내가 고른 것"이다(post_like·post_poll_vote와 같은 트릭). '
  '적중 여부는 컬럼이 아니라 match.result와 대조해 그때그때 센다';

-- ---------------------------------------------------------------------
-- 5. 마감 판정 — 킥오프가 지나면 쓸 수 없다
--
-- `survey_is_open`과 같은 형태·같은 이유다. ⚠ **정책 안에 인라인 `exists`를 쓰지 않는다** —
-- RLS 술어가 security-barrier 서브쿼리 안으로 들어가 바깥의 등가류가 전파되지 않고 부모
-- 테이블 전체를 훑는다(실측: 인라인 4.76ms vs stable definer 헬퍼 0.61ms).
--
-- ⚠ **여기서는 이 함수가 유일한 방어선이다.** 입축구의 `isSurveyOpen`은 "안내일 뿐"이라고
--   적어 뒀지만, 예측에서는 킥오프 1초 전에 열어 둔 화면에서 지난 뒤 제출하는 일이 실제로
--   상시 발생한다 — 클라이언트 판정은 여기서 더더욱 UX일 뿐이다.
--
-- ⚠ anon에는 열지 않는다 — 이 함수를 부르는 정책이 전부 `to authenticated`라
--   `rls.sql` 섹션 17d의 화이트리스트가 늘지 않는다.
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
  )
$$;

revoke execute on function public.match_is_open(bigint) from public, anon;
grant  execute on function public.match_is_open(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 6. 집계 — **킥오프 전에는 아무도, 후에는 전부**
--
-- `post_poll_results`·`survey_results`와 게이팅 축이 다르다. 저 둘은 "참여했는가"로
-- 가르지만 여기는 **시점**으로 가른다. 두 방향 모두 이유가 있다:
--   · 마감 전 공개 → 다수파를 따라가 적중률이 오염된다(게임의 전제가 무너진다)
--   · 마감 후 비공개 → "커뮤니티는 뭐라고 했나"가 이 기능의 콘텐츠인데 그걸 잠그는 셈이다
--
-- ⚠ **그래서 anon에도 EXECUTE를 연다.** 이 시스템에서 anon에 열린 여섯 번째 함수이고,
--   `rls.sql` 섹션 17d의 화이트리스트를 함께 늘렸다. 안전한 근거는 다른 definer들과 같다 —
--   입력(경기 id) 외의 정보를 돌려주지 않고, 킥오프 전에는 0행이다.
--
-- ⚠ definer라 RLS가 닿지 않으므로 게이팅을 **함수 안에서 직접** 확인한다
--   (`post_poll_results`가 `post_is_alive`를 안에서 부르는 것과 같은 이유).
-- ---------------------------------------------------------------------
create or replace function public.match_prediction_results(p_match_id bigint)
returns table (pick public.match_pick, vote_count bigint)
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
        where m.id = p_match_id and m.kickoff_at <= now()
     )
   group by p.pick
$$;

revoke execute on function public.match_prediction_results(bigint) from public;
grant  execute on function public.match_prediction_results(bigint) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
alter table public.team             enable row level security;
alter table public.match            enable row level security;
alter table public.match_prediction enable row level security;

-- 일정·결과는 공개 데이터다. 크롤러가 경기 페이지를 색인해야 하므로 anon도 읽는다.
create policy "team_select_all"  on public.team  for select using (true);
create policy "match_select_all" on public.match for select using (true);

/*
 * ⚠ **team·match에는 쓰기 정책도 grant도 두지 않는다.** 입축구 문항과 같은 취급이고,
 *   여기서는 그 유일 경로가 **service_role 동기화 스크립트**다
 *   (`scripts/upload-survey-images.mjs`가 이미 쓰는 형태 — 새 키는 JWT가 아니라서
 *    `apikey` 헤더를 함께 보내야 한다).
 *
 *   덕분에 이 기능이 늘리는 **사용자 쓰기 표면은 `match_prediction` 하나**다.
 */

-- 마감 뒤에도 자기 예측은 봐야 한다 → select에는 match_is_open을 걸지 않는다
-- (survey_vote가 마감 후에도 "내 표"를 돌려주는 것과 같은 판단).
create policy "match_prediction_select_own" on public.match_prediction
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "match_prediction_insert_own" on public.match_prediction
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.match_is_open(match_id));

-- 갈아타기 — 컬럼 권한이 pick 하나뿐이라 이 정책으로 바꿀 수 있는 것도 그것뿐이다.
-- ⚠ `with check`를 함께 둔다. 없으면 user_id를 남의 uuid로 바꾸는 소유권 이전이 된다.
create policy "match_prediction_update_own" on public.match_prediction
  for update to authenticated
  using      (user_id = (select auth.uid()) and public.match_is_open(match_id))
  with check (user_id = (select auth.uid()) and public.match_is_open(match_id));

-- ⚠ DELETE 정책이 없다 = 예측 취소 불가(킥오프 전 갈아타기만).
--   ⚠ 이 성질은 **컬럼 권한과 한 쌍**이다 — update에 match_id를 열면 표를 다른 경기로
--     옮겨 원래 경기에서 빼는 우회로가 생긴다. 아래 grant를 넓히지 말 것.

-- ---------------------------------------------------------------------
-- 8. 권한 위생
--
-- public 스키마 기본 권한이 anon/authenticated에 ALL이라, revoke를 한 번만 잊어도
-- 즉시 구멍이 된다(rls.sql 섹션 17이 테이블명을 하드코딩하지 않고 전수로 잡는다).
-- ---------------------------------------------------------------------
revoke all on public.team             from anon, authenticated;
revoke all on public.match            from anon, authenticated;
revoke all on public.match_prediction from anon, authenticated;

grant select on public.team  to anon, authenticated;
grant select on public.match to anon, authenticated;
-- ⚠ **anon에도 SELECT를 준다** — post_poll_vote와 같은 형태다. 행을 막는 것은 grant가
--   아니라 정책(`..._select_own`이 `to authenticated`)이라 anon에게는 어차피 0행이 간다.
--   grant를 빼면 임베딩(`match(… match_prediction(pick))`)이 42501로 죽어 **비로그인에게
--   경기 목록이 통째로 안 보인다**(post_poll_vote에서 실측한 함정이다).
grant select on public.match_prediction to anon, authenticated;

-- ⚠ team·match에는 INSERT를 주지 않는다. 유일한 경로는 service_role이다.
grant insert (match_id, user_id, pick) on public.match_prediction to authenticated;
-- ⚠ 갈아타기용. **pick 하나만** 연다 — match_id를 열면 "취소 불가"가 뚫리고,
--   created_at을 열면 시각 위조가 된다. PostgREST upsert를 쓰지 않는 이유이기도 하다
--   (ON CONFLICT DO UPDATE SET이 payload 전 컬럼에 UPDATE 권한을 요구한다).
grant update (pick)                    on public.match_prediction to authenticated;

-- identity 시퀀스는 테이블 revoke에 딸려오지 않는다
revoke all on all sequences in schema public from anon, authenticated;

notify pgrst, 'reload schema';

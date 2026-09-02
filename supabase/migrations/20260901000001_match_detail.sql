-- ---------------------------------------------------------------------
-- 경기 상세 — player · match_lineup(_player) · match_event · match_stat
--
-- 승부예측 상세를 "대진 + 스코어"에서 **라인업·타임라인·팀 스탯**까지 넓힌다.
-- 데이터 제공자를 football-data.org → **API-Football**로 옮기면서 짜는 스키마다
-- (그쪽에는 피치 좌표·평점·사진·xG가 아예 없어 이 화면들을 만들 수 없었다).
--
-- ⚠ **`external_id`가 전부 API-Football 기준으로 바뀐다.** `team`·`match`에 이미 들어 있는
--   football-data id는 새 동기화가 찾지 못한다 → 이 마이그레이션은 스키마만 바꾸고,
--   기존 행의 재매핑은 동기화 스크립트가 한다. `external_id`를 PK로 삼지 않은 결정이
--   여기서 값을 한다(`team.code`는 그대로 두고 매핑 값만 갈아끼운다).
--
-- ⚠ **쓰기 정책도 grant도 두지 않는다.** `team`·`match`와 같은 취급이라 유일한 경로는
--   service_role 동기화 스크립트다 → 이 기능이 늘리는 사용자 쓰기 표면은 **0**이다.
--
-- ⚠ **한 경기가 만드는 행은 약 94개다**(라인업 2 · 선수배치 40 · 이벤트 16 · 스탯 36).
--   시즌 380경기면 3.6만 행으로, 인덱스를 미리 늘릴 규모가 아니다.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. 편 — home / away
--
-- ⚠ **팀 코드를 자식 행에 적지 않는 이유가 여기 있다.** `team_code references team`으로
--   두면 "그 경기에 나오지도 않는 팀의 라인업"이 행으로 성립한다 — FK는 팀이 실재하는지만
--   보고 이 경기의 팀인지는 보지 못하며, "둘 중 하나"는 FK로 표현할 수 없다(FK의 대상은
--   유니크 제약 하나뿐이다). CHECK로도 못 쓴다(다른 행을 봐야 한다).
--
--   편으로 두면 팀은 `match.home_team`·`away_team`에서 **유도된다** → 어긋날 값 자체가
--   없어진다. 정답(`result`)을 스코어에서 파생시킨 것과 같은 미학이고, 아래 네 테이블이
--   전부 이 축을 공유한다.
--
-- ⚠ `match_pick`을 재사용하지 않는다 — 저쪽에는 `draw`가 있어서 "무승부 팀의 라인업"이
--   타입상 성립해 버린다. 값이 셋과 둘로 다르면 다른 타입이다.
-- ---------------------------------------------------------------------
create type public.match_side as enum ('home', 'away');

-- ---------------------------------------------------------------------
-- 2. 선발/후보
--
-- ⚠ 값이 둘로 닫혀 있다 — 제공자가 주는 것이 `startXI`·`substitutes` 둘뿐이다.
--   교체 투입은 이 enum이 아니라 `match_event`가 갖는다(교체는 선수의 **상태**가 아니라
--   분을 가진 **사건**이다 — 벤치 선수는 투입돼도 벤치 명단에 그대로 남는다).
--
-- ⚠ `is_starter boolean`으로 두지 않는다. 생성 타입이 `'start' | 'bench'` 유니온을
--   내려주어 화면이 그대로 그룹핑에 쓸 수 있고, 부정형 이름(`!is_starter`)이 안 생긴다.
-- ---------------------------------------------------------------------
create type public.lineup_role as enum ('start', 'bench');

-- ---------------------------------------------------------------------
-- 3. 사건의 종류
--
-- ⚠ **제공자 코드가 아니라 우리 도메인이다.** API-Football은 `Goal`·`Card`·`subst`·`Var`를
--   주는데, 우리가 그리는 것은 앞의 셋뿐이라 `Var`는 동기화가 버린다. 제공자가 종류를
--   늘려도 우리 enum은 그대로다 — **닫힌 집합의 주인이 우리여야** enum이 안전하다
--   (`match_pick`과 같은 판단이고, 아래 `match_stat.stat_key`가 반대 판단인 것과 대비된다).
--
-- ⚠ enum 값은 **지울 수 없다**(add·rename만 된다). 그래서 "지금 그리는 것"만 넣는다.
-- ---------------------------------------------------------------------
create type public.match_event_kind as enum ('goal', 'card', 'substitution');

-- ---------------------------------------------------------------------
-- 4. 선수 — **부모가 없다**(접두어가 없는 이유)
--
-- 판정은 컬럼이 한다: PK가 자기 `id`이고 어떤 부모도 향하지 않는다. `team`과 같은 자리다.
--
-- ⚠ **소속 팀 컬럼을 두지 않는다.** 이적하면 즉시 거짓이 되는데 우리에겐 갱신할 경로가
--   없고, 애초에 필요가 없다 — 어느 팀으로 뛰었는지는 그 경기의 라인업 행이 편으로
--   이미 말한다. **행이 아는 것을 테이블이 또 알게 하지 않는다.**
--
-- ⚠ **`team`과 달리 정수 id를 PK로 쓴다.** `team.code`가 슬러그인 것은 `match` 행을 열면
--   조인 없이 `liverpool`이 읽히기 때문인데, 라인업은 이름을 그리려면 **어차피 항상**
--   이 테이블을 조인한다 → 읽히는 이득이 없다. 반면 비용은 확실하다: 동명이인이 실재하고,
--   행이 라인업 payload에서 그때그때 생기므로 슬러그 충돌 해소가 동기화 한복판에 들어온다.
--
-- ⚠ **사진 URL 컬럼을 두지 않는다 — `external_id`에서 유도한다.**
--   제공자 CDN의 주소가 `.../players/{external_id}.png`로 결정적이라, 컬럼을 두면 같은
--   사실을 두 곳이 갖게 된다. 구단 엠블럼을 `team.code`에서 유도한 것과 같은 판단이다.
--   ⚠ **거기까지만 같다** — 엠블럼은 우리가 줄인 사본을 커밋해 서빙하고 여기는 제공자 CDN을
--     그대로 쓴다(조립은 `entities/match/lib/player-photo`가 한다).
--   ⚠ 초상권·저작권 때문에 **사진 없이도 성립하는 화면**이 전제다(제공자조차 일부 선수의
--     사진이 없다 — 폴백은 실루엣이다).
-- ---------------------------------------------------------------------
create table public.player (
  id bigint generated always as identity primary key,

  -- ⚠ **`team.name`과 같은 규약이라 한국어를 담는다** — 화면에 이 단어가 그대로 나가므로
  --   라벨맵을 두면 같은 문자열을 두 곳에 적는 셈이다. 매핑은 이 컬럼의 유일한 writer인
  --   동기화 스크립트가 쓰기 직전에 입힌다(`scripts/team-names-ko.json`과 같은 형태).
  -- ⚠ **매핑이 없으면 실패시키지 않고 영문을 그대로 넣는다.** 팀은 20개라 매핑이 사실상
  --   완결되지만 선수는 이적·콜업으로 영원히 미완이다 — 빠진 이름 때문에 라인업이 통째로
  --   안 뜨는 쪽이 훨씬 나쁘다(엠블럼이 모노그램으로 떨어지는 것과 같은 운영 모델).
  -- ⚠ **약칭이 아니라 풀네임을 넣는다.** 제공자는 라인업 블록에 `Z. Suzuki`, 선수 블록에
  --   `Zion Suzuki`를 주는데 **같은 응답 안에 둘 다 있다** — 약칭을 저장하면 화면에서
  --   풀네임으로 되돌릴 방법이 없다.
  name text not null
    check (char_length(name) between 1 and 100)
    check (public.has_visible_char(name)),

  -- ⚠ `team.external_id`와 달리 **not null**이다. 모든 행이 API에서만 생기므로 비어 있는
  --   행은 다음 동기화가 같은 선수를 찾지 못해 중복으로 쌓는다는 뜻이고, 사진 URL이
  --   이 값에서 유도되므로 비면 얼굴도 사라진다.
  external_id text not null unique check (char_length(external_id) <= 64)
);

-- ---------------------------------------------------------------------
-- 5. 경기에 "진행 중"을 더한다
--
-- ⚠ **휴리스틱 하나를 지우기 위한 컬럼이다.** 지금까지 "진행 중"은 클라이언트가
--   `킥오프 지남 + 결과 없음 + 4시간 이내`로 추측했다(`isMatchInProgress`). 그 창은
--   연기된 경기를 진행 중으로 그리거나 연장전을 결과 대기로 떨어뜨린다 — 라이브 스탯을
--   그리기 시작하면 **틀린 창 위에 실시간 데이터를 얹는** 꼴이 된다.
--
-- ⚠ **상태 enum(`scheduled`·`finished`·…)을 두지 않는다.** 그런 컬럼은 `finished_at`·
--   `voided_at`과 같은 사실을 두 번 갖게 되어 서로 어긋날 수 있다(`like_count`가 겪은
--   클래스다). 여기 없던 정보는 **"지금 몇 분인가"** 하나뿐이라 그것만 더한다.
--
--   진행 중  ⟺ live_minute is not null
--   결과 대기 ⟺ 킥오프 지남 · live_minute null · finished_at null · voided_at null
-- ---------------------------------------------------------------------
alter table public.match
  -- 연장·추가시간까지 담는다(정규 90 + 연장 30 + 추가시간 여유).
  add column live_minute smallint check (live_minute is null or live_minute between 0 and 130),
  -- ⚠ 종료·무효 경기는 진행 중일 수 없다. 동기화가 종료 시 이 값을 비우는 것을
  --   **약속이 아니라 제약으로** 만든다 — 안 비우면 끝난 경기가 영원히 "진행 중"이 된다.
  add constraint match_live_minute_not_ended
    check (live_minute is null or (finished_at is null and voided_at is null));

comment on column public.match.live_minute is
  '진행 중일 때의 경과 분. null이면 진행 중이 아니다(예정·종료·무효·연기). '
  '상태 enum을 두지 않는 이유는 finished_at·voided_at과 같은 사실이 두 곳에 생기기 때문이다';

-- ---------------------------------------------------------------------
-- 6. 라인업 — (경기, 편)당 한 행
--
-- ⚠ **자식 행마다 되풀이될 값을 여기로 올린 것이다.** 포메이션·감독은 선수가 아니라
--   (경기, 편)의 성질이라, 20개 행에 복사해 두면 어긋날 자리가 그만큼 생긴다
--   (`post_poll` ↔ `post_poll_option`과 같은 갈라짐).
--
-- ⚠ **이 행의 존재가 곧 "발표됨"이다.** 별도 플래그를 두지 않는다 — `confirmed_at` 같은
--   컬럼은 우리가 *받은* 시각이지 구단이 *발표한* 시각이 아니라서, 화면에 "35분 전 발표"로
--   쓰이는 순간 거짓말이 된다. 라인업은 킥오프 20~40분 전에 도착하고, **그 창은 예측이
--   아직 열려 있는 구간**이라(마감이 킥오프다) 이 테이블은 예측의 마지막 재료다.
-- ⚠ 대가로 **"아직 발표 전"과 "동기화가 실패했다"가 구분되지 않는다.** 화면이 둘을 갈라야
--   한다면 그때 필요한 것은 이 테이블의 컬럼이 아니라 동기화 쪽의 기록이다.
-- ---------------------------------------------------------------------
create table public.match_lineup (
  match_id bigint not null references public.match (id) on delete cascade,
  side public.match_side not null,

  -- "4-3-3"·"4-2-3-1". ⚠ **nullable이다** — API가 라인업은 주면서 포메이션을 비우는
  --   경기가 있다. not null로 두면 그 경기의 라인업이 통째로 저장되지 못한다.
  formation text check (formation is null or formation ~ '^[1-9][0-9]?(-[1-9][0-9]?){1,4}$'),

  -- ⚠ **감독을 엔티티로 만들지 않는다.** 우리가 감독에 대해 할 일이 "이름을 한 줄 그리는
  --   것"뿐이라, 테이블을 만들면 조인과 동기화만 늘고 화면은 그대로다. 필요가 생기면
  --   그때 `player`처럼 뽑는다(지금 백필이 가능한 것은 지금 만들지 않는다).
  coach_name text
    check (coach_name is null or char_length(coach_name) between 1 and 100)
    check (coach_name is null or public.has_visible_char(coach_name)),

  -- 우리가 이 라인업을 처음 저장한 시각. ⚠ **발표 시각이 아니다**(위 참고).
  -- ⚠ `updated_at`을 두지 않는다 — 경기 중 실제로 움직이는 값은 자식의 평점이라
  --   부모는 그대로다. 여기 있는 `updated_at`은 갱신을 놓쳐 항상 거짓이 된다.
  created_at timestamptz not null default now(),

  primary key (match_id, side)
);

-- ---------------------------------------------------------------------
-- 7. 라인업의 선수
--
-- ⚠ **부모를 복합 FK로 잡는다**(`match_id`가 아니라 `(match_id, side)`). `match`를 직접
--   참조하면 부모 라인업 행 없이 선수만 떠 있는 상태가 성립한다 — 포메이션도 감독도 없이
--   선수 11명만 있는 라인업이 그것이다.
-- ---------------------------------------------------------------------
create table public.match_lineup_player (
  match_id bigint not null,
  side public.match_side not null,

  -- ⚠ cascade를 걸지 않는다. 선수 행은 지워질 일이 없고(동기화가 지우지 않는다),
  --   혹시 지운다면 **과거 라인업이 조용히 비는 쪽**이 더 나쁘다 → 참조가 막게 둔다.
  player_id bigint not null references public.player (id),

  role public.lineup_role not null,

  /*
   * 피치 좌표 — 이미지의 포메이션 뷰가 통째로 여기 달려 있다.
   *
   * 제공자가 `"4:3"`(행:열) 형태로 준다. **행 1이 골키퍼 쪽이고 열은 왼쪽부터** 센다.
   * 실측(4-2-3-1): 1:1 GK / 2:1~2:4 수비 4 / 3:1~3:2 미드 2 / 4:1~4:3 / 5:1 최전방.
   *
   * ⚠ **포메이션 문자열에서 좌표를 유도하지 않는다.** "4-2-3-1"을 파싱해 배치를 만들면
   *   같은 포메이션의 다른 배열(예: 좌우 비대칭)을 표현할 수 없고, 제공자가 이미 정답을
   *   준다. 문자열 `"4:3"`을 그대로 담지 않고 둘로 쪼개는 것은 정렬·비교가 필요해서다.
   *
   * ⚠ **벤치는 좌표가 없다**(제공자가 null을 준다) — 아래 CHECK가 그걸 구조로 만든다.
   *   반대 방향(선발이면 반드시 좌표가 있다)은 강제하지 않는다: 제공자가 비우는 경기가
   *   생기면 그 라인업이 통째로 저장되지 못한다(`formation`을 nullable로 둔 것과 같은 이유).
   */
  grid_row smallint check (grid_row is null or grid_row between 1 and 11),
  grid_col smallint check (grid_col is null or grid_col between 1 and 11),
  check (role = 'start' or (grid_row is null and grid_col is null)),
  -- 좌표는 쌍으로만 뜻을 갖는다
  check ((grid_row is null) = (grid_col is null)),

  /*
   * 선수 평점.
   *
   * ⚠ **경기 중 계속 바뀐다**(제공자가 5분마다 갱신한다) → 동기화는 이 테이블을
   *   지웠다 다시 넣지 않고 **PK로 upsert**한다. 삭제·삽입 사이에 읽는 사람이 있으면
   *   라인업이 한 프레임 비기 때문이다.
   *
   * ⚠ **이 값은 다른 사이트의 평점과 다르다.** 같은 경기 같은 선수인데 최대 3.4점까지
   *   벌어지는 것을 실측했다(제공자마다 다른 편집 저작물이다). 화면은 **출처를 밝혀야**
   *   하고, 다른 곳의 숫자와 맞추려 들면 안 된다.
   */
  rating numeric(3, 1) check (rating is null or rating between 0 and 10),

  -- "Goalkeeper"·"Centre-Back" 등 제공자의 영문 표기. ⚠ **enum이 아니다** — 제공자가 주는
  --   값의 집합이 닫혀 있다는 보장이 없는데 enum 값은 지울 수 없다. 한국어 표기는 화면이
  --   아는 값만 옮기고 모르는 값은 그대로 그린다(`player.name`과 같은 폴백 태도).
  position text check (position is null or char_length(position) between 1 and 40),

  shirt_number smallint check (shirt_number is null or shirt_number between 1 and 99),

  -- ⚠ **표시 순서를 저장한다.** 벤치에는 좌표가 없어 정렬 기준이 이것뿐이고, 선발도
  --   제공자가 준 순서(GK→수비→미드→공격)를 잃으면 매번 다르게 그려진다.
  sort_order smallint not null check (sort_order between 1 and 30),

  primary key (match_id, side, player_id),

  -- ⚠ 한 라인업 안에서 순서가 겹치지 않게 한다. `role`을 키에 넣어 선발과 후보가 각자
  --   1번부터 셀 수 있다(`survey_option`의 `sort_order` + unique와 같은 형태).
  unique (match_id, side, role, sort_order),

  /*
   * ⚠ **한 자리에 두 선수가 설 수 없다.** 순서(`sort_order`)는 구조로 막아 두고 좌표만
   *   열어 두면 비대칭이다 — 겹치면 피치에서 마커가 통째로 포개져 한 명이 보이지 않는다.
   * ⚠ **기본 NULL 처리를 그대로 쓴다**(`nulls not distinct`가 아니다). 벤치는 좌표가 전부
   *   null이라 `nulls not distinct`로 두면 **벤치 두 번째 선수부터 거부된다.**
   *   Postgres 기본값은 null끼리 다르게 보므로 벤치는 이 제약을 자유롭게 지나간다.
   */
  unique (match_id, side, grid_row, grid_col),

  foreign key (match_id, side)
    references public.match_lineup (match_id, side) on delete cascade
);

-- ---------------------------------------------------------------------
-- 8. 사건 — 득점 · 카드 · 교체
--
-- 셋을 한 테이블에 두는 이유는 **화면이 셋을 함께 읽기 때문**이다. 라인업 위의 아이콘
-- (골·카드·교체 화살표)과 후보 명단의 "누구와 몇 분에"가 전부 이 타임라인 하나에서 나온다.
--
-- ⚠⚠ **제공자의 교체 이벤트는 `player`가 나간 선수, `assist`가 들어온 선수다 — 이름과
--     정반대다.** 실측으로 확정했다(한 경기 9건 전부, 선발 명단과 대조). 그대로 받아
--     적으면 화면의 교체 화살표가 통째로 거꾸로 그려지는데, **빌드도 타입도 잡지 못하고
--     데이터가 그럴듯해 리뷰도 놓친다.** 그래서 컬럼 이름을 제공자를 따르지 않고
--     `player_out_id`·`player_in_id`로 **뜻**을 박아 넣는다 — 뒤집는 자리는 동기화 스크립트
--     한 곳이고, 아래 unique·CHECK와 `rls.sql`이 회귀를 잡는다.
-- ---------------------------------------------------------------------
create table public.match_event (
  id bigint generated always as identity primary key,

  match_id bigint not null references public.match (id) on delete cascade,
  side public.match_side not null,
  kind public.match_event_kind not null,

  -- 표시 분. 추가시간은 `45+2`처럼 나뉘어 오므로 따로 담는다(합쳐 47로 접으면
  -- 전반 추가시간과 후반 2분이 구분되지 않는다).
  minute smallint not null check (minute between 0 and 130),
  extra_minute smallint check (extra_minute is null or extra_minute between 1 and 30),

  /*
   * 사건의 주체. 종류마다 뜻이 다르다:
   *   goal         → 득점자          (related = 도움)
   *   card         → 카드를 받은 선수 (related = null)
   *   substitution → **나간 선수**    (related = 들어온 선수)
   *
   * ⚠ nullable이다 — 제공자가 선수를 특정하지 못하는 사건이 있다(팀 경고 등).
   */
  player_id         bigint references public.player (id),
  related_player_id bigint references public.player (id),

  -- 'Normal Goal'·'Own Goal'·'Penalty'·'Yellow Card'·'Red Card' 등 제공자 원문.
  -- ⚠ **enum이 아니다** — `position`과 같은 판단이다. 다만 화면이 이 값으로 아이콘을
  --   가르므로(자책골·PK·카드 색), 아는 값만 옮기고 모르는 값은 기본 아이콘으로 떨어진다.
  detail text check (detail is null or char_length(detail) between 1 and 60),

  -- 자기 자신과 교체될 수 없다
  check (player_id is null or player_id is distinct from related_player_id),
  -- 카드에는 상대역이 없다 — 있으면 매핑이 어긋난 것이다
  check (kind <> 'card' or related_player_id is null),
  -- 교체는 두 선수가 모두 있어야 뜻을 갖는다
  check (kind <> 'substitution' or (player_id is not null and related_player_id is not null)),

  /*
   * ⚠ **재동기화가 행을 늘리지 않게 하는 열쇠다.** 경기 중 3분마다 다시 받는데, 지웠다
   *   넣으면 그 사이에 읽는 사람에게 타임라인이 빈다(supabase-js에는 여러 문장을 묶는
   *   트랜잭션이 없다) → **충돌 시 무시하는 삽입**으로 이어 붙인다.
   * ⚠ `nulls not distinct`가 필수다. 기본값에서는 null끼리 다르게 취급되어
   *   `player_id`가 비는 사건이 폴링할 때마다 새 행으로 쌓인다(PG15+).
   */
  unique nulls not distinct (match_id, side, kind, minute, extra_minute, player_id)
);

-- 한 경기의 타임라인을 시간순으로 읽는 것이 유일한 조회 형태다
create index match_event_timeline_idx
  on public.match_event (match_id, minute, extra_minute nulls first, id);

-- ---------------------------------------------------------------------
-- 9. 팀 스탯 — 화면의 비교 표 한 행이 여기 한 쌍이다
--
-- ⚠ **`stat_key`를 enum으로 두지 않는다.** 제공자가 주는 항목이 늘거나 이름이 바뀔 수
--   있는데 enum 값은 **지울 수 없다** — `match_event_kind`가 enum인 것과 갈리는 지점이고,
--   판정 기준은 "그 닫힌 집합의 주인이 우리인가"다. 사건의 종류는 우리가 그릴 셋으로
--   정했지만, 스탯 항목은 제공자가 정한다.
--
-- ⚠ **그래도 제공자의 문자열을 그대로 담지 않는다.** `"Ball Possession"`·`"expected_goals"`
--   처럼 표기가 뒤섞여 있어 화면이 라벨맵의 키로 쓸 수 없다 → 동기화가 우리 슬러그로
--   옮기고 **모르는 항목은 버린다**(`match_event_kind`의 `Var`와 같은 처리).
--
-- ⚠ **표시 순서와 라벨은 여기 없다.** 어떤 항목을 어떤 순서로 그릴지는 우리 편집 결정이라
--   화면이 상수 배열로 갖는다. DB에 두면 제공자가 항목을 하나 늘릴 때마다 화면이 모르는
--   행을 그리게 된다.
--
-- ⚠ **행이 없는 것과 값이 0인 것은 다르다.** 제공자는 퇴장 0을 `null`로 주는데(실측),
--   그건 "0장"이지 "이 리그엔 퇴장 개념이 없음"이 아니다 → 동기화가 아는 카운터의 null은
--   0으로 접고, **아예 안 준 항목은 행을 만들지 않는다.** 그래야 xG를 주지 않는 리그에서
--   화면이 "0.00"이라는 거짓말 대신 그 행을 지운다.
--
-- ⚠ **몇 개는 제공자가 아니라 우리가 센다.** 키패스는 선수별 값의 합이고 교체 수는 사건의
--   수다(제공자가 팀 합계를 주지 않는다). 화면이 스탯 표를 **이 테이블 하나만 읽고**
--   그리게 하려고 같은 자리에 넣는다 — 대신 어떤 키가 집계인지는 동기화가 단독으로 안다.
-- ---------------------------------------------------------------------
create table public.match_stat (
  match_id bigint not null references public.match (id) on delete cascade,
  side public.match_side not null,

  -- 우리 슬러그: possession · shots_total · expected_goals · key_passes …
  stat_key text not null
    check (stat_key ~ '^[a-z][a-z0-9_]*$' and char_length(stat_key) <= 40),

  -- ⚠ **하나의 numeric으로 담는다.** 점유율은 `"39%"`, xG는 `0.31`, 슈팅은 `7`로 형태가
  --   제각각이지만 전부 수다 — 단위(%·개·기대값)는 항목이 정하므로 화면의 라벨맵이 안다.
  --   문자열로 담으면 정렬·비교·비율 막대 계산이 전부 파싱을 거친다.
  value numeric not null,

  primary key (match_id, side, stat_key)
);

comment on table public.player is
  '선수. 부모가 없어 접두어도 없다(team과 같은 자리). 소속 팀 컬럼을 두지 않는다 — '
  '이적하면 즉시 거짓이 되고, 어느 팀으로 뛰었는지는 라인업 행의 side가 이미 말한다. '
  '사진 URL도 두지 않는다 — external_id에서 유도된다(엠블럼을 team.code에서 유도한 것과 '
  '같은 판단). name은 풀네임 한국어이고 매핑이 없으면 영문 그대로다. 쓰기 정책도 grant도 없다';
comment on table public.match_lineup is
  '확정 라인업 (경기, 편)당 한 행. 이 행의 존재가 곧 "발표됨"이라 별도 플래그가 없다 — '
  '킥오프 20~40분 전에 도착하며, 그 창은 예측이 아직 열려 있는 구간이다. '
  '팀을 적지 않고 side로 두는 이유는 match.home_team/away_team에서 유도되기 때문이다 '
  '(그 경기에 없는 팀의 라인업이 성립할 수 없다). 쓰기 정책도 grant도 없다';
comment on table public.match_lineup_player is
  '라인업의 선수. 부모를 (match_id, side) 복합 FK로 잡아 부모 없는 선수 행이 성립하지 '
  '않는다. grid_row/col은 제공자가 주는 피치 좌표로 벤치에는 없다. rating은 경기 중 '
  '5분마다 바뀌므로 동기화가 지우지 않고 upsert한다. 선발이 정확히 11명이라는 것은 '
  '행 수 제약이라 CHECK로 셀 수 없다 — rls.sql이 대신 지킨다';
comment on table public.match_event is
  '득점·카드·교체 타임라인. ⚠ 제공자는 교체에서 player=나간 선수, assist=들어온 선수를 '
  '주는데(실측 9/9) 이름과 반대라, 컬럼 이름에 뜻을 박아 뒤집는 자리를 동기화 한 곳으로 '
  '모았다. 경기 중 재폴링이 행을 늘리지 않도록 unique nulls not distinct로 이어 붙인다';
comment on table public.match_stat is
  '팀 스탯. 화면의 비교 표 한 행이 여기 (home, away) 한 쌍이다. stat_key는 제공자 문자열이 '
  '아니라 우리 슬러그이고 모르는 항목은 동기화가 버린다. 행이 없는 것은 "그 항목을 받지 '
  '못했다"는 뜻이고 값 0과 다르다. key_passes·substitutions는 제공자가 아니라 우리가 센다';

-- ---------------------------------------------------------------------
-- 10. RLS
--
-- 일정·결과와 같은 공개 데이터다. 크롤러가 경기 페이지를 색인해야 하므로 anon도 읽는다.
-- ⚠ 차단(`is_blocked`)을 넣을 자리가 없다 — 경기와 마찬가지로 작성자가 없는 운영
--   데이터라 차단할 상대 자체가 없다.
-- ---------------------------------------------------------------------
alter table public.player              enable row level security;
alter table public.match_lineup        enable row level security;
alter table public.match_lineup_player enable row level security;
alter table public.match_event         enable row level security;
alter table public.match_stat          enable row level security;

create policy "player_select_all"              on public.player              for select using (true);
create policy "match_lineup_select_all"        on public.match_lineup        for select using (true);
create policy "match_lineup_player_select_all" on public.match_lineup_player for select using (true);
create policy "match_event_select_all"         on public.match_event         for select using (true);
create policy "match_stat_select_all"          on public.match_stat          for select using (true);

-- ---------------------------------------------------------------------
-- 11. 권한 위생
--
-- public 스키마 기본 권한이 anon/authenticated에 ALL이라, revoke를 한 번만 잊어도
-- 즉시 구멍이 된다(rls.sql 섹션 17이 전수로 잡는다).
-- ---------------------------------------------------------------------
revoke all on public.player              from anon, authenticated;
revoke all on public.match_lineup        from anon, authenticated;
revoke all on public.match_lineup_player from anon, authenticated;
revoke all on public.match_event         from anon, authenticated;
revoke all on public.match_stat          from anon, authenticated;

grant select on public.player              to anon, authenticated;
grant select on public.match_lineup        to anon, authenticated;
grant select on public.match_lineup_player to anon, authenticated;
grant select on public.match_event         to anon, authenticated;
grant select on public.match_stat          to anon, authenticated;

-- ⚠ INSERT·UPDATE·DELETE를 어디에도 주지 않는다. 유일한 경로는 service_role이다.
-- ⚠ `match.live_minute`도 마찬가지다 — match의 컬럼 grant가 애초에 없어 따로 막을 것이 없다.

-- identity 시퀀스는 테이블 revoke에 딸려오지 않는다(player.id·match_event.id가 identity다)
revoke all on all sequences in schema public from anon, authenticated;

notify pgrst, 'reload schema';

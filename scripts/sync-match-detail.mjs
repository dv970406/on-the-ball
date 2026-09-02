/**
 * 라인업 · 사건 · 팀 스탯 폴러.
 *
 *   node scripts/sync-match-detail.mjs                 # 받을 게 있는 경기들 (5분마다 크론)
 *   node scripts/sync-match-detail.mjs --live          # 경기 중에도 받는다 (⚠ Pro 요금제 전제)
 *   node scripts/sync-match-detail.mjs --window 6      # 되돌아보는 창을 6시간으로
 *   node scripts/sync-match-detail.mjs --match 1557377 # 그 경기만 (external_id)
 *   node scripts/sync-match-detail.mjs --fixture f.json# API 대신 저장된 응답으로
 *   node scripts/sync-match-detail.mjs --remote        # 원격에 쓴다 (명시적일 때만)
 *
 * ⚠ **일정 동기화(`sync-matches.mjs`)와 주기가 다르다.** 저쪽은 하루 한두 번이면 되지만
 *   라인업은 **킥오프 20~40분 전**에야 나온다 — 그 구간은 예측이 아직 열려 있어(마감이
 *   킥오프다) 놓치면 기능이 통째로 없는 것과 같다 → 5분 간격.
 *
 * ⚠ **예산은 경기 수가 아니라 틱 수에 비례한다.** `/fixtures?ids=`가 한 요청에 20경기까지
 *   담고 응답에 상세가 전부 들어 있어서, 한 틱에 몇 경기를 받든 요청은 1회다. 그래서
 *   **아껴야 하는 것은 "몇 경기냐"가 아니라 "얼마나 오래 도느냐"** 다.
 *
 * ⚠⚠ **무료 한도(100/day)는 실제 일정에서 쉽게 넘는다.** DB의 EPL 380경기 일정으로
 *   시뮬레이션한 결과(무료 = 100/day · 10/min):
 *
 *     | 전략                                   | 최악 | 중앙 | 한도 초과 |
 *     |----------------------------------------|-----:|-----:|-----------|
 *     | 킥오프 창(-1h~+4h) · 3분                |  221 |   81 | 27/86일   |
 *     | 킥오프 창(-1h~+4h) · 5분                |  133 |   49 | 13/86일   |
 *     | 상태 기반 + 라이브 · 3분 (B)            |  178 |   40 | 14/86일   |
 *     | 상태 기반 + 라이브 · 5분 (B)            |  108 |   24 |  1/86일   |
 *     | **상태 기반, 라이브 없음 · 5분 (C)**     | **45** |   12 | **0/86일** |
 *
 *   지금은 **C**로 돈다(`--live` 없음). 화면에 `refetchInterval`이 없어 라이브로 받아도
 *   사용자가 새로고침 전까지 못 보므로 **기능 손실이 0**이기 때문이다.
 *
 * ⚠ **화면에 자동 갱신을 붙이는 순간 B와 Pro로 함께 옮긴다.** B를 무료로 돌리면 최악
 *   108요청이라 여유가 없고, 한도를 넘는 날은 **그날 남은 경기를 통째로 놓친다.**
 *   둘은 한 쌍이라 따로 옮기지 않는다 — 근거와 절차는 `docs/conventions/api-and-db.md`.
 *
 * ⚠ **멱등해야 한다.** 같은 경기를 여러 틱에 걸쳐 다시 받으므로, 두 번 돌려서 행이 늘면 그 순간
 *   이 스크립트는 쓸 수 없게 된다 → 모든 쓰기가 upsert이거나 충돌 시 무시다.
 */
import { readFileSync } from "node:fs";
import {
  clampCp,
  createSyncClient,
  flag,
  guardTarget,
  isoOrNull,
  loadEnv,
  str,
  upsertRows,
  validScore,
} from "./lib/sync-db.mjs";
import { MAX_IDS, createApiFootball, matchState } from "./lib/api-football.mjs";

const NAMES_KO = "scripts/player-names-ko.json";
const COACH_NAMES_KO = "scripts/coach-names-ko.json";

// ── 인자 ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const allowRemote = argv.includes("--remote");
const fixturePath = flag(argv, "fixture");
const onlyMatch = flag(argv, "match");
// ⚠ 되돌아보는 창의 기본값 4시간 — 킥오프 + 정규 90 + 하프타임 + 추가시간 + 종료 직후의
//   최종 갱신까지 담는다. 짧게 두면 **최종 스코어·최종 평점을 못 받은 채** 경기가 창을 벗어난다.
const windowHours = Number(flag(argv, "window") ?? 4);
/*
 * 경기 **진행 중에도** 받을 것인가.
 *
 * ⚠ **기본은 꺼져 있다(전략 C).** 화면에 `refetchInterval`이 없어 라이브로 받아도 사용자가
 *   새로고침 전까지 못 보기 때문이다 — 지금 라이브 폴링은 비용이 전액 낭비다.
 * ⚠ 켜는 시점은 **화면에 자동 갱신을 붙일 때**이고, 그때는 요금제도 함께 올려야 한다.
 *   근거 수치는 이 파일 머리말과 `docs/conventions/api-and-db.md`에 있다.
 */
const livePolling = argv.includes("--live");
/** 정규 90 + 하프타임 15 = 105분. 이 뒤부터 "끝났는지" 확인한다 */
const LIVE_MINUTES = 105;
/** 라인업이 도착하기 시작하는 시점(킥오프 20~40분 전) — 그 앞에서부터 기다린다 */
const LINEUP_LEAD_MINUTES = 60;

const env = loadEnv(["API_FOOTBALL_KEY"]);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다");
  process.exit(1);
}
guardTarget(url, allowRemote);

const supabase = createSyncClient(url, key);
const api = fixturePath ? null : createApiFootball(env.API_FOOTBALL_KEY);

// ── 1. 무엇을 받을지 정한다 ─────────────────────────────────────────────
/*
 * ⚠⚠ **킥오프 창만으로 고르지 않는다 — 그러면 무료 한도를 시즌의 4분의 3에서 넘긴다.**
 *
 *   한때 `[킥오프-1h, 킥오프+4h]` 창에 걸린 경기를 전부 대상으로 삼고 3분마다 돌았다.
 *   EPL은 하루에 킥오프 슬롯이 여럿이라(토 12:30·15:00·17:30 …) **경기당 5시간짜리 창이
 *   하나로 병합되어 10~15시간**이 되고, 그러면 하루 최대 **301요청**이다(실제 일정 213경기로
 *   시뮬레이션). 무료가 100/day이므로 **48일 중 36일에서 한도를 넘어** 그날 남은 경기를
 *   통째로 놓친다.
 *
 * → 창이 아니라 **"이 경기가 지금 받을 게 있는가"** 로 고른다. 세 상태뿐이다:
 *     ① 라인업 대기 — 킥오프 60분 전부터, 라인업이 아직 없을 때
 *     ② 진행 중     — `--live`일 때만(기본은 건너뛴다, 아래)
 *     ③ 종료 확인   — 킥오프 +105분부터, 아직 최종 데이터가 없을 때
 *   셋 다 아니면 **API를 부르지 않는다.** 라인업·스탯이 들어오고 `finished_at`이 찍히는
 *   순간 그 경기는 대상에서 빠지므로, 종료된 경기를 몇 시간씩 다시 긁던 낭비가 사라진다.
 *
 * ⚠ **②를 기본으로 끄는 이유는 요금이 아니라 쓸모다.** 화면에 `refetchInterval`이 없어
 *   라이브로 받아도 사용자는 새로고침 전까지 못 본다 → 지금은 받아 봐야 아무도 안 본다.
 *   이 전략(C)이면 하루 최대 **30요청**이라 무료로 여유롭다.
 *
 * ⚠ **판정에 필요한 "라인업·스탯이 있는가"는 우리 DB에 묻는다** — 왕복 두 번이 늘지만
 *   그건 우리 DB이고, 아끼려는 것은 **제공자 API 호출**이다.
 */
const now = Date.now();
const min = (n) => n * 60_000;

let candidates;
if (onlyMatch) {
  // ⚠ 단건 지정은 상태 판정을 건너뛴다 — 사람이 명시적으로 부른 것이라 강제 갱신이 맞다.
  const { data, error } = await supabase
    .from("match")
    .select("id, external_id, kickoff_at")
    .eq("external_id", onlyMatch);
  if (error) {
    console.error("✗ 대상 경기 조회 실패:", error.message);
    process.exit(1);
  }
  candidates = data;
} else {
  const { data, error } = await supabase
    .from("match")
    .select("id, external_id, kickoff_at, finished_at, voided_at")
    .gte("kickoff_at", new Date(now - min(windowHours * 60)).toISOString())
    .lte("kickoff_at", new Date(now + min(LINEUP_LEAD_MINUTES)).toISOString())
    .order("kickoff_at", { ascending: true });
  if (error) {
    console.error("✗ 대상 경기 조회 실패:", error.message);
    process.exit(1);
  }

  // 이미 받아 둔 것 — 있으면 그 경기는 더 받을 게 없다
  const ids = data.map((m) => m.id);
  const have = async (table) => {
    if (ids.length === 0) return new Set();
    const { data: rows, error: e } = await supabase.from(table).select("match_id").in("match_id", ids);
    if (e) {
      console.error(`✗ ${table} 확인 실패: ${e.message}`);
      process.exit(1);
    }
    return new Set(rows.map((r) => r.match_id));
  };
  const [hasLineup, hasStat] = await Promise.all([have("match_lineup"), have("match_stat")]);

  candidates = data.filter((m) => {
    // ⚠ 무효 경기는 더 받을 게 없다 — 라인업도 스탯도 오지 않는다.
    if (m.voided_at !== null) return false;
    const kickoff = new Date(m.kickoff_at).getTime();
    const elapsed = now - kickoff;

    // ① 라인업 대기 — 킥오프 전이고 아직 라인업이 없다
    if (elapsed < 0) return !hasLineup.has(m.id);
    // ② 진행 중 — 기본은 건너뛴다(위 주석)
    if (elapsed < min(LIVE_MINUTES)) return livePolling;
    // ③ 종료 확인 — 최종 데이터가 아직 없다
    return m.finished_at === null || !hasStat.has(m.id) || !hasLineup.has(m.id);
  });
}

if (candidates.length === 0) {
  // ⚠ 정상 종료다. 크론이 5분마다 도는데 받을 게 있는 순간은 하루 중 일부라, 이걸 실패로
  //   두면 알림이 노이즈가 되어 진짜 실패를 덮는다.
  console.log("받을 것이 있는 경기가 없습니다 — 할 일 없음");
  process.exit(0);
}
const targets = candidates;
console.log(
  `대상 ${targets.length}경기` +
    (onlyMatch ? " (단건 지정)" : ` (창 ${windowHours}시간${livePolling ? " · 라이브 폴링 켜짐" : ""})`),
);

const matchIdByExternal = new Map(targets.map((m) => [String(m.external_id), m.id]));

// ── 2. 받는다 ──────────────────────────────────────────────────────────
/** API-Football의 `response[]` 원소들 */
let fixtures = [];
if (fixturePath) {
  const parsed = JSON.parse(readFileSync(fixturePath, "utf8"));
  // ⚠ 단건 응답(`{response: [...]}`)과 원소 하나를 그대로 저장한 파일을 모두 받는다 —
  //   probe가 만든 캐시가 후자다.
  fixtures = Array.isArray(parsed?.response) ? parsed.response : [parsed];
} else {
  const ids = targets.map((m) => String(m.external_id));
  for (let i = 0; i < ids.length; i += MAX_IDS) {
    const chunk = ids.slice(i, i + MAX_IDS);
    let body;
    try {
      body = await api.getFixtures(chunk);
    } catch (e) {
      // ⚠ 계통적 실패다(플랜·네트워크·오류 응답) — 남은 청크도 같은 이유로 실패한다.
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
    fixtures.push(...(Array.isArray(body?.response) ? body.response : []));
    if (body?.exhausted) break; // 예산 경계 — 받은 만큼만 쓰고 끝낸다
  }
  const b = api.budget;
  console.log(
    `API ${api.used}회 사용 — 오늘 ${b.dayRemaining}/${b.dayLimit} 남음 (분당 ${b.minuteRemaining}/${b.minuteLimit})`,
  );
}

if (fixtures.length === 0) {
  console.error("✗ 받은 경기가 0건입니다 — 응답 형태를 확인하세요");
  process.exit(1);
}

// ── 3. 한국어 표기 ─────────────────────────────────────────────────────
/**
 * ⚠ **`team-names-ko.json`과 같은 운영 모델이다.** 매핑이 없으면 실패시키지 않고 영문을
 *   그대로 넣는다 — 팀은 20개라 매핑이 사실상 완결되지만 선수는 이적·콜업으로 영원히
 *   미완이고, 빠진 이름 때문에 라인업이 통째로 안 뜨는 쪽이 훨씬 나쁘다.
 * ⚠ **키가 `external_id`(제공자 선수 id)다.** 팀은 슬러그가 이름에서 결정적으로 나와 미리
 *   적어 둘 수 있지만, 선수는 동명이인이 실재해서 이름을 키로 쓰면 두 사람이 한 표기를
 *   공유한다. id는 로그에 그대로 찍히므로 채우는 사람이 찾아보기도 쉽다.
 */
let namesKo = {};
try {
  const parsed = JSON.parse(readFileSync(NAMES_KO, "utf8"));
  // ⚠ **객체인지까지 본다.** `JSON.parse("null")`은 **성공**하므로 try/catch가 잡지 못한다.
  namesKo = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
} catch {
  // 파일이 없는 것은 정상이다(아직 아무도 안 채웠다) — 조용히 영문으로 간다.
}
const unmappedPlayers = new Map();

/**
 * 감독 표기 — 선수와 **키가 다르다**(id가 아니라 영문 이름 문자열).
 * ⚠ `match_lineup.coach_name`이 텍스트라 id를 저장할 자리가 없다. 사유와 대가는
 *   `scripts/coach-names-ko.json`의 주석이 갖는다.
 */
let coachNamesKo = {};
try {
  const parsed = JSON.parse(readFileSync(COACH_NAMES_KO, "utf8"));
  coachNamesKo = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
} catch {
  // 파일이 없어도 동기화는 성공한다 — 영문이 그대로 나간다.
}
const unmappedCoaches = new Set();

function coachName(raw) {
  const name = str(raw);
  if (!name) return null;
  // ⚠ `Object.hasOwn`으로 읽는다 — 감독 이름이 `constructor`면 프로토타입 값이 잡힌다
  //   (팀 매핑에서 실제로 겪은 함정이다).
  const ko = Object.hasOwn(coachNamesKo, name) ? str(coachNamesKo[name]) : null;
  if (!ko) unmappedCoaches.add(name);
  return clampCp(ko ?? name, 100);
}

// ── 4. 변환 ────────────────────────────────────────────────────────────
const KIND = { Goal: "goal", Card: "card", subst: "substitution" };

/**
 * 제공자 스탯 이름 → 우리 슬러그.
 * ⚠ **모르는 항목은 버린다.** 화면이 라벨맵으로 그리므로 모르는 키가 들어오면 그릴 수 없고,
 *   `stat_key`의 CHECK(`^[a-z][a-z0-9_]*$`)도 제공자 표기(`"Ball Possession"`)를 거부한다.
 */
const STAT_KEY = {
  "Ball Possession": "possession",
  "Total Shots": "shots_total",
  "Shots on Goal": "shots_on_goal",
  "Shots off Goal": "shots_off_goal",
  "Blocked Shots": "shots_blocked",
  "Shots insidebox": "shots_inside_box",
  "Shots outsidebox": "shots_outside_box",
  Fouls: "fouls",
  "Corner Kicks": "corners",
  Offsides: "offsides",
  "Yellow Cards": "yellow_cards",
  "Red Cards": "red_cards",
  "Goalkeeper Saves": "saves",
  "Total passes": "passes_total",
  "Passes accurate": "passes_accurate",
  "Passes %": "passes_accuracy",
  expected_goals: "expected_goals",
  goals_prevented: "goals_prevented",
};

/*
 * ⚠ **제공자의 null을 0으로 접어도 되는 항목**(세는 값)만 적는다.
 *   퇴장 0을 `null`로 주는 것을 실측했는데, 그건 "0장"이지 "이 리그엔 퇴장 개념이 없음"이
 *   아니다. 반대로 xG의 null은 **그 리그에 xG가 없다**는 뜻이라 0으로 접으면 화면이
 *   "0.00"이라는 거짓말을 한다 → 그런 항목은 행 자체를 만들지 않는다.
 */
const COUNTER = new Set([
  "shots_total", "shots_on_goal", "shots_off_goal", "shots_blocked",
  "shots_inside_box", "shots_outside_box", "fouls", "corners",
  "offsides", "yellow_cards", "red_cards", "saves",
]);

const playerRows = new Map(); // external_id → row
const matchUpdates = [];
const lineupRows = [];
const lineupPlayerRows = [];
const eventRows = [];
const statRows = [];
const skipped = [];

/** 풀네임이 확정된 선수 — 라인업 블록의 약칭이 덮지 못하게 한다 */
const fullNamed = new Set();

/**
 * 선수를 등록하고 그 `external_id`를 돌려준다.
 *
 * ⚠⚠ **같은 응답 안에 이름이 두 형태로 온다.** 라인업 블록은 약칭(`Z. Suzuki`), 선수 블록은
 *   풀네임(`Zion Suzuki`)이다. 호출 순서로 해결하려 했더니 **약칭이 이겼다**(실측) —
 *   선수 블록을 먼저 훑어도 라인업 루프가 뒤에 돌면서 그대로 덮어쓴다.
 *   → 순서가 아니라 **출처로** 판정한다. `authoritative`(선수 블록)로 들어온 이름은
 *     그 뒤 어떤 호출도 덮지 못한다.
 * ⚠ 약칭이 저장되면 화면에서 풀네임으로 되돌릴 방법이 없고, `player-names-ko.json`을
 *   채우는 사람도 "M. Cash"만 보고 누구인지 판단해야 한다.
 */
function rememberPlayer(p, { authoritative = false } = {}) {
  if (!p?.id) return null;
  const external = String(p.id);
  if (!authoritative && fullNamed.has(external)) return external; // 이미 풀네임이 있다

  const ko = str(namesKo[external]);
  const apiName = str(p.name);
  if (!ko && apiName) unmappedPlayers.set(external, apiName);
  const name = ko ?? apiName;
  if (!name) return null; // 이름이 없으면 DB의 has_visible_char에 걸린다

  playerRows.set(external, { name: clampCp(name, 100), external_id: external });
  if (authoritative) fullNamed.add(external);
  return external;
}

for (const fx of fixtures) {
  const external = String(fx?.fixture?.id ?? "");
  const matchId = matchIdByExternal.get(external);
  if (!matchId) {
    // ⚠ 일정 동기화가 아직 이 경기를 넣지 않았다는 뜻이다. 여기서 만들지 않는다 —
    //   `match`의 writer를 둘로 늘리면 시즌·라운드 판정이 두 곳으로 갈린다.
    skipped.push(`${external} (match 행이 없다 — sync-matches를 먼저 돌리세요)`);
    continue;
  }
  const sideOf = (teamId) => (teamId === fx.teams?.home?.id ? "home" : "away");

  // ── 4-1. 경기 상태·스코어 ──
  const state = matchState(fx.fixture?.status?.short, fx.fixture?.status?.elapsed);
  if (state) {
    const home = fx.goals?.home ?? null;
    const away = fx.goals?.away ?? null;
    const hasScore = state.kind === "finished" && validScore(home) && validScore(away);
    /*
     * ⚠ **네 값을 항상 함께 쓴다.** `live_minute`는 DB CHECK로 `finished_at`·`voided_at`과
     *   공존할 수 없어서, 하나만 갱신하면 종료 순간에 23514로 거부된다 — 그게 오히려
     *   안전장치다(끝난 경기가 영원히 "진행 중"으로 남는 것을 막는다).
     * ⚠ **시계를 읽지 않는다.** `new Date()`로 폴백하면 실행할 때마다 값이 달라져 멱등성이
     *   깨진다. 제공자가 종료 시각을 주지 않으므로 킥오프로 접는다 — `finished_at`은
     *   스코어와 짝을 이루는 플래그로만 쓰이고 화면이 읽지 않는다.
     */
    const kickoffIso = isoOrNull(fx.fixture?.date);
    matchUpdates.push({
      id: matchId,
      home_score: hasScore ? home : null,
      away_score: hasScore ? away : null,
      finished_at: hasScore ? kickoffIso : null,
      voided_at: state.kind === "voided" ? kickoffIso : null,
      live_minute: state.liveMinute,
    });
  }

  // ── 4-2. 라인업 ──
  // ⚠ 선수 블록이 **풀네임의 출처**다 — 라인업 블록의 약칭이 이걸 덮지 못한다(위 주석).
  for (const t of fx.players ?? []) {
    for (const p of t.players ?? []) rememberPlayer(p.player, { authoritative: true });
  }

  for (const lu of fx.lineups ?? []) {
    const side = sideOf(lu.team?.id);
    lineupRows.push({
      match_id: matchId,
      side,
      // ⚠ 형식 CHECK(`^[1-9][0-9]?(-…){1,4}$`)를 통과하지 못하면 null로 접는다 —
      //   포메이션 하나 때문에 그 경기의 라인업이 통째로 저장되지 못하면 안 된다.
      formation: /^[1-9][0-9]?(-[1-9][0-9]?){1,4}$/.test(lu.formation ?? "")
        ? lu.formation
        : null,
      coach_name: coachName(lu.coach?.name),
    });

    const push = (list, role) => {
      let order = 0;
      for (const entry of list ?? []) {
        const external = rememberPlayer(entry.player);
        if (!external) continue;
        order += 1;
        // ⚠ 좌표는 선발만 갖는다(제공자가 벤치에 null을 준다) — DB CHECK가 그걸 강제하므로
        //   벤치에 값을 실으면 그 배치가 통째로 거부된다.
        const [r, c] =
          role === "start" ? String(entry.player.grid ?? "").split(":").map(Number) : [];
        const gridOk = Number.isInteger(r) && Number.isInteger(c) && r >= 1 && r <= 11 && c >= 1 && c <= 11;
        const shirt = Number(entry.player.number);
        lineupPlayerRows.push({
          match_id: matchId,
          side,
          _external: external, // 아래에서 우리 player.id로 바꾼다
          role,
          grid_row: gridOk ? r : null,
          grid_col: gridOk ? c : null,
          position: str(entry.player.pos) ? clampCp(str(entry.player.pos), 40) : null,
          shirt_number: Number.isInteger(shirt) && shirt >= 1 && shirt <= 99 ? shirt : null,
          rating: null, // 아래 선수 블록이 채운다
          sort_order: order,
        });
      }
    };
    push(lu.startXI, "start");
    push(lu.substitutes, "bench");
  }

  // ── 4-3. 평점 ──
  // ⚠ 경기 중 5분마다 바뀌므로 라인업 행에 얹어 **함께 upsert**한다. 별도 UPDATE로 돌리면
  //   선수 수만큼 왕복이 생긴다(한 경기 40회).
  const ratingOf = new Map();
  for (const t of fx.players ?? []) {
    for (const p of t.players ?? []) {
      /*
       * ⚠ **`Number(null)`은 0이다.** 출전하지 않은 후보는 평점이 `null`로 오는데 그대로
       *   변환하면 **0.0이 저장되어 화면이 "최악의 평점"으로 그린다**(실측 — 미출전 선수
       *   둘이 0.0으로 들어갔다). 범위 검사(`0 <= x <= 10`)도 0을 정상값으로 통과시킨다.
       *   → 변환 **전에** 값이 실제로 있는지 본다. 평점이 없는 것은 정상이고 `null`이 맞다.
       */
      const raw = p.statistics?.[0]?.games?.rating;
      if (raw === null || raw === undefined || raw === "") continue;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0 && value <= 10) {
        ratingOf.set(String(p.player.id), value);
      }
    }
  }
  for (const row of lineupPlayerRows) {
    if (row.match_id === matchId && ratingOf.has(row._external)) {
      row.rating = ratingOf.get(row._external);
    }
  }

  // ── 4-4. 사건 ──
  for (const e of fx.events ?? []) {
    const kind = KIND[e.type];
    if (!kind) continue; // `Var` 등 — 우리가 그리지 않는다
    const minute = Number(e.time?.elapsed);
    if (!Number.isInteger(minute) || minute < 0 || minute > 130) continue;
    const extra = Number(e.time?.extra);

    /*
     * ⚠⚠ **여기가 이 스크립트에서 가장 조용한 함정이다.**
     *   제공자는 교체에서 `player`에 **나간 선수**를, `assist`에 **들어온 선수**를 담는다 —
     *   이름과 정반대다(한 경기 9건 전부를 선발 명단과 대조해 확정했다). 그대로 옮겨 적으면
     *   화면의 교체 화살표가 통째로 거꾸로 그려지는데, **빌드도 타입도 잡지 못하고 값이
     *   그럴듯해 리뷰도 놓친다.**
     *   → 컬럼 이름이 `player_out_id`·`player_in_id`로 뜻을 박고 있고, 뒤집는 자리는
     *     **여기 한 곳**이다. 회귀는 `rls.sql` 섹션 32e가 "들어온 선수는 그 라인업의
     *     벤치에 있다"로 잡는다.
     */
    const mainExternal = rememberPlayer(e.player);
    const relExternal = kind === "card" ? null : rememberPlayer(e.assist);
    // 카드는 상대역이 없다(DB CHECK) · 교체는 둘 다 있어야 한다(DB CHECK)
    if (kind === "substitution" && (!mainExternal || !relExternal)) continue;
    if (mainExternal && mainExternal === relExternal) continue; // 자기 자신과 교체 불가

    eventRows.push({
      match_id: matchId,
      side: sideOf(e.team?.id),
      kind,
      minute,
      extra_minute: Number.isInteger(extra) && extra >= 1 && extra <= 30 ? extra : null,
      _mainExternal: mainExternal,
      _relExternal: relExternal,
      detail: str(e.detail) ? clampCp(str(e.detail), 60) : null,
    });
  }

  // ── 4-5. 팀 스탯 ──
  for (const t of fx.statistics ?? []) {
    const side = sideOf(t.team?.id);
    for (const s of t.statistics ?? []) {
      const statKey = STAT_KEY[s.type];
      if (!statKey) continue;
      let raw = s.value;
      if (raw === null || raw === undefined) {
        if (!COUNTER.has(statKey)) continue; // 안 준 항목 — 행을 만들지 않는다
        raw = 0;
      }
      // ⚠ 점유율·정확도는 `"39%"` 문자열로 온다 — %를 떼고 수로 담는다(단위는 화면이 안다).
      const value = Number(String(raw).replace("%", "").trim());
      if (!Number.isFinite(value)) continue;
      statRows.push({ match_id: matchId, side, stat_key: statKey, value });
    }

    /*
     * ⚠ **둘은 제공자가 아니라 우리가 센다.** 팀 합계를 주지 않기 때문인데, 화면이 스탯 표를
     *   `match_stat` 한 곳만 읽고 그리게 하려고 같은 자리에 넣는다.
     * ⚠ 원본에서 매번 다시 세므로 어긋난 채 남을 수 없다(`like_count`가 겪은 클래스와 다르다).
     */
    const teamPlayers = (fx.players ?? []).find((p) => p.team?.id === t.team?.id)?.players ?? [];
    const keyPasses = teamPlayers.reduce(
      (a, p) => a + (Number(p.statistics?.[0]?.passes?.key) || 0),
      0,
    );
    const subs = (fx.events ?? []).filter(
      (e) => e.type === "subst" && e.team?.id === t.team?.id,
    ).length;
    statRows.push({ match_id: matchId, side, stat_key: "key_passes", value: keyPasses });
    statRows.push({ match_id: matchId, side, stat_key: "substitutions", value: subs });
  }
}

// ── 5. 쓴다 ────────────────────────────────────────────────────────────
/*
 * ⚠ **순서가 계약이다.** 선수 → 경기 → 라인업(부모) → 라인업 선수 → 사건 → 스탯.
 *   FK가 그 순서를 요구하고, 부모 라인업 없이 선수만 들어가는 상태를 복합 FK가 막는다.
 * ⚠ **테이블마다 한 번의 배치로 보낸다.** 배치 하나는 SQL 한 문장이라 원자적이라서,
 *   읽는 사람에게 **선수가 6명뿐인 라인업**이 보이지 않는다. 나눠 보내면 그 창이 열린다.
 */
let failures = 0;
const report = (label, result) => {
  for (const f of result.failed) {
    console.error(`✗ ${label} 저장 실패: ${f.message}`);
    failures += 1;
  }
  if (result.aborted) {
    console.error(`✗ ${label} 계통적 실패로 중단 — 남은 ${result.skipped.length}건은 시도하지 않았습니다`);
    failures += 1;
  }
  console.log(`✓ ${label} ${result.saved.length}건`);
};

// 5-1. 선수 (이름이 바뀌면 갱신 — 한국어 매핑을 채운 뒤 다음 틱에 반영된다)
report(
  "선수",
  await upsertRows(supabase, "player", [...playerRows.values()], { onConflict: "external_id" }),
);

// ⚠ 우리 player.id가 필요하다 — upsert 응답으로 받지 않고 다시 읽는다. `ignoreDuplicates`가
//   아닌 upsert라도 **변경이 없는 행은 응답에서 빠질 수 있어** 매핑이 구멍 난다.
const externals = [...playerRows.keys()];
const playerIdByExternal = new Map();
for (let i = 0; i < externals.length; i += 500) {
  const { data, error } = await supabase
    .from("player")
    .select("id, external_id")
    .in("external_id", externals.slice(i, i + 500));
  if (error) {
    console.error("✗ 선수 id 조회 실패:", error.message);
    process.exit(1);
  }
  for (const p of data) playerIdByExternal.set(p.external_id, p.id);
}

// 5-2. 경기 상태 — ⚠ upsert가 아니라 UPDATE다. 없는 경기를 만들지 않는다.
let matchOk = 0;
for (const u of matchUpdates) {
  const { id, ...patch } = u;
  const { error } = await supabase.from("match").update(patch).eq("id", id);
  if (error) {
    console.error(`✗ 경기 ${id} 상태 갱신 실패: ${error.message}`);
    failures += 1;
  } else matchOk += 1;
}
console.log(`✓ 경기 상태 ${matchOk}건`);

// 5-3. 라인업 부모
report(
  "라인업",
  await upsertRows(supabase, "match_lineup", lineupRows, { onConflict: "match_id,side" }),
);

// 5-4. 라인업 선수
const resolvedLineup = lineupPlayerRows
  .map(({ _external, ...row }) => ({ ...row, player_id: playerIdByExternal.get(_external) }))
  .filter((row) => row.player_id !== undefined);
report(
  "라인업 선수",
  await upsertRows(supabase, "match_lineup_player", resolvedLineup, {
    onConflict: "match_id,side,player_id",
  }),
);

// 5-5. 사건
/*
 * ⚠ **충돌하면 무시한다**(`ignoreDuplicates`). 같은 사건을 여러 틱에 걸쳐 다시 받으므로
 *   갱신하면 의미가 없고, 무엇보다 `unique nulls not distinct`가 없으면 `player_id`가 비는
 *   사건이 폴링할 때마다 새 행으로 쌓인다 — 그 제약과 이 옵션이 한 쌍이다.
 */
const resolvedEvents = eventRows.map(({ _mainExternal, _relExternal, ...row }) => ({
  ...row,
  player_id: _mainExternal ? (playerIdByExternal.get(_mainExternal) ?? null) : null,
  related_player_id: _relExternal ? (playerIdByExternal.get(_relExternal) ?? null) : null,
}));
report(
  "사건",
  await upsertRows(supabase, "match_event", resolvedEvents, {
    onConflict: "match_id,side,kind,minute,extra_minute,player_id",
    ignoreDuplicates: true,
  }),
);

// 5-6. 팀 스탯
report(
  "팀 스탯",
  await upsertRows(supabase, "match_stat", statRows, { onConflict: "match_id,side,stat_key" }),
);

// ── 6. 보고 ────────────────────────────────────────────────────────────
if (skipped.length > 0) {
  console.warn(`\n⚠ 건너뛴 경기 ${skipped.length}건:`);
  for (const line of skipped) console.warn(`   ${line}`);
}
if (unmappedCoaches.size > 0) {
  console.warn(`\n⚠ 한국어 표기가 없는 감독 ${unmappedCoaches.size}명 — ${COACH_NAMES_KO}에 추가하세요:`);
  for (const name of unmappedCoaches) console.warn(`   "${name}": ""`);
}
if (unmappedPlayers.size > 0) {
  console.warn(`\n⚠ 한국어 표기가 없는 선수 ${unmappedPlayers.size}명 — ${NAMES_KO}에 추가하세요:`);
  // ⚠ 전부 찍지 않는다 — 시즌 초에는 수백 명이라 로그가 진짜 실패를 덮는다.
  for (const [id, name] of [...unmappedPlayers].slice(0, 15)) console.warn(`   "${id}": "${name}"`);
  if (unmappedPlayers.size > 15) console.warn(`   … 외 ${unmappedPlayers.size - 15}명`);
  console.warn("  (그때까지 영문 이름이 화면에 그대로 나갑니다)");
}

// ⚠ 실패가 있으면 종료코드를 올린다 — 크론이 초록으로 지나가면 아무도 눈치채지 못한다.
if (failures > 0) process.exitCode = 1;
console.log(`\n대상: ${url}`);

/**
 * API-Football(v3) 클라이언트 — 이 제공자의 함정을 한곳에 가둔다.
 *
 * 제공자를 football-data.org에서 갈아탄 이유는 그쪽에 **피치 좌표·평점·사진·xG가 아예
 * 없어** 경기 상세 화면을 만들 수 없었기 때문이다(실측 대조).
 *
 * ⚠⚠ **실패를 HTTP 200으로 돌려준다.** 플랜 제한·잘못된 파라미터가 상태 코드가 아니라
 *   본문의 `errors`에 담긴다. `res.ok`만 보면 **"성공했는데 결과가 0건"** 으로 읽혀,
 *   동기화가 조용히 아무것도 안 하고 종료코드 0을 낸다 — 크론이 초록으로 지나간다.
 *
 * ⚠ `errors`는 **비었을 때 배열, 문제가 있을 때 객체**다(`[]` ↔ `{"plan": "..."}`).
 *   `if (body.errors)`는 빈 배열도 truthy라 항상 참이고, `errors.length`는 객체에서
 *   `undefined`라 항상 거짓이다 — 둘 다 틀린다.
 */
const BASE = "https://v3.football.api-sports.io";

/** EPL. ⚠ `match` 테이블에 `competition` 컬럼이 없는 것과 한 쌍이다(지금 모든 행이 EPL이다). */
export const EPL_LEAGUE_ID = 39;

/**
 * `/fixtures?ids=a-b-c`가 한 번에 받는 경기 수의 상한.
 *
 * ⚠ **이 값이 폴러의 예산을 만든다.** 경기 하나씩 받으면 한 라운드(10경기)를 3분 간격으로
 *   105분 도는 데 350요청이라 무료 한도(100/day)를 넘지만, 묶으면 **35요청**으로 끝난다.
 *   응답에 `lineups`·`events`·`statistics`·`players`가 전부 함께 온다(실측 3경기).
 */
export const MAX_IDS = 20;

/**
 * 한 응답이 알려주는 잔여 예산.
 * ⚠ `/status`를 따로 부르지 않는다 — 그것도 하루 한도를 깎는다. 모든 응답의 헤더에 들어 있다.
 */
function readBudget(headers) {
  const num = (k) => {
    const v = Number(headers.get(k));
    return Number.isFinite(v) ? v : null;
  };
  return {
    dayRemaining: num("x-ratelimit-requests-remaining"),
    dayLimit: num("x-ratelimit-requests-limit"),
    minuteRemaining: num("x-ratelimit-remaining"),
    minuteLimit: num("x-ratelimit-limit"),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createApiFootball(key, { minDayRemaining = 3 } = {}) {
  if (!key) {
    console.error("API_FOOTBALL_KEY가 필요합니다 (또는 --fixture 로 저장된 JSON을 쓰세요)");
    process.exit(1);
  }

  /** 마지막 응답이 알려준 예산 — 호출부가 로그에 쓴다 */
  let budget = { dayRemaining: null, dayLimit: null, minuteRemaining: null, minuteLimit: null };
  let used = 0;

  async function get(path) {
    /*
     * ⚠ **분당 한도를 스스로 지킨다.** 무료는 10/분인데, 넘기면 제공자가 방화벽 차원에서
     *   차단할 수 있다고 문서가 명시한다(일시적이 아닐 수도 있다). 남은 횟수가 1 이하면
     *   창이 갱신되기를 기다린다 — 폴러가 여러 청크를 연달아 던지는 경로가 실제로 있다.
     */
    if (budget.minuteRemaining !== null && budget.minuteRemaining <= 1) {
      console.warn("⚠ 분당 한도에 근접해 60초 기다립니다");
      await sleep(60_000);
    }

    used += 1;
    let res;
    try {
      res = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": key } });
    } catch (e) {
      // ⚠ 네트워크 실패는 데이터 문제가 아니다 — 호출부가 계통적 장애로 다루도록 throw한다.
      throw new Error(`요청 실패 ${path}: ${e.message}`);
    }

    budget = readBudget(res.headers);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${path} — ${(await res.text()).slice(0, 200)}`);
    }

    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error(`JSON이 아닌 응답 ${path}`);
    }

    // ⚠ 위 주석의 그 함정 — 배열이면 정상, 객체이고 키가 있으면 실패다.
    const errors = body?.errors;
    if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
      throw new Error(`API 오류 ${path} — ${JSON.stringify(errors)}`);
    }

    /*
     * ⚠ **하루 예산이 바닥나기 전에 멈춘다.** 마지막 몇 건을 남겨 두는 이유는, 0이 된 뒤의
     *   호출이 위 `errors` 경로로 떨어져 **그 실행의 나머지가 통째로 실패**하기 때문이다 —
     *   남겨 두면 다음 틱이 정상적으로 "예산 없음"을 보고하고 끝난다.
     */
    if (budget.dayRemaining !== null && budget.dayRemaining <= minDayRemaining) {
      console.warn(
        `⚠ 하루 예산이 ${budget.dayRemaining}건 남았습니다 (한도 ${budget.dayLimit}) — 이번 실행을 여기서 멈춥니다`,
      );
      return { ...body, exhausted: true };
    }

    return body;
  }

  return {
    get,
    /** `/fixtures?ids=` — 최대 MAX_IDS개를 한 요청에. 응답에 상세가 전부 포함된다. */
    getFixtures: (ids) => get(`/fixtures?ids=${ids.join("-")}`),
    getSeasonFixtures: (season) => get(`/fixtures?league=${EPL_LEAGUE_ID}&season=${season}`),
    get budget() {
      return budget;
    },
    get used() {
      return used;
    },
  };
}

/**
 * "Regular Season - 12" → 12.
 * ⚠ `match.matchday`는 CHECK(1~38)라 컵 형식(`"Group Stage"`)은 여기서 null이 되고
 *   호출부가 그 경기를 건너뛴다. 숫자를 억지로 만들면 배치 전체가 CHECK로 죽는다.
 */
export function parseMatchday(round) {
  if (typeof round !== "string") return null;
  const m = round.match(/(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 38 ? n : null;
}

/**
 * 2026 → '2026-27'. DB CHECK `^[0-9]{4}-[0-9]{2}$`가 이 형식을 강제한다.
 * ⚠ API-Football은 시즌을 **시작 연도 정수**로 준다(football-data가 시작·종료 날짜를 주던
 *   것과 다르다) — 그래서 여기 계산이 훨씬 단순하고, 대신 값의 타입을 확인해야 한다.
 */
export function seasonLabel(season) {
  if (!Number.isInteger(season) || season < 1900 || season > 2200) return null;
  return `${season}-${String(season + 1).slice(2)}`;
}

/*
 * 경기 상태 매핑.
 *
 * ⚠ **연기(PST)는 무효가 아니다.** 나중에 새 날짜로 다시 열리므로 경기 자체는 살아 있다.
 *   그동안은 `kickoff_at`이 과거라 `match_is_open`이 false이고 `result`도 null이라,
 *   아무도 예측할 수 없고 채점도 되지 않는 상태로 조용히 대기한다 — 원하는 동작이다.
 * ⚠ **중단(SUSP·INT)도 무효가 아니다.** 재개될 수 있다.
 * ⚠ **모르는 코드는 "예정"으로 접지 않는다.** 그러면 새 상태가 생겼을 때 진행 중인 경기가
 *   예정으로 되돌아간다 → null을 돌려주고 호출부가 그 경기의 상태 갱신을 건너뛴다.
 */
const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const VOIDED = new Set(["CANC", "ABD"]);
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const SCHEDULED = new Set(["TBD", "NS", "PST"]);

export function matchState(short, elapsed) {
  if (typeof short !== "string") return null;
  if (FINISHED.has(short)) return { kind: "finished", liveMinute: null };
  if (VOIDED.has(short)) return { kind: "voided", liveMinute: null };
  if (SCHEDULED.has(short)) return { kind: "scheduled", liveMinute: null };
  if (LIVE.has(short)) {
    /*
     * ⚠ **`live_minute`는 DB CHECK로 종료·무효와 공존할 수 없다.** 그래서 이 값이 채워지는
     *   것은 오직 여기(진행 중)뿐이고, 다른 갈래는 전부 명시적으로 null을 돌려준다 —
     *   "안 건드림"으로 두면 끝난 경기가 영원히 진행 중으로 남는다.
     * ⚠ 하프타임(HT)에는 elapsed가 45로 오지만 없을 수도 있어 0으로 접는다(범위 CHECK 0~130).
     */
    const m = Number(elapsed);
    return { kind: "live", liveMinute: Number.isInteger(m) && m >= 0 && m <= 130 ? m : 0 };
  }
  return null; // 모르는 코드 — 호출부가 건너뛴다
}

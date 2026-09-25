/**
 * API-Football(v3) 클라이언트 — 이 제공자의 함정을 한곳에 가둔다.
 * 지금 소비자는 구단 엠블럼 수집(`scripts/fetch-team-crests.mjs`)뿐이다.
 *
 * ⚠⚠ **실패를 HTTP 200으로 돌려준다.** 플랜 제한·잘못된 파라미터가 상태 코드가 아니라
 *   본문의 `errors`에 담긴다. `res.ok`만 보면 **"성공했는데 결과가 0건"** 으로 읽혀,
 *   스크립트가 조용히 아무것도 안 하고 종료코드 0을 낸다.
 *
 * ⚠ `errors`는 **비었을 때 배열, 문제가 있을 때 객체**다(`[]` ↔ `{"plan": "..."}`).
 *   `if (body.errors)`는 빈 배열도 truthy라 항상 참이고, `errors.length`는 객체에서
 *   `undefined`라 항상 거짓이다 — 둘 다 틀린다.
 */
const BASE = "https://v3.football.api-sports.io";

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
  /* ⚠ **process.exit이 아니라 throw다.** 종료는 호출부(CLI)가 결정한다. */
  if (!key) {
    throw new Error("API_FOOTBALL_KEY가 필요합니다.");
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
    get budget() {
      return budget;
    },
    get used() {
      return used;
    },
  };
}

/**
 * 판정 대기열 — 어떤 보도를 언제 어떤 방식으로 다시 물을지(`judgeMode`)와 실행 상한 안에서 묻는 순서(`orderJudgeNeeds`)를 갖는다.
 * 재시도 간격·이월·우선순위 층을 고치면 묻는 수와 비용이 함께 바뀐다. 호출(`judge.mjs`의 실행부)과 파생(`derive-deals.mjs`) 사이에 놓여
 * 파생이 API 클라이언트를 끌어오지 않게 순수하게 둔다 — SDK·cheerio·DB를 import하지 않는다.
 */
import { JUDGE_MAX_PER_RUN, JUDGE_RETRY_MS, LOAN_CUE, SUMMARY_RETRY_WINDOW_MS, wantsArticle } from "./judge-parse.mjs";
import { DAY_MS, HOUR_MS, ts } from "./util.mjs";
import { VERDICT_VALUE_COLUMNS } from "./verdict-columns.mjs";

/** 판정 불가·실패 재시도 간격의 상한 — 같은 이유로 실패하는 행을 하루마다 끝없이 묻지 않는다(한 행 9회가 있었다) */
const JUDGE_BACKOFF_MAX_MS = 7 * DAY_MS;
/** 매체 RSS인데 기사 본문 없이 난 판정을, 본문을 받으러 다시 묻는 횟수 상한 */
const ARTICLE_RETRY_MAX = 2;
/** 본문 재시도를 하는 기간 — 게시 뒤 이만큼 지나면 발췌로 난 판정을 그대로 둔다(시도 횟수가 쌓이지 않아도 끝이 있게) */
const ARTICLE_RETRY_WINDOW_MS = 4 * DAY_MS;
/** 연달아 실패한 행을 "반복 실패"로 세는 기준(실행 요약·Actions 경고) */
export const REPEATED_FAILURE_ATTEMPTS = 3;

/**
 * 다시 묻기까지의 간격 — 24시간 × 2^(연속 실패 − 1), 상한 7일. 실패 기록이 없는 행(옛 행 · 0)은 24시간이다.
 * @param {number | null | undefined} attempts `verdict_attempts`
 */
export function retryDelayMs(attempts) {
  const n = Math.max(1, Number(attempts) || 0);
  return Math.min(JUDGE_RETRY_MS * 2 ** (n - 1), JUDGE_BACKOFF_MAX_MS);
}

/**
 * 지금 LLM에 물어야 하는가 — 물을 방식(`"full"` 판정 전체 · `"article"` 기사 본문을 다시 받아 볼 때만 판정 · `"summary"` 요약만)이나
 * `null`(묻지 않는다).
 *
 * - 그 선수로 판정한 적이 없다(다른 선수로 판정 · 시도 없음) · `rejudge` → 전체.
 * - `stalePrompt`(지금 지시문의 지문)가 주어졌고 그 행의 지문이 다르다 → 전체(`--rejudge-stale` — 지시문을 고친 뒤 그 지시문으로 나지 않은 행만).
 * - 판정 불가(판정 없음) → `retryDelayMs(verdict_attempts)`가 지나면 전체. 실패할수록 간격이 늘어난다.
 * - 옛 형식의 "이동"(원출력 없음 — 시점·금액을 읽기 전의 것) → 한 번 다시 묻는다. 그 시도가 실패하면(`verdict_attempts` > 0 —
 *   옛 판정은 남고 원출력은 여전히 없다) 실패 간격을 따른다. 판정은 새 답이 올 때까지 그대로 쓴다.
 * - 이월된 행(판정 시각 없이 `verdict_attempts`만 — 일시 실패)은 곧바로 전체. 단 `CARRIED_DAILY_ATTEMPTS`번 이상 이월됐으면 하루 한 번.
 * - 매체 RSS인데 기사 본문 없이 난 판정(`verdict_article_chars === 0`) → 실패 간격마다 `"article"`. 최대 `ARTICLE_RETRY_MAX`회,
 *   게시 뒤 `ARTICLE_RETRY_WINDOW_MS` 안에서만(발췌만 보고 난 판정이 영구히 남지 않게, 그러나 끝없이 묻지도 않게).
 *   `judge.mjs`는 본문을 다시 받아 보고 **또 못 받으면 API를 부르지 않는다**(시도 기록만 남기고 옛 판정을 지킨다) — 본문 없이 같은 글을
 *   다시 물으면 비용만 들고, 비결정적인 답이 멀쩡한 판정을 뒤집는다.
 * - "이동"인데 요약이 없다 → 실패 간격이 지났고 최근 `SUMMARY_RETRY_WINDOW_MS` 안의 보도면 **요약만**(`judge.mjs`가 판정은 건드리지 않는다).
 */
/**
 * 원출력(`verdict_raw`)이 있는 행인가 — 금액까지 읽는 형식으로 판정된 행이라는 표지다.
 * ⚠ 평소 파생은 원출력 값을 읽지 않고 표지(`has_raw`)만 단다(`loadRows`). 판정·재생이 그 행에 새 값을 입히면 `verdict_raw` 키가
 *   생기므로 그때는 그 값이 이긴다(표지는 읽은 순간의 것이다).
 */
export const hasRawVerdict = (r) => ("verdict_raw" in r ? r.verdict_raw != null : r.has_raw === true);

export function judgeMode(r, key, nowMs, { rejudge = false, upgrade = false, stalePrompt = null, loanOnly = false } = {}) {
  if (rejudge) return "full";
  const attempts = Number(r.verdict_attempts) || 0;
  if (isCarried(r) && attempts >= CARRIED_DAILY_ATTEMPTS) return carriedSlotDue(r, nowMs) ? "full" : null;
  if (r.verdict_player !== key || !r.verdict_at) return "full";
  // `loanOnly`(`--rejudge-stale --loan-only`) — 지시문이 바뀐 행 중 **임대를 말하는 행만** 다시 묻는다(임대 필드를 더한 지시문 변경의
  // 비용을 임대 보도로 좁힌다. 나머지 낡은 판정은 형태가 없는 것(모른다)으로 읽혀 틀린 값이 되지 않는다)
  if (stalePrompt && r.verdict_prompt !== stalePrompt && (!loanOnly || mentionsLoan(r))) return "full";
  const waited = nowMs - Date.parse(r.verdict_at) >= retryDelayMs(attempts);
  if (r.verdict == null) return waited ? "full" : null;
  if (upgrade && r.verdict === "move" && !hasRawVerdict(r) && (attempts === 0 || waited)) return "full";
  if (r.verdict_article_chars === 0 && wantsArticle(r) && attempts <= ARTICLE_RETRY_MAX && waited && nowMs - ts(r) <= ARTICLE_RETRY_WINDOW_MS) return "article";
  if (r.verdict === "move" && r.summary_ko == null && waited && nowMs - ts(r) <= SUMMARY_RETRY_WINDOW_MS) return "summary";
  return null;
}

/** 임대를 말하는 보도인가 — 저장된 글(영문)이나 판정 요약(한국어)에 임대 낱말이 있다(`--loan-only`의 대상) */
export const mentionsLoan = (r) => LOAN_CUE.test(r.body ?? "") || /임대/u.test(r.summary_ko ?? "");

/** 이월된 행 — 앞 실행에서 일시 실패로 판정을 못 받았다(판정 시각 없이 `verdict_attempts`만 있다) */
const isCarried = (r) => !r.verdict_at && (Number(r.verdict_attempts) || 0) > 0;
/**
 * 이월이 이만큼 거듭되면 하루에 한 번만 묻는다. 일시 실패(레이트 리밋·장애)는 누락 없이 다시 검사해야 해서 포기하지 않지만, 판정 시각이
 * 없어 재시도 간격(`retryDelayMs`)이 걸리지 않으므로 그대로 두면 같은 행이 매시 대기열 앞줄을 차지한다(계속 실패하는 행이면 영영).
 * 6회 = 매시 실행으로 여섯 시간 — 일시 장애가 풀리기에 충분한 시간이다.
 */
export const CARRIED_DAILY_ATTEMPTS = 6;
/**
 * 하루 한 번의 그 시간 — 시각 컬럼 없이 결정적으로 고른다(UTC 시 % 24 === 행 id % 24). 행마다 시간이 흩어져 한 시간에 몰리지 않는다.
 * 실행이 그 시간을 건너뛰면(Actions 지연) 다음 날로 밀린다 — 간격이 하루 더 늘 뿐 행을 잃지는 않는다.
 */
function carriedSlotDue(r, nowMs) {
  const hour = Math.floor(nowMs / HOUR_MS) % 24;
  return hour === (((Number(r.id) || 0) % 24) + 24) % 24;
}

/** 물을 때 함께 넘기는 그 행의 기존 판정(`judge.mjs`가 새 답이 실패하면 옛 판정을 지키는 데 쓴다) */
const PREV_COLUMNS = [...VERDICT_VALUE_COLUMNS, "verdict_at", "verdict_attempts"];
const prevVerdict = (r) => Object.fromEntries(PREV_COLUMNS.map((c) => [c, c === "verdict_attempts" ? Number(r[c]) || 0 : (r[c] ?? null)]));

/** 우선순위 층 — 작을수록 먼저. 같은 층에서는 최신 보도가 먼저다 */
export const JUDGE_TIER = { settled: 1, newDeal: 2, existing: 3, explore: 4 };
const TIER_SPAN = 1e13; // 층 사이 간격 — 밀리초 시각(약 1.8e12)보다 커서 층이 섞이지 않는다
/** 이월된 행을 같은 층 안에서 앞당기는 폭 — 층 안의 시각 항(TIER_SPAN − 게시 ms ≥ 약 8e12)보다 작아 다른 층으로 넘어가지 않는다 */
const CARRIED_LEAD = 5e12;
/** 규칙이 완료·확정으로 읽은 보도 — 맞으면 보드의 가장 큰 소식이라 맨 먼저 묻는다 */
const RULE_SETTLED = new Set(["official", "here_we_go"]);

/**
 * 물을 대상 하나 — `judge.mjs`가 받는 모양(계약서의 need). `priority`는 층 × 간격 + (간격 − 게시 시각) — 같은 층이면 최신이 먼저.
 * 요약만·본문 재시도는 새 판정보다 급하지 않아 기존 딜 층 아래로 내린다.
 */
export function judgeNeed(r, { playerKey, player, clubs, mode, tier }) {
  const t = Number.isFinite(ts(r)) ? ts(r) : 0;
  const layer = RULE_SETTLED.has(r.stage) ? JUDGE_TIER.settled : tier;
  // 이월된 행(앞 실행에서 일시 실패로 판정을 못 받았다 — 판정 시각 없이 `verdict_attempts`만 있다)은 같은 층에서 먼저 묻는다.
  // 같은 층의 새 보도보다 뒤에 서면 대기열이 길 때 계속 밀려 판정 없이 남는다
  // ⚠ 하루 한 번으로 늦춘 행(`CARRIED_DAILY_ATTEMPTS`)은 앞당기지 않는다 — 거듭 실패하는 행이 그 시간의 앞줄을 먹지 않게
  const carried = isCarried(r) && (Number(r.verdict_attempts) || 0) < CARRIED_DAILY_ATTEMPTS;
  // 요약만·본문 재시도는 이미 판정이 있는 행이라 새 판정보다 급하지 않다 — 기존 딜 층 아래로 내린다
  const floor = mode === "summary" || mode === "article" ? JUDGE_TIER.existing : layer;
  const priority = Math.max(layer, floor) * TIER_SPAN + (TIER_SPAN - t) - (carried ? CARRIED_LEAD : 0);
  return {
    id: r.id, playerKey, player, body: r.body, clubs, source_id: r.source_id, external_id: r.external_id, url: r.url, summary_ko: r.summary_ko ?? null,
    published_at: r.published_at ?? null, mode, prev: prevVerdict(r), priority,
  };
}

/**
 * 물을 대상을 우선순위로 정렬한다 — 실행당 상한(`limit`)에 걸리면 앞의 것만 묻는다(`runJudgements`가 앞에서 자른다).
 * 상한 안에서 탐색용(선수 없이 묻는 행 — 규칙이 선수를 못 뽑은 보도·넓힌 후보)은 `exploreMax`건까지만 앞에 두고, 나머지는 뒤로 민다
 * (탐색이 상한을 다 먹어 새 딜의 보도가 한 시간씩 밀리지 않게 — 10-01 백필에서 118건 중 58건이 넘겨졌다).
 * 순수 함수 — 같은 입력이면 같은 순서다(동률은 행 id).
 */
export function orderJudgeNeeds(needs, { limit = JUDGE_MAX_PER_RUN, exploreMax = Math.round(limit / 3) } = {}) {
  const sorted = [...needs].sort((a, b) => a.priority - b.priority || a.id - b.id);
  const head = [];
  const rest = [];
  let explored = 0;
  for (const n of sorted) {
    const explore = n.playerKey == null;
    if (head.length < limit && (!explore || explored < exploreMax)) {
      head.push(n);
      if (explore) explored += 1;
    } else rest.push(n);
  }
  return [...head, ...rest];
}

/**
 * LLM 판정 — 규칙이 딜 후보로 묶은 보도 한 건에 **한 번의 호출**로 판정·추출·요약을 함께 얻는다.
 *
 *   move          이 보도가 <선수>의 구단 이동을 말하는가. **거부권** — 규칙이 만든 후보를 지울 수 있다.
 *   player        규칙이 선수를 못 뽑은 보도에서 이동 당사자 이름(원문 표기). 이 이름도 검증 관문(사전·위키데이터)을 지나야 딜이 된다.
 *   player_ko     선수의 한글 표기 — 팬들이 쓰는 통용 표기. `transfer_name_ko`에 `source = 'llm'`으로 쌓여 위키데이터 레이블을 덮는다(사람 사전이 그 위).
 *   stage         보도가 말하는 단계 — 판정이 있는 보도는 **이 값이 그 보도의 단계다**(규칙 단계는 판정 전까지만, `derive-deals.mjs`의 `stageFor`).
 *   from / to / suitors  출발·행선지·그 밖의 관심 구단. 모델은 **원문에 적힌 구단명을 그대로** 옮기고, 코드가 원문 대조 →
 *                 구단 사전 정규화 → 사전 밖 이름은 **위키데이터로 축구 클럽인지 확인**한다(`resolveClubs`). 원문에 없는 구단은 받지 않는다.
 *   timing        그 이동 소식이 지금의 것(current)인가 지난 일의 회고(past)인가 — past면 코드가 "이동 아님"으로 접는다.
 *   on_loan       보도 시점에 선수가 임대 중이면 보유 구단(owner)과 지금 임대로 뛰는 구단(at). 구단과 같은 대조·확인을 지난다.
 *   form          사건의 형태(완전 이적·임대·완전 영입 전환·진행 중 임대·조기 복귀·임대 연장)와 loan_clause(옵션·의무).
 *                 원문에 임대 낱말이 없으면 코드가 완전 이적으로 접는다(`judgeLoan`). 진행 중 임대(loan_standing)는 단계가 없다.
 *   fee           그 선수의 금액 하나와 그 성격(이적료·제안액·요구액·바이아웃·평가액). 코드가 **원문에 그 금액이 있는지** 대조한다.
 *   summary_ko    한국어 1~2문장 요약(이동일 때만). 원문 전문을 번역하지 않는다 — DB CHECK 160자.
 *
 * 모델이 낸 JSON은 `verdict_raw`에 그대로 남긴다 — 해석(`parseJudgement` — `judge-parse.mjs`)을 고쳤을 때 API를 다시 부르지 않고 재생한다(`replayJudgements`).
 *
 * `transfer_news.verdict*`·`summary_ko`의 유일한 writer이고, `transfer_name_ko`의 통용 표기 행(`source = 'llm'`)도 여기서 쓴다.
 *
 * 비용 규칙
 *   - 보도(·선수) 쌍마다 한 번. 판정·추출·요약을 따로 부르지 않는다(원문을 두 번 보내지 않는다).
 *   - 지시문은 모든 호출이 같은 문자열이다 → prompt cache(`cache_control`). 행마다 다른 것은 사용자 메시지로 간다.
 *   - 출력은 JSON 스키마로 고정한다(`output_config.format`) — 형식 위반으로 버리는 호출이 없다.
 *   - 매체 RSS는 기사 본문을 받아 싣는다(저장된 글은 제목과 두 줄 발췌뿐이라 회고 기사와 새 루머를 가르지 못한다).
 *     본문은 요청에만 싣고 저장하지 않는다(재배포 원칙 — `api-and-db.md`). 상한 `ARTICLE_MAX_CHARS`.
 *   - 5대 리그 구단이 하나도 걸리지 않은 후보는 파생이 여기까지 보내지 않는다(`derive-deals.mjs`).
 *   - 글자만 보낸다 — 이미지 블록도 도구(웹 검색·열기)도 없고 링크 주소는 걷는다.
 */
import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import { detectClubs, isKnownClub } from "./clubs.mjs";
import { NAME_TABLE, cacheLlmNames, formatNewNameLog, loadGlossary, renameInSummary, shortKoClubName } from "./names-ko.mjs";
import { COLLECTOR_UA } from "./sources.mjs";
import { lookupKo } from "./wikidata.mjs";
import { normalizePlayer } from "./player-key.mjs";
import { sha1Hex } from "./util.mjs";
import { VERDICT_VALUE_COLUMNS } from "./verdict-columns.mjs";
import { ARTICLE_MAX_CHARS, JUDGE_CONFIG, buildJudgeRequest, buildSystem, ellipsize, judgeFingerprint, prepareJudgeInput } from "./judge-prompt.mjs";
import { JUDGE_MAX_PER_RUN, SUMMARY_MAX_CHARS, localizeSummary, parseJudgement, wantsArticle } from "./judge-parse.mjs";

// 요청 쪽(지시문·출력 형식·사용자 메시지)은 judge-prompt.mjs에 있다 — 기존 소비자가 이 파일에서 가져가던 이름을 그대로 내보낸다
export * from "./judge-prompt.mjs";
// 해석(순수 함수)은 judge-parse.mjs에 있다 — 같은 이유로 그대로 내보낸다
export * from "./judge-parse.mjs";

/**
 * 호출 한 건의 시간 상한 — SDK 기본값(10분)이면 응답 없이 붙들린 연결 하나가 재시도까지 30분 동안 실행을 묶는다(실측: 끊긴
 * 연결 셋이 30분 넘게 진행이 없었다). 판정 한 건은 생각을 켜도 수십 초 안에 끝난다 — 시간이 다 되면 일시 실패로 쳐 다음 실행이 다시 묻는다.
 */
const JUDGE_TIMEOUT_MS = 60_000;
/** SDK 재시도 횟수 — 시간 초과·5xx를 SDK가 다시 보내는 횟수. 호출 한 건이 묶이는 최대 시간은 상한 × (재시도 + 1)이다 */
const JUDGE_SDK_RETRIES = 1;
/**
 * 판정 단계 전체의 시간 예산 — 정기 실행은 작업 시간 상한(워크플로 `timeout-minutes: 10`) 안에서 수집·파생·저장·알림까지 끝내야 한다.
 * 판정이 예산을 넘기면 남은 행은 묻지 않고 다음 실행으로 넘긴다(강제 종료되면 딜 저장까지 통째로 잃는다).
 */
const JUDGE_TIME_BUDGET_MS = 5 * 60_000;
/** 일시 실패가 이만큼 연달아 나면 장애로 보고 이번 실행의 판정을 멈춘다 — 장애 중에 호출마다 시간 상한을 다 쓰지 않게 */
const JUDGE_TRANSIENT_STREAK_MAX = 3;
/** 영구 실패(일시 실패가 아닌 API 오류·저장 실패)가 이만큼 연달아 나면 멈춘다 */
const JUDGE_FAIL_STREAK_MAX = 5;
/**
 * 동시에 묻는 보도 수 — 한 건이 본문 받기·호출·구단 확인·저장을 차례로 기다려 직렬이면 예산 안에 묻는 수가 호출 시간에 묶인다.
 * 첫 건은 홀로 묻는다(지시문 캐시를 데운 뒤에 나머지가 그 캐시를 읽게). 레이트 리밋·사용 한도에 닿으면 새로 보내지 않는다.
 */
const JUDGE_CONCURRENCY = 3;
/** 연속 실패 수 상한 — DB CHECK(`transfer_news_verdict_attempts_range`, 0~100) 안에 묶는다 */
const ATTEMPTS_MAX = 100;
const nextAttempts = (prev) => Math.min((Number(prev) || 0) + 1, ATTEMPTS_MAX);
/**
 * API 일시 실패인가 — 시간 초과·연결 끊김·과부하(529)·서버 오류(5xx)·408·409. 같은 요청을 다시 보내면 성공할 수 있는 실패다.
 * 이런 실패는 판정 결과가 아니므로 판정 컬럼에 아무것도 쓰지 않고, 실행 끝에 한 번 더 묻고, 그래도 실패하면 다음 실행으로
 * 이월한다(`runJudgements`) — 시간 초과로 빠진 보도가 판정 없이 남지 않게.
 */
export function isTransientApiError(e) {
  if (e instanceof Anthropic.APIConnectionError) return true; // 시간 초과(APIConnectionTimeoutError) 포함
  return e instanceof Anthropic.APIError && typeof e.status === "number" && (e.status >= 500 || e.status === 408 || e.status === 409);
}
/** 원출력 상한 — DB CHECK(`transfer_news_verdict_raw_len`)와 같은 값 */
const RAW_MAX_CHARS = 2_000;
const ARTICLE_TIMEOUT_MS = 10_000;
/**
 * 기사 본문을 일시 실패(시간 초과·연결 실패·429·5xx)로 못 받았을 때 한 번 더 받기 전에 기다리는 시간.
 * 그래도 못 받으면 발췌로 판정하고 `verdict_article_chars = 0`을 남긴다 — 파생이 본문을 받으러 다시 묻는다(`judgeMode`).
 */
const ARTICLE_RETRY_DELAY_MS = 1_500;

// ── 기사 본문 ──────────────────────────────────────────────────────────

/** 기사 HTML → 본문 글자. JSON-LD `articleBody`(가장 긴 것) → 없으면 기사 영역의 문단. 못 찾으면 빈 문자열 */
export function extractArticleText(html) {
  const $ = cheerio.load(html);
  const bodies = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (v) => {
        if (Array.isArray(v)) return v.forEach(walk);
        if (v && typeof v === "object") {
          if (typeof v.articleBody === "string") bodies.push(v.articleBody);
          Object.values(v).forEach(walk);
        }
      };
      walk(JSON.parse($(el).text()));
    } catch {
      // 깨진 JSON-LD는 건너뛴다
    }
  });
  const longest = bodies.sort((a, b) => b.length - a.length)[0];
  // articleBody가 HTML째 들어오는 매체가 있다 — 태그를 걷어 글자만 보낸다
  const text = (longest != null ? (/<[a-z][^>]*>/iu.test(longest) ? cheerio.load(longest.replace(/<\/(?:p|h\d|li)>/giu, "$& ")).root().text() : longest) : null) ??
    $("article p, main p, [itemprop=articleBody] p").map((_, p) => $(p).text().trim()).get().filter((t) => t.length > 40).join("\n");
  return ellipsize(String(text).replace(/\s+/gu, " ").trim(), ARTICLE_MAX_CHARS);
}

/** 기사 본문 받기 — 실패하면 빈 문자열(저장된 글만으로 판정한다). 던지지 않는다 */
export async function fetchArticleText(url, fetchImpl = fetch, { retries = 1, retryDelayMs = ARTICLE_RETRY_DELAY_MS } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    let transient;
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": COLLECTOR_UA }, signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS), redirect: "follow" });
      if (res.ok) return extractArticleText(await res.text());
      // 403·404(차단·없는 기사)는 다시 받아도 같다 — 429·5xx만 일시 실패로 본다
      transient = res.status === 429 || res.status >= 500;
    } catch {
      transient = true; // 시간 초과·연결 실패
    }
    if (!transient || attempt >= retries) return "";
    await new Promise((r) => setTimeout(r, retryDelayMs));
  }
}

// ── 구단 확인 ─────────────────────────────────────────────────────────

/**
 * 원문 표기의 구단들 → 정규 영문명. 구단 사전에 있으면 정규명, 없으면 **위키데이터에서 축구 클럽으로 확인된 이름만** 원문 표기
 * 그대로 받는다(캐시 `transfer_name_ko`에 남고, 표기가 있으면 화면·요약이 그 한글명을 쓴다). 확인되지 않으면 null.
 * @param {{ from: string | null, to: string | null, suitors: string[], loanOwner?: string | null, loanClub?: string | null }} m 임대 상태(보유 구단·임대 구단)도 같은 확인을 지난다
 * @param {ReturnType<import("./names-ko.mjs").createNameBook>} book
 * @param {{ lookup?: typeof lookupKo, cacheRows?: object[], nowMs?: number }} opts `cacheRows`에 새로 확인한 행을 모아 준다(호출부가 한 번에 쓴다)
 */
export async function resolveClubs(m, book, { lookup = lookupKo, cacheRows = [], nowMs = Date.now() } = {}) {
  const memo = new Map();
  const resolve = async (raw) => {
    if (!raw) return null;
    if (memo.has(raw)) return memo.get(raw);
    // 같은 실행에서 이미 찾아본 이름은 다시 찾지 않는다 — 두 번 쌓인 같은 키가 일괄 저장을 통째로 실패시킨다
    const seen = cacheRows.find((c) => c.kind === "club" && c.key === raw);
    if (seen) { memo.set(raw, seen.wikidata_id ? raw : null); return memo.get(raw); }
    // 사전의 정규명 그대로 적은 이름은 그 구단이다 — 일반어와 철자가 같아 별칭이 풀네임뿐인 프리셋 구단("Lens"·"Nice"·"Angers" —
    // `clubs.mjs`)은 매칭으로 잡히지 않는데, 프리셋이라 아래 위키데이터 확인도 건너뛰어 "축구 클럽이 아니다"로 버려졌다(리그 1 딜의
    // 출발·행선지가 비었다). 원문 대조(`mentionIn`)는 이미 지난 이름이다
    let out = detectClubs(raw)[0] ?? (isKnownClub(raw) ? raw : null);
    if (!out) {
      if (book.isVerifiedClub(raw)) out = raw;
      else if (!book.needsLookup("club", raw, nowMs)) out = null; // 최근에 찾아봤지만 축구 클럽이 아니었다
      else {
        try {
          if ([...raw].length > 120) throw new Error("키가 캐시 상한(120자)을 넘는다"); // 이름이 아니라 문장 조각이다
          const r = await lookup(raw, "club");
          // 판정을 동시에 돌리면 다른 보도가 같은 이름을 기다리는 사이에 먼저 쌓았을 수 있다 — 한 키는 한 행만
          if (!cacheRows.some((c) => c.kind === "club" && c.key === raw)) cacheRows.push({ kind: "club", key: raw, name_en: raw.slice(0, 120), name_ko: r.nameKo, wikidata_id: r.wikidataId, source: "wikidata", checked_at: new Date().toISOString() });
          out = r.wikidataId ? raw : null;
        } catch {
          out = null; // 네트워크 오류 — 캐시에 남기지 않는다(다음에 다시 찾는다)
        }
      }
    }
    memo.set(raw, out);
    return out;
  };
  let from = await resolve(m.from);
  let to = await resolve(m.to);
  if (from && from === to) from = to = null;
  const suitors = [];
  for (const s of m.suitors) {
    const c = await resolve(s);
    if (c && c !== from && c !== to && !suitors.includes(c)) suitors.push(c);
  }
  const loanOwner = await resolve(m.loanOwner ?? null);
  let loanClub = await resolve(m.loanClub ?? null);
  if (loanClub && loanClub === loanOwner) loanClub = null;
  return { from, to, suitors, loanOwner, loanClub };
}

// ── 실행 ──────────────────────────────────────────────────────────────

/**
 * 판정에 쓴 원문의 지문(`verdict_input`) — 모델에 보낸 **번호 붙은 원문**(`numbered.text`)의 sha1 앞 16자.
 * 근거가 문장 번호라 재생은 그 번호가 가리키던 원문과 같은 글이어야 읽을 수 있다 — 다시 받은 기사 본문이 바뀌면 지문이 갈려
 * 재생이 그 행을 건드리지 않는다. 요청 전체(`inputFingerprint`)가 아니라 원문만 보는 이유: 요청의 <표기>는 이름 사전을 따라
 * 판정 뒤에도 바뀐다(판정이 쌓은 통용 표기·구단 표기가 다음 요청의 <표기>에 실린다) — 요청 전체로 대조하면 재생이 늘 막힌다.
 */
export const sourceFingerprint = (numberedText) => sha1Hex(String(numberedText), 16);

/** 그 행에 이미 있는 판정 중 **지금 묻는 선수의 것**(이동·이동 아님) — 없으면 null */
function standingVerdict(n) {
  const p = n.prev;
  if (!p || (p.verdict !== "move" && p.verdict !== "not_move")) return null;
  // 선수를 비워 물은 행은 그 행의 판정이 곧 그 보도의 판정이다(선수는 판정이 읽은 것)
  return n.playerKey == null || p.verdict_player === n.playerKey ? p : null;
}

/**
 * 이번 실행의 통용 표기·요약 기록 — 같은 선수의 표기를 모델이 실행 안에서 갈라 적는다("주앙/조앙", "마누/마뉴"). 먼저 처리된 행의
 * 값이 캐시·제목·요약을 차지하지 않게 후보를 전부 모았다가 실행 끝에 다수결로 정하고(`cacheLlmNames` → `pickConsensusKo`),
 * 이번 실행에서 다른 표기로 쓴 요약을 확정 표기로 맞춘다(`flushNames`).
 */
const newNameRun = () => ({ koEntries: [], summaries: [] });

/**
 * 해석된 판정 → 저장할 값. 판정 실행(`runJudgements`)과 재생(`replayJudgements`)이 함께 쓴다.
 * @param {{ id: number, playerKey: string | null, player: string | null, summary_ko?: string | null, mode?: "full" | "summary", prev?: object | null }} n
 * @param {object} ctx `out`(집계) · `book`(이름) · `nameRun` · `clubCache` · `lookup` · `nowMs` · `verdictAt` ·
 *   `provenance`(실제 호출일 때만 — 모델·지시문 지문·원문 지문·기사 본문 글자 수. 재생은 새 시도가 아니라 없다)
 */
async function settleJudgement(n, judged, rawText, ctx) {
  const { out, book, nameRun, clubCache, lookup, nowMs, provenance } = ctx;
  // 경고를 받을 자리 — 판정 실행은 보도마다 따로 모았다가 보도 순서대로 옮긴다(동시에 돌아 끝나는 순서가 갈린다)
  const warnings = ctx.warnings ?? out.warnings;
  const at = ctx.verdictAt ?? new Date().toISOString();
  const label = n.player ?? judged.player ?? "?";
  const attempts = nextAttempts(n.prev?.verdict_attempts);
  const standing = standingVerdict(n);
  const trusted = (k) => (book.playerKoTrusted ?? book.playerKo)(k) ?? null;
  const clubKo = (raw) => {
    const c = detectClubs(raw)[0] ?? (book.isVerifiedClub(raw) ? raw : null);
    const name = c ? (book.club(c)?.name ?? null) : null;
    // 요약에는 짧은 이름 — "헐 시티 AFC"·"베식타시 JK"가 문장에 그대로 들어갔다
    return name ? shortKoClubName(name) : null;
  };
  /** 요약 한 줄 — 이름을 사전 표기로 맞추고, 통용 표기 후보를 모은다 */
  const summarize = (key) => {
    const ko = book.playerKo(key) ?? null;
    if (judged.playerKo && !trusted(key)) nameRun.koEntries.push({ id: n.id, key, name: judged.player, ko: judged.playerKo });
    const text = localizeSummary(judged.summary, { player: judged.player, playerKoByModel: judged.playerKo, ko, rawClubs: judged.rawClubs, clubKo });
    // 믿을 수 있는 표기가 없던 선수의 요약은 실행 끝에 확정 표기로 다시 맞춘다 — 지금 요약에 들어간 표기를 적어 둔다
    const used = ko ?? judged.playerKo;
    return { text, pending: !trusted(key) && used ? { key, used } : null };
  };

  // 요약만 다시 받기 — 판정은 이미 있다. 새 답이 판정을 다르게 읽어도 판정 컬럼은 건드리지 않는다(요약 하나 때문에 딜 단계가 흔들렸다)
  if (n.mode === "summary" && standing?.verdict === "move") {
    const key = n.playerKey ?? standing.verdict_player;
    if (judged.kind === "move" && judged.summary && normalizePlayer(judged.player) === key) {
      out.summarized += 1;
      const s = summarize(key);
      const update = { summary_ko: s.text, verdict_at: at, verdict_attempts: 0 };
      if (s.pending) nameRun.summaries.push({ id: n.id, ...s.pending, update });
      return update;
    }
    out.summaryInvalid += 1;
    const why = judged.kind === "move" ? (judged.summary ? "다른 선수로 읽었다" : judged.summaryIssue) : judged.kind === "invalid" ? judged.reason : "이번에는 이동 아님으로 읽었다";
    warnings.push(`#${n.id} 요약 재시도 실패(${label}): ${why} — 판정과 옛 요약은 그대로 둔다`);
    return { verdict_at: at, verdict_attempts: attempts };
  }

  // 판정 불가인데 그 선수의 판정이 이미 있으면 지우지 않는다 — 시각과 실패 횟수만 남긴다
  if (judged.kind === "invalid" && standing) {
    out.invalid += 1;
    out.kept += 1;
    if (judged.truncated) out.truncated += 1;
    warnings.push(`#${n.id} 판정 불가(${label}): ${judged.reason}${judged.quote ? ` — "${judged.quote}"` : ""} — 옛 판정(${standing.verdict})을 그대로 둔다(${attempts}회째)`);
    return { verdict_at: at, verdict_attempts: attempts };
  }

  const update = {
    verdict: null, verdict_player: n.playerKey, verdict_player_name: null, verdict_evidence: null, verdict_from: null, verdict_to: null,
    verdict_suitors: [], verdict_stage: null, verdict_at: at,
    verdict_fee_amount: null, verdict_fee_currency: null, verdict_fee_kind: null,
    verdict_form: null, verdict_loan_owner: null, verdict_loan_club: null, verdict_loan_clause: null,
    // 원출력 — 상한을 넘거나(요약이 비정상적으로 길다) 출력 상한에 잘렸으면 남기지 않는다. 잘린 JSON은 재생할 수 없다
    verdict_raw: rawText && !judged.truncated && [...rawText].length <= RAW_MAX_CHARS ? rawText : null,
    // 실패 횟수 — 판정 불가는 +1. 매체 RSS인데 본문을 못 받은 채 낸 판정도 +1이다(파생이 이 값으로 본문 재시도를 센다), 받았으면 0
    ...(provenance ? { ...provenance, verdict_attempts: judged.kind === "invalid" || provenance.verdict_article_chars === 0 ? attempts : 0 } : {}),
  };
  if (judged.kind === "move") {
    out.move += 1;
    const key = n.playerKey ?? normalizePlayer(judged.player);
    if (!n.playerKey) out.extractedPlayers += 1;
    const clubs = await resolveClubs(judged, book, { lookup, cacheRows: clubCache, nowMs });
    for (const [raw, ok] of [[judged.from, clubs.from], [judged.to, clubs.to]]) if (raw && !detectClubs(raw).length) out[ok ? "clubsVerified" : "clubsRejected"] += 1;
    Object.assign(update, {
      verdict: "move", verdict_player: key, verdict_player_name: judged.player, verdict_evidence: judged.evidence,
      verdict_from: clubs.from, verdict_to: clubs.to, verdict_suitors: clubs.suitors, verdict_stage: judged.stage,
      verdict_fee_amount: judged.fee?.amount ?? null, verdict_fee_currency: judged.fee?.currency ?? null, verdict_fee_kind: judged.fee?.kind ?? null,
      verdict_form: judged.form ?? null, verdict_loan_owner: clubs.loanOwner ?? null, verdict_loan_club: clubs.loanClub ?? null, verdict_loan_clause: judged.loanClause ?? null,
    });
    if (judged.summary) {
      out.summarized += 1;
      const s = summarize(key);
      update.summary_ko = s.text;
      if (s.pending) nameRun.summaries.push({ id: n.id, ...s.pending, update });
    } else {
      out.summaryInvalid += 1;
      warnings.push(`#${n.id} 요약 버림(${label}): ${judged.summaryIssue} — 다음 실행이 다시 묻는다`);
      // 통용 표기는 요약이 없어도 후보다
      if (judged.playerKo && !trusted(key)) nameRun.koEntries.push({ id: n.id, key, name: judged.player, ko: judged.playerKo });
      // 옛 요약이 있으면 둔다(다시 물은 경우) — 영문으로 되돌릴 이유가 없다
      if (!n.summary_ko) update.summary_ko = null;
    }
  } else if (judged.kind === "not_move") {
    out.notMove += 1;
    if (judged.unnamed) out.unnamed += 1; // 이적 글이지만 선수를 특정할 수 없다 — 딜 후보가 아니라 not_move로 접는다(다시 묻지 않는다)
    // 한 토큰 이름이라 접은 글은 사람이 봐야 한다 — 진짜 한 이름 선수(Patric·Dodo)는 사람 사전에 넣어야 열린다
    if (judged.unnamed && judged.mention) warnings.push(`#${n.id} 한 토큰 이름이라 선수를 특정하지 못했다: "${judged.mention}" — 선수가 맞으면 players-ko.json에 넣는다`);
    if (judged.retrospective) out.retrospective += 1;
    if (judged.titleOnly) out.titleOnly += 1;
    Object.assign(update, { verdict: "not_move", verdict_evidence: judged.evidence, summary_ko: null });
  } else {
    out.invalid += 1;
    if (judged.truncated) out.truncated += 1;
    // 판정이 없는 행에 요약이 남으면 재계약·회고의 요약이 화면에 나간다(운영) — 판정과 함께 비운다
    update.summary_ko = null;
    warnings.push(`#${n.id} 판정 불가(${label}): ${judged.reason}${judged.quote ? ` — "${judged.quote}"` : ""} — 다음 재시도에서 다시 묻는다${provenance ? `(${attempts}회째)` : ""}`);
  }
  return update;
}

const newStats = (read) => ({
  transient: [],
  read, move: 0, notMove: 0, unnamed: 0, retrospective: 0, titleOnly: 0, invalid: 0, kept: 0, truncated: 0, summarized: 0, summaryInvalid: 0, failed: 0, extractedPlayers: 0,
  clubsVerified: 0, clubsRejected: 0, namesWritten: 0, summariesRenamed: 0,
  articles: 0, articleMissing: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, warnings: [], updates: [],
});

/**
 * 실행 끝 — 새로 확인한 구단(위키데이터)과 통용 표기 후보를 이름 캐시에 쓰고(표기는 `cacheLlmNames`가 다수결로 정한다),
 * 이번 실행에서 확정 표기와 다른 표기로 쓴 요약을 맞춘다. 실패는 경고다(다음 실행이 다시 찾는다).
 */
async function flushNames(supabase, out, clubCache, nameRun, names) {
  // 같은 키가 두 번 실리면 일괄 upsert가 통째로 거부된다("cannot affect row a second time") — 키마다 마지막 것 하나
  const clubRows = [...new Map(clubCache.map((c) => [`${c.kind}:${c.key}`, c])).values()];
  if (clubRows.length) {
    const { error } = await supabase.from(NAME_TABLE).upsert(clubRows, { onConflict: "kind,key" });
    if (error) out.warnings.push(`구단 확인 캐시 저장 실패: ${error.message}`);
    else out.namesWritten += clubRows.length;
  }
  if (!nameRun.koEntries.length) return;
  let res;
  try {
    res = await cacheLlmNames(supabase, nameRun.koEntries, names);
  } catch (e) {
    out.warnings.push(e instanceof Error ? e.message : String(e));
    return;
  }
  out.namesWritten += res.written;
  for (const a of res.added) out.warnings.push(formatNewNameLog(a));
  for (const s of res.split) out.warnings.push(`표기가 갈려 쓰지 않음: ${s.key} (${[...new Set(s.candidates)].join(" / ")})`);
  out.warnings.push(...(res.warnings ?? []));
  // 확정 표기와 다른 표기로 쓴 이번 실행의 요약 — DB와 파생이 메모리에 입힐 값(`updates`)을 함께 고친다
  const finalKo = new Map(res.added.map((a) => [a.key, a.ko]));
  for (const s of nameRun.summaries) {
    const ko = finalKo.get(s.key);
    if (!ko || ko === s.used || typeof s.update.summary_ko !== "string") continue;
    const next = renameInSummary(s.update.summary_ko, s.used, ko);
    if (next === s.update.summary_ko || [...next].length > SUMMARY_MAX_CHARS) continue;
    const { error } = await supabase.from("transfer_news").update({ summary_ko: next }).eq("id", s.id);
    if (error) { out.warnings.push(`#${s.id} 요약 표기 맞추기 실패: ${error.message}`); continue; }
    s.update.summary_ko = next;
    out.summariesRenamed += 1;
  }
}

/** 저장된 판정과 재생한 판정이 같은가 — 재생은 달라진 행만 쓴다 */
const REPLAY_COLUMNS = [...VERDICT_VALUE_COLUMNS, "summary_ko"];
const sameVerdict = (a, b) => REPLAY_COLUMNS.every((c) => (c.includes("fee_amount") ? Number(a[c] ?? NaN) === Number(b[c] ?? NaN) || (a[c] == null && b[c] == null) : JSON.stringify(a[c] ?? null) === JSON.stringify(b[c] ?? null)));

/**
 * 재생 — 저장된 원출력(`verdict_raw`)을 **지금의 해석으로 다시 읽어** 달라진 행만 쓴다. API를 부르지 않는다.
 * 해석(`parseJudgement`)·구단 확인·요약 손질을 고쳤을 때 쓴다(지시문을 고쳤으면 다시 물어야 한다 — `--rejudge`).
 * ⚠ 근거·구단 대조는 판정 때 보낸 글과 해야 맞는다 — 매체 RSS는 기사 본문을 다시 받는다. 받지 못했거나, 판정 때의 원문 지문
 *   (`verdict_input`)과 다시 만든 원문의 지문이 다르면(기사가 고쳐졌다) 그 행은 건드리지 않는다 — 근거 문장 번호가 다른 문장을 가리킨다.
 * ⚠ 다시 읽은 결과가 판정 불가면 옛 판정을 그대로 둔다(재생 때문에 판정이 지워지지 않는다).
 * ⚠ 판정 시각·시도 횟수·출처 컬럼은 그대로 둔다 — 재생은 새 시도가 아니다.
 * @param {object[]} rows `id, body, source_id, external_id, url, verdict*, verdict_input, summary_ko`
 */
export async function replayJudgements(supabase, rows, { names, fetchImpl = fetch, lookup = lookupKo, corrections, nowMs = Date.now(), log = null } = {}) {
  const targets = rows.filter((r) => r.verdict_raw);
  const out = { ...newStats(targets.length), changed: 0, skipped: 0, inputChanged: 0 };
  const fixes = corrections ?? loadGlossary().corrections;
  const nameRun = newNameRun();
  const clubCache = [];
  const titleCase = (key) => key.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
  for (const [i, r] of targets.entries()) {
    if (log && i > 0 && i % 100 === 0) log.log(`  재생 진행 ${i}/${targets.length}`);
    let article = "";
    // 판정 때도 본문 없이 물었으면(`verdict_article_chars` 0) 받지 않고 저장된 글만으로 재생한다 — 지금은 본문이 받아져도 실으면
    // 원문 지문이 갈려 해석 수정이 닿지 않는다. 같은 글인지는 아래 원문 지문 대조가 지킨다
    if (wantsArticle(r) && r.verdict_article_chars !== 0) {
      article = await fetchArticleText(r.url, fetchImpl);
      if (!article) { out.skipped += 1; continue; }
    }
    const input = prepareJudgeInput(r, article);
    if (r.verdict_input && r.verdict_input !== sourceFingerprint(input.numbered.text)) { out.inputChanged += 1; continue; }
    let asked = null;
    try { asked = JSON.parse(r.verdict_raw)?.player ?? null; } catch { asked = null; }
    // 물을 때 넘긴 선수 — 선수를 지정해 물은 행은 판정 키가 남아 있다. 이름은 모델이 되받아 적은 것(같은 선수일 때)이나 키에서 되살린다
    const player = r.verdict_player ? (r.verdict === "move" && r.verdict_player_name ? r.verdict_player_name : asked && normalizePlayer(asked) === r.verdict_player ? asked : titleCase(r.verdict_player)) : null;
    const n = { id: r.id, playerKey: r.verdict_player ?? null, player, summary_ko: r.summary_ko ?? null };
    const judged = parseJudgement(r.verdict_raw, input.sentText, { corrections: fixes, player, names, article, sentences: input.numbered.sentences });
    if (judged.kind === "invalid" && r.verdict != null) {
      out.invalid += 1;
      out.kept += 1;
      out.warnings.push(`#${r.id} 재생 결과 판정 불가(${judged.reason}) — 옛 판정(${r.verdict})을 그대로 둔다`);
      continue;
    }
    const update = await settleJudgement(n, judged, r.verdict_raw, { out, book: names, nameRun, clubCache, lookup, nowMs, verdictAt: r.verdict_at });
    if (!("summary_ko" in update)) update.summary_ko = r.summary_ko ?? null;
    if (sameVerdict(r, update)) continue;
    const { error } = await supabase.from("transfer_news").update(update).eq("id", r.id);
    if (error) { out.failed += 1; out.warnings.push(`#${r.id} 재생 저장 실패: ${error.message}`); continue; }
    out.changed += 1;
    out.updates.push(Object.assign(update, { id: r.id }));
  }
  await flushNames(supabase, out, clubCache, nameRun, names);
  return out;
}

/**
 * 판정 단계 — 파생이 넘긴 대상(`judgeNeeds`, 우선순위로 정렬된 것)을 묻고 저장한다.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase service_role 클라이언트
 * @param {{ id: number, playerKey: string | null, player: string | null, body: string, clubs?: string[], source_id?: string, external_id?: string, url?: string,
 *   summary_ko?: string | null, published_at?: string, mode?: "full" | "summary", prev?: object | null }[]} needs
 *   `playerKey`가 null이면 규칙이 선수를 못 뽑은 보도다 — 모델이 선수를 읽는다. `mode: "summary"`는 요약만 다시 받는다(판정은 그대로).
 *   `prev`는 그 행에 저장된 판정 컬럼(판정 불가일 때 옛 판정을 지키고 실패 횟수를 센다).
 * @param {{ apiKey?: string, names: ReturnType<import("./names-ko.mjs").createNameBook>, limit?: number, client?: object, fetchImpl?: typeof fetch, lookup?: typeof lookupKo,
 *   corrections?: object, nowMs?: number, config?: typeof JUDGE_CONFIG }} opts
 *   `client`·`fetchImpl`·`lookup`은 테스트용, `system`·`config`는 지시문·설정 비교용(같은 보도에 다른 지시문·모델로 물을 때).
 *   `corrections`가 없으면 `glossary-ko.json`의 교정표를 쓴다. `log`(Console)를 주면 20건마다 진행을 찍는다.
 * @returns 저장한 값(`updates` — 파생이 메모리의 행에 곧바로 입혀 다시 파생한다)과 집계. `namesWritten`이 0보다 크면 이름 사전을 다시 읽는다
 */
export async function runJudgements(supabase, needs, { apiKey, names, limit = JUDGE_MAX_PER_RUN, client, fetchImpl = fetch, lookup = lookupKo, corrections, nowMs = Date.now(), log = null, system = buildSystem(), config = JUDGE_CONFIG, articleRetry, timeBudgetMs = JUDGE_TIME_BUDGET_MS, now = Date.now, concurrency = JUDGE_CONCURRENCY } = {}) {
  const api = client ?? new Anthropic({ apiKey, timeout: JUDGE_TIMEOUT_MS, maxRetries: JUDGE_SDK_RETRIES });
  const fixes = corrections ?? loadGlossary().corrections;
  const out = newStats(needs.length);
  if (needs.length > limit) out.warnings.push(`판정 상한(${limit}) — 남은 ${needs.length - limit}건은 다음 실행이 잇는다`);
  const promptPrint = judgeFingerprint(system, config);
  const nameRun = newNameRun();
  const clubCache = [];
  // 같은 구단을 두 보도가 동시에 확인하면 한 번만 찾는다(실패는 기억하지 않는다 — 다음 확인이 다시 찾는다)
  const lookups = new Map();
  const sharedLookup = (name, kind) => {
    const k = `${kind}:${name}`;
    if (!lookups.has(k)) lookups.set(k, Promise.resolve().then(() => lookup(name, kind)).catch((e) => { lookups.delete(k); throw e; }));
    return lookups.get(k);
  };

  const batch = needs.slice(0, limit);
  const started = Date.now();
  /**
   * 보도 한 건을 묻고 저장한다. 돌려주는 값: "done"(판정·판정 불가·영구 실패 — 다음 행으로) · "transient"(일시 실패 — 다시 물을 수 있다)
   * · "fail"(영구 실패·저장 실패 — 연속 실패를 센다) · "stop"(한도·사용 한도 — 남은 행을 보내지 않는다).
   * 경고·저장한 값은 보도마다 따로 모아 돌려준다 — 동시에 돌아 끝나는 순서가 갈려도 호출부가 보도 순서대로 옮긴다.
   * "stop"은 남은 수를 받아 경고 문구를 만드는 함수(`stopWarning`)를 함께 준다 — 남은 수는 멈추는 순간 호출부만 안다.
   */
  const judgeOne = async (n) => {
    const warnings = [];
    const updates = [];
    const done = (status, extra = {}) => ({ status, warnings, updates, ...extra });
    // 기사 본문 — 받지 못하면 저장된 글만으로 판정한다(실패가 아니다). 받았는지는 `verdict_article_chars`로 남는다(0 = 못 받음)
    let article = "";
    const articleSource = wantsArticle(n);
    if (articleSource) {
      article = await fetchArticleText(n.url, fetchImpl, articleRetry);
      out[article ? "articles" : "articleMissing"] += 1;
    }
    // 본문 없이 낸 판정을 본문으로 다시 보려는 행(`mode: "article"`) — 이번에도 못 받으면 **묻지 않는다**. 같은 글로 다시 물으면 비용만 들고
    // 판정이 비결정적으로 뒤집힐 수 있다. 시각·횟수만 올려 옛 판정을 지킨다(파생이 횟수로 본문 재시도를 끝낸다)
    if (n.mode === "article" && !article) {
      out.articleSkipped = (out.articleSkipped ?? 0) + 1;
      const update = { verdict_at: new Date().toISOString(), verdict_attempts: nextAttempts(n.prev?.verdict_attempts) };
      const { error } = await supabase.from("transfer_news").update(update).eq("id", n.id);
      if (error) warnings.push(`#${n.id} 본문 재시도 표지 저장 실패: ${error.message}`);
      else updates.push(Object.assign(update, { id: n.id }));
      return done("done");
    }
    const input = prepareJudgeInput(n, article);
    const request = buildJudgeRequest(n, names, system, article, config);
    const provenance = {
      verdict_model: request.model,
      verdict_prompt: promptPrint,
      verdict_input: sourceFingerprint(input.numbered.text),
      verdict_article_chars: articleSource ? [...article].length : null,
    };
    let judged;
    let rawText = null;
    try {
      const res = await api.messages.create(request);
      out.inputTokens += res.usage?.input_tokens ?? 0;
      out.outputTokens += res.usage?.output_tokens ?? 0;
      out.cacheReadTokens += res.usage?.cache_read_input_tokens ?? 0;
      out.cacheWriteTokens += res.usage?.cache_creation_input_tokens ?? 0;
      rawText = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      judged = res.stop_reason === "refusal" || res.stop_reason === "model_context_window_exceeded"
        ? { kind: "invalid", reason: res.stop_reason === "refusal" ? "모델이 거절" : "문맥 상한을 넘었다", truncated: true }
        // 출력 상한에 잘린 JSON은 형식이 깨진 것이 아니다 — 원인을 따로 남긴다(생각이 켜진 설정이면 생각이 상한을 먹었을 수 있다)
        : res.stop_reason === "max_tokens"
          ? { kind: "invalid", reason: `출력 상한(max_tokens ${request.max_tokens})에 걸려 출력이 잘렸다`, truncated: true }
          : parseJudgement(rawText, input.sentText, { corrections: fixes, player: n.player, names, article, sentences: input.numbered.sentences });
    } catch (e) {
      // 인증·권한 오류는 남은 행도 전부 같은 결과다 — 멈추고 호출부가 종료 코드를 올린다
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new Error(`판정 API 인증 실패(${e.status}) — ANTHROPIC_API_KEY를 확인하세요`);
      }
      if (e instanceof Anthropic.RateLimitError) {
        return done("stop", { stopWarning: (left) => `판정 API 한도 초과 — 남은 ${left}건은 다음 실행으로 넘긴다` });
      }
      // 계정 사용 한도(400 "usage limits")·크레딧 소진(400 "credit balance is too low")도 남은 행이 전부 같은 결과다 —
      // 곧바로 거부될 호출을 이어 보내지 않는다. 크레딧 소진을 빠뜨렸더니 한 실행이 546건을 전부 부르고 전부 거부당했다.
      if (e instanceof Anthropic.APIError && e.status === 400 && /usage limit|credit balance/iu.test(e.message)) {
        out.failed += 1;
        out.usageLimited = true;
        const message = e.message.slice(0, 160);
        return done("stop", { stopWarning: (left) => `판정 API 계정 사용 한도에 닿았다 — 남은 ${left}건은 다음 실행으로 넘긴다: ${message}` });
      }
      // 아무것도 쓰지 않는다 — 판정 결과가 아니라 호출의 실패다(옛 판정도 그대로 남는다)
      if (isTransientApiError(e)) return done("transient");
      out.failed += 1;
      warnings.push(`#${n.id} 판정 실패: ${e instanceof Anthropic.APIError ? e.status : ""} ${e instanceof Error ? e.message : String(e)}`);
      return done("fail");
    }

    const update = await settleJudgement(n, judged, rawText, { out, warnings, book: names, nameRun, clubCache, lookup: sharedLookup, nowMs, provenance });
    const { error } = await supabase.from("transfer_news").update(update).eq("id", n.id);
    if (error) {
      out.failed += 1;
      warnings.push(`#${n.id} 판정 저장 실패: ${error.message}`);
      // 저장되지 않은 판정의 통용 표기 후보·요약 맞추기는 버린다(실행 끝에 저장되지 않은 행의 요약만 쓰게 된다)
      nameRun.koEntries = nameRun.koEntries.filter((e) => e.id !== n.id);
      nameRun.summaries = nameRun.summaries.filter((s) => s.id !== n.id);
      // 시각·실패 횟수만이라도 남긴다 — 판정 시각이 없으면 같은 행이 매시 다시 물린다(비용 반복). 옛 판정은 건드리지 않는다
      const fallback = { verdict_at: update.verdict_at ?? new Date().toISOString(), verdict_attempts: nextAttempts(n.prev?.verdict_attempts) };
      const res = await supabase.from("transfer_news").update(fallback).eq("id", n.id);
      if (!res.error) updates.push(Object.assign(fallback, { id: n.id }));
      return done("fail");
    }
    // 같은 객체를 넘긴다 — 실행 끝의 표기 맞추기(`flushNames`)가 고친 요약이 파생의 메모리에도 입혀지게
    updates.push(Object.assign(update, { id: n.id }));
    return done("done");
  };

  /*
   * 일꾼 `concurrency`개가 앞에서부터 하나씩 가져가 묻는다. 새 보도를 가져가기 직전에 `canStart`가 멈출지 정하고(예산·차단기·한도),
   * 이미 보낸 보도는 끝까지 기다린다(저장까지 마친다). 결과는 끝나는 순서대로 `settle`이 받는다 — 연속 실패도 끝난 순서로 센다.
   * 인증 실패(throw)는 새로 보내지 않고 나머지가 끝나기를 기다린 뒤 던진다.
   */
  const drain = async (items, { firstAlone = false, canStart, settle }) => {
    const results = new Array(items.length);
    let next = 0;
    let thrown = null;
    const left = () => items.length - next;
    const take = () => (thrown == null && next < items.length && canStart(left) ? next++ : -1);
    const step = async (i) => {
      try {
        results[i] = await judgeOne(items[i]);
      } catch (e) {
        thrown ??= e;
        return;
      }
      settle(i, results[i].status, results[i], left);
    };
    const worker = async () => { for (let i = take(); i >= 0; i = take()) await step(i); };
    // 첫 건은 홀로 — 지시문(prompt cache)을 데운 뒤에 나머지가 동시에 그 캐시를 읽는다
    if (firstAlone) { const i = take(); if (i >= 0) await step(i); }
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    if (thrown) throw thrown;
    return { results, dispatched: next };
  };
  // 보도마다 모은 경고·저장한 값을 보도 순서대로 옮긴다 — 끝나는 순서가 실행마다 갈려도 결과가 같은 순서로 남게
  const emit = (results, passWarnings) => {
    for (const r of results) {
      if (!r) continue;
      out.warnings.push(...r.warnings);
      out.updates.push(...r.updates);
    }
    out.warnings.push(...passWarnings);
  };

  // 일시 실패한 행은 모았다가 실행 끝에 한 번 더 묻는다(그 사이 연결이 회복된다) — 시간 초과 하나로 그 보도가 이번 실행에서 빠지지 않게
  const transientIdx = [];
  let stopped = false;
  let streak = 0;
  // 마지막으로 센 일시 실패를 본 순간까지 보낸 보도의 마지막 순번 — 그 뒤에 보낸 보도의 실패만 연속으로 센다
  let streakMark = -1;
  let failStreak = 0;
  let finished = 0;
  const begun = now();
  const overBudget = () => now() - begun >= timeBudgetMs;
  // 예산·장애로 멈추면 아직 보내지 않은 행은 그대로 다음 실행이 묻는다(상한에 걸린 행과 같다 — 표지를 남기지 않는다).
  // 남은 수는 아직 보내지 않은 행이다 — 이미 보낸 행은 끝까지 묻고 저장한다
  const passWarnings = [];
  const halt = (why, left) => {
    if (stopped) return;
    stopped = true;
    out.halted = true;
    passWarnings.push(`${why} — 남은 ${left}건은 다음 실행이 묻는다`);
  };
  const onStop = (r, left) => {
    if (stopped) return;
    stopped = true;
    out.halted = true;
    passWarnings.push(r.stopWarning(left));
  };
  const first = await drain(batch, {
    firstAlone: true,
    canStart: (left) => {
      if (stopped) return false;
      if (overBudget()) { halt(`판정 시간 예산(${Math.round(timeBudgetMs / 1000)}초)을 다 썼다`, left()); return false; }
      return true;
    },
    settle: (i, status, r, left) => {
      finished += 1;
      // 호출이 한 건에 3초 안팎이라 수십 건이면 몇 분 동안 아무 출력이 없다 — 20건마다 진행을 찍는다(호출부가 log를 줄 때만)
      if (log && finished % 20 === 0) log.log(`  LLM 판정 진행 ${finished}/${batch.length} · ${((Date.now() - started) / 1000).toFixed(0)}초`);
      if (status === "transient") {
        transientIdx.push(i);
        // ⚠ 연속은 **앞선 실패를 본 뒤에 보낸** 보도만 센다(i는 보낸 순서다) — 동시에 나가 있던 보도들이 한 번의 끊김에 함께
        //   실패하면 그것은 한 번이다. 다 세면 몇 초짜리 끊김 하나가 차단기를 내려 그 실행의 판정이 통째로 멈춘다
        if (i > streakMark) {
          streak += 1;
          streakMark = batch.length - left() - 1;
          if (streak >= JUDGE_TRANSIENT_STREAK_MAX) halt(`일시 실패가 ${streak}번 연달아 났다(API 장애로 본다)`, left());
        }
      } else streak = 0;
      if (status === "fail") {
        failStreak += 1;
        // 같은 실패(모델 id 접근 불가·요청 형식 오류)는 남은 행도 전부 같다 — 상한까지 다 부르지 않는다
        if (failStreak >= JUDGE_FAIL_STREAK_MAX && !stopped) { out.failStreakStopped = true; halt(`판정이 ${failStreak}번 연달아 실패했다(설정·요청 오류로 본다)`, left()); }
      } else failStreak = 0;
      if (status === "stop") onStop(r, left());
    },
  });
  emit(first.results, passWarnings.splice(0));

  const transient = transientIdx.sort((x, y) => x - y).map((i) => batch[i]);
  const carriedIdx = [];
  if (transient.length && !stopped && !overBudget() && log) log.log(`  일시 실패 ${transient.length}건을 다시 묻는다`);
  const retry = await drain(transient, {
    canStart: () => !stopped && !overBudget(),
    settle: (i, status, r, left) => {
      if (status === "transient") carriedIdx.push(i);
      if (status === "stop") onStop(r, left());
    },
  });
  emit(retry.results, passWarnings.splice(0));
  // 보내지 못한 행(멈춤·예산)과 두 번째에도 일시 실패한 행
  for (let i = retry.dispatched; i < transient.length; i += 1) carriedIdx.push(i);
  const carried = carriedIdx.sort((x, y) => x - y).map((i) => transient[i]);
  /*
   * 두 번 다 일시 실패한 행은 다음 실행으로 이월한다. 판정한 적이 없는 행에는 `verdict_attempts`만 올려 표지를 남긴다 — 판정 시각을
   * 쓰지 않으므로 다음 실행이 곧바로 다시 묻고, 파생이 그 표지를 보고 같은 층의 다른 보도보다 먼저 세운다(대기열이 길어도 밀리지 않게).
   * 옛 판정이 있는 행은 아무것도 바꾸지 않는다(상태가 그대로라 다음 실행이 같은 이유로 다시 묻는다).
   */
  out.transient = carried.map((n) => n.id);
  for (const n of carried) {
    if (n.prev?.verdict_at) continue;
    const update = { verdict_attempts: nextAttempts(n.prev?.verdict_attempts) };
    const { error } = await supabase.from("transfer_news").update(update).eq("id", n.id);
    if (error) out.warnings.push(`#${n.id} 이월 표지 저장 실패: ${error.message}`);
    else out.updates.push(Object.assign(update, { id: n.id }));
  }
  if (carried.length) out.warnings.push(`일시 실패(시간 초과·연결·서버 오류) ${carried.length}건 — 실행 안에서 한 번 더 물었지만 실패했다. 다음 실행이 먼저 다시 묻는다: ${carried.map((n) => `#${n.id}`).join(" ")}`);

  // 통용 표기 후보·요약 맞추기도 보도 순서로 — 다수결(`pickConsensusKo`)과 새 표기 로그가 끝나는 순서에 흔들리지 않게
  const order = new Map(batch.map((n, k) => [n.id, k]));
  const byOrder = (x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0);
  nameRun.koEntries.sort(byOrder);
  nameRun.summaries.sort(byOrder);
  await flushNames(supabase, out, clubCache, nameRun, names);
  return out;
}

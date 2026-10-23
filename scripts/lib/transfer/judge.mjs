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
 * 모델이 낸 JSON은 `verdict_raw`에 그대로 남긴다 — 해석(`parseJudgement`)을 고쳤을 때 API를 다시 부르지 않고 재생한다(`replayJudgements`).
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
import { detectClubs, isClubName } from "./clubs.mjs";
import { FROM, collectVotes } from "./direction.mjs";
import { personName } from "./extract.mjs";
import { NAME_TABLE, cacheLlmNames, formatNewNameLog, loadGlossary, renameInSummary, shortKoClubName } from "./names-ko.mjs";
import { COLLECTOR_UA } from "./sources.mjs";
import { DEAD, RENEWAL, isRoundupItem } from "./story.mjs";
import { lookupKo } from "./wikidata.mjs";
import { clampCp } from "../sync-db.mjs";
import { normalizePlayer } from "./player-key.mjs";
import { DAY_MS, escapeRe, HOUR_MS, sha1Hex } from "./util.mjs";
import { ARTICLE_MAX_CHARS, FEE_CURRENCIES, FEE_KINDS, JUDGE_CONFIG, JUDGE_STAGES, LOAN_CLAUSES, LOAN_FORMS, MOVE_FORMS, SUITORS_MAX, buildJudgeRequest, buildSystem, ellipsize, judgeFingerprint, prepareJudgeInput } from "./judge-prompt.mjs";

// 요청 쪽(지시문·출력 형식·사용자 메시지)은 judge-prompt.mjs에 있다 — 기존 소비자가 이 파일에서 가져가던 이름을 그대로 내보낸다
export * from "./judge-prompt.mjs";

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
/** 한 번 실행의 호출 상한 — 백필·버그가 한 시간에 비용을 태우지 않게 한다. 남은 행은 다음 실행이 잇는다 */
export const JUDGE_MAX_PER_RUN = 60;
/** 판정 불가·요약 실패로 끝난 행을 다시 묻기까지의 간격 */
export const JUDGE_RETRY_MS = 24 * HOUR_MS;
/** 요약 실패를 다시 시도하는 기간 — 이보다 오래된 보도는 영문 발췌로 둔다 */
export const SUMMARY_RETRY_WINDOW_MS = 14 * DAY_MS;
/** 근거 인용 상한 — DB CHECK(`transfer_news_verdict_evidence_len`)와 같은 값 */
export const EVIDENCE_MAX_CHARS = 300;
/** 요약 상한 — DB CHECK(`transfer_news_summary_ko_len`)와 같은 값. 지시문은 120자 안팎을 요구한다 */
export const SUMMARY_MAX_CHARS = 160;
/** 원출력 상한 — DB CHECK(`transfer_news_verdict_raw_len`)와 같은 값 */
const RAW_MAX_CHARS = 2_000;
/** 단일 이적의 금액 상한(백만) — DB CHECK(`transfer_news_verdict_fee_amount_range`)와 같은 값 */
const FEE_MAX_M = 350;
const ARTICLE_TIMEOUT_MS = 10_000;
/**
 * 기사 본문을 일시 실패(시간 초과·연결 실패·429·5xx)로 못 받았을 때 한 번 더 받기 전에 기다리는 시간.
 * 그래도 못 받으면 발췌로 판정하고 `verdict_article_chars = 0`을 남긴다 — 파생이 본문을 받으러 다시 묻는다(`judgeMode`).
 */
const ARTICLE_RETRY_DELAY_MS = 1_500;

// ── 기사 본문 ──────────────────────────────────────────────────────────

/**
 * 기사 본문을 받을 보도인가 — 매체 RSS만. 텔레그램·블루스카이는 저장된 글이 전문이고, 구글 뉴스 링크는 리다이렉트다.
 * 가십 칼럼의 항목 행은 받지 않는다 — 저장된 문단이 그 이적설의 전부이고 URL은 칼럼 전체다.
 */
export const wantsArticle = (row) =>
  typeof row.source_id === "string" && row.source_id.startsWith("rss:") && /^https?:\/\//u.test(row.url ?? "") && !isRoundupItem(row);

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


// ── 해석 ──────────────────────────────────────────────────────────────

/** 인용 대조용 정규형 — 공백·따옴표·대소문자·말줄임·이모지 차이만 접는다(글자 자체는 바꾸지 않는다) */
export function normalizeQuote(s) {
  return String(s)
    .normalize("NFC")
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu, " ")
    .replace(/[‘’‛′`]/gu, "'")
    .replace(/[“”„″]/gu, '"')
    .replace(/…/gu, "...")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

const quotedIn = (text, quote) => quote !== "" && normalizeQuote(text).includes(normalizeQuote(quote));

/** 대조용 낱말 — 앞뒤 문장부호를 걷는다("kone,"와 "kone"은 같은 낱말이다). 통화 기호·퍼센트는 남긴다 */
const wordsOf = (s) => normalizeQuote(s).split(" ").map((w) => w.replace(/^[^\p{L}\p{N}£€$]+|[^\p{L}\p{N}%]+$/gu, "")).filter(Boolean);
/** 조각 안에서 건너뛸 수 있는 낱말 수(한 번에 · 조각 전체) — 나이 표기(", 26,")나 수식어("20-year-old Austrian international") 정도 */
const GAP_MAX = 6;
const GAP_TOTAL = 8;
/** 조각 하나로 치는 최소 낱말 수 — 한두 낱말은 어디서든 맞는다 */
const FRAGMENT_MIN_WORDS = 3;

/** `words`가 `text`의 `from` 뒤에서 **순서대로**(낱말 사이 건너뛰기는 한도 안에서) 나오면 끝 위치, 아니면 -1 */
function matchFragment(text, words, from) {
  for (let start = from; start < text.length; start += 1) {
    if (text[start] !== words[0]) continue;
    let pos = start;
    let skipped = 0;
    let ok = true;
    for (let i = 1; i < words.length && ok; i += 1) {
      let next = -1;
      for (let j = pos + 1; j <= pos + 1 + GAP_MAX && j < text.length; j += 1) if (text[j] === words[i]) { next = j; break; }
      if (next < 0) ok = false;
      else {
        skipped += next - pos - 1;
        pos = next;
        if (skipped > GAP_TOTAL) ok = false;
      }
    }
    if (ok) return pos + 1;
  }
  return -1;
}

/**
 * 근거 인용이 원문에 있는가 — 통째 일치, 또는 **줄인 인용**.
 *
 * 근거를 25단어로 제한한 탓에 모델이 인용을 줄인다 — 나이 표기를 빼거나("Ethan Ampadu, despite" ← "Ethan Ampadu, 26, despite")
 * 가운데를 "..."로 건너뛴다. 통째 일치만 받았더니 판정의 5.5%가 "근거가 원문에 없다"로 버려졌고(감사 183건 중 10건, 9건이 줄인 인용),
 * 버려진 행은 딜에서 빠진 채 24시간마다 다시 물렸다(운영에서 알라바·미첼·토모리의 판정이 그렇게 비워졌다).
 *
 * 받는 조건 — 인용을 "..."와 문장 끝에서 나눈 조각마다 원문에 있고, 조각 안의 낱말은 순서대로(건너뛰기 한 번에 `GAP_MAX`,
 * 조각 전체 `GAP_TOTAL` 낱말까지) 있어야 한다. 조각 안의 낱말이 원문에 그 순서로 있으므로 "지어낸 근거로 딜을 열지 않는다"는 그대로다.
 * ⚠ 이름 대조(`mentionIn`)에는 쓰지 않는다 — "Real … Madrid"를 건너뛰어 맞추면 없는 구단이 생긴다.
 */
export function evidenceIn(text, quote) {
  if (quote === "") return false;
  if (quotedIn(text, quote)) return true;
  const textWords = wordsOf(text);
  // 조각 — "..."와 **문장 끝**에서 나눈다. 모델은 떨어진 두 문장을 "..." 없이 이어 적거나("…here we go! Medical underway right now" —
  // 사이에 한 문장이 있다) 뒤 문단의 문장을 먼저 적는다. 순서까지 요구했더니 실제 이적 보도의 판정이 3.5% 버려졌다(재실행 230건 중 8건,
  // 7건이 진짜 이적 보도). 조각마다 원문에 있으면 받는다 — 모든 낱말이 원문의 한 자리에 그 순서로 있다는 것은 그대로다.
  const fragments = normalizeQuote(quote).split(/\.\.\.|(?<=[.!?])\s+/u).map(wordsOf).filter((f) => f.length);
  // 짧은 조각(한두 낱말 — "Why?"·"Yes.")은 어디서든 맞아 뜻이 없다. 버리되, 남은 조각이 인용의 대부분이어야 한다
  const solid = fragments.filter((f) => f.length >= FRAGMENT_MIN_WORDS);
  if (!solid.length || solid.reduce((n, f) => n + f.length, 0) < fragments.reduce((n, f) => n + f.length, 0) * 0.8) return false;
  return solid.every((f) => matchFragment(textWords, f, 0) >= 0);
}

/** 모델이 적은 이름(구단·선수)이 원문에 있으면 다듬어 돌려준다, 없으면 null */
export function mentionIn(mention, sentText) {
  if (typeof mention !== "string") return null;
  const raw = mention.trim().replace(/\s+/gu, " ");
  return raw && quotedIn(sentText, raw) ? raw : null;
}

/**
 * 모델이 적은 구단 — 원문 표기 그대로면 그 표기, 아니면 **구단 사전으로 풀리고 그 구단이 원문에서도 잡힐 때** 정규명.
 * 모델이 "Stuttgart's Finn Jeltsch"의 출발을 "VfB Stuttgart"로 다듬어 적어 원문 대조에 걸려 출발이 비었다(회귀 실측 — 운영에서
 * 출발이 빈 판정의 원인이다). 원문에 없는 구단은 여전히 받지 않는다.
 */
function clubMentionIn(mention, sentText) {
  const verbatim = mentionIn(mention, sentText);
  if (verbatim || typeof mention !== "string") return verbatim;
  const canonical = detectClubs(mention)[0];
  return canonical && detectClubs(sentText).includes(canonical) ? canonical : null;
}

/**
 * 선수 한글 표기의 형식 — 낱말들(사이 공백·가운뎃점·붙임표), 40자 이내. 낱말은 한글이거나 **라틴 대문자 머리글자 1~3자**("JJ 가브리엘"·
 * "CJ 이건")이고 한글 낱말이 하나는 있어야 한다. 머리글자를 거부했더니 통용 표기가 캐시에 앉지 못해 요약마다 "JJ 가브리엘"·"JJ Gabriel"·
 * "JJ 개브리얼"로 갈렸다. 그 밖의 문자(히브리·가나 — "빅토르 עיוケレス")는 받지 않는다.
 */
export function isKoName(v) {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (!t || [...t].length > 40 || !/^[^\s·-]+(?:[\s·-][^\s·-]+)*$/u.test(t)) return false;
  const tokens = t.split(/[\s·-]/u);
  return tokens.every((w) => /^[가-힣]+$/u.test(w) || /^[A-Z]{1,3}$/u.test(w)) && tokens.some((w) => /^[가-힣]+$/u.test(w));
}

/** 요약문의 옛·틀린 표기를 저장 직전에 바로잡는다 — 긴 키부터(“스포팅 디렉터”가 “스포팅”보다 먼저) */
export function applyCorrections(text, corrections = loadGlossary().corrections) {
  let out = text;
  for (const [wrong, right] of Object.entries(corrections).sort(([a], [b]) => b.length - a.length)) out = out.split(wrong).join(right);
  return out;
}

/**
 * 모델이 적은 선수 한글 표기 → 받을 값. 요약과 같은 교정표를 먼저 적용한다 — 요약은 "각포"로 고쳐지는데 표기는 "가크포"로 남아
 * 딜 제목과 요약이 갈렸다. 형식이 틀리면 null.
 */
export function koNameOf(v, corrections) {
  if (typeof v !== "string") return null;
  const ko = applyCorrections(v.replace(/\s+/gu, " ").trim(), corrections);
  return isKoName(ko) ? ko : null;
}

/**
 * 요약의 기계적 손질 — 교정표(한국어 → 한국어)로 적을 수 없는 것. "시티行"(한자 行 → 행)과, 용어 표기를 괄호로 되풀이한
 * "확정되었으며(이적 확정)"이 운영에 나갔다.
 */
const tidySummary = (text) => text.replace(/(?<=[가-힣A-Za-z])行/gu, "행").replace(/(확정[가-힣]*)\s?\(이적 확정\)/gu, "$1").replace(MONEY_WORD, (_, cur, n, unit) => `${cur}${n}${MONEY_UNIT[unit.toLowerCase()]}`);
/**
 * 금액 단위 낱말을 기호로 접는다 — "€45million"·"£64 million"과 "£64m"이 같은 딜의 요약마다 섞였다(원문 표기를 그대로 옮기라는 지시
 * 때문에 매체마다 갈린다). 화면의 금액 칸이 쓰는 꼴(`m`·`bn`·`k`)로 맞춘다.
 */
const MONEY_WORD = /([€£$])\s?(\d[\d.,]*)\s?(million|billion|thousand|mn)(?![A-Za-z])/giu;
const MONEY_UNIT = { million: "m", mn: "m", billion: "bn", thousand: "k" };

/**
 * 원문을 두고 하는 말("원문에는 금액이 나와 있지 않다") — 요약은 보도의 내용이지 원문에 대한 설명이 아니다. "두 문장으로, 둘째 문장에
 * 금액 등"이라는 지시를 채우려고 모델이 없는 정보를 "없다"고 적었다(블라인드 채점: 새 요약의 12%, 옛 요약 1%).
 * ⚠ "이적료는 공개되지 않았다"(비공개 이적료)·"밝혀지지 않았다"는 보도가 말한 사실이라 걷지 않는다 — 원문·정보 부재를 말하는 표현만.
 */
const META_SENTENCE = /원문(?!\s?에\s?따르면)|기사(?:에는|에서는)\s|(?:언급되지|명시되지)\s?않(?:는다|았다)|(?:기사|원문|본문|보도)(?:에는|에서는|에)\s[^.]*(?:나와 있지|나오지)\s?않(?:는다|았다)|언급(?:은|이) 없(?:다|었다)|정보(?:는|가) 없다/u;
/** 메타 절이 쉼표 뒤 마지막 절로 붙은 경우("…분석이 나왔고, 금액은 언급되지 않았다.") — 앞 절의 "-고"를 "-다"로 맺는다 */
const META_TAIL = /([가-힣])고,\s*(?:[^,.]*(?:언급되지|명시되지)|(?:기사|원문|본문|보도)[^,.]*(?:나와 있지|나오지))\s?않(?:는다|았다)\.?$/u;

/** 요약에서 메타 문장을 걷는다. 걷고 나서 남는 문장이 없으면 원래 글을 돌려준다(요약 검증이 판단한다) */
export function stripMetaSentences(text) {
  const sentences = String(text).split(/(?<=[.!?])\s+/u).map((x) => x.replace(META_TAIL, "$1다.")).filter(Boolean);
  const kept = sentences.filter((x) => !META_SENTENCE.test(x));
  return kept.length ? kept.join(" ") : String(text);
}

/** 한국어 요약에 섞이면 안 되는 문자 — 한자·가나·아랍·키릴·그리스·히브리·태국·데바나가리 */
const FOREIGN_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}]/u;

/**
 * 원문의 금액 표기 → 백만 단위 숫자와 통화. "£60m"·"€30.57m"·"£500k"·"€500,000"·"60 million euros"·범위 "€20-25m"를 읽는다.
 * 판정자가 적은 금액이 원문에 있는지 대조하는 데만 쓴다(성격·선수 귀속은 모델이 판단한다).
 */
export function moneyMentions(text) {
  const out = [];
  const num = (raw) => Number(raw.replace(/,(?=\d{3}\b)/gu, "").replace(",", "."));
  const scale = (n, unit) => {
    const u = (unit ?? "").toLowerCase();
    if (u.startsWith("b")) return n * 1000;
    if (u.startsWith("m")) return n;
    if (u.startsWith("k") || u === "thousand") return n / 1000;
    return n >= 10_000 ? n / 1_000_000 : null; // 단위 없는 작은 수는 주급·등번호다
  };
  const push = (n, unit, currency) => {
    const m = scale(n, unit);
    if (Number.isFinite(m) && m > 0) out.push({ amount: Math.round(m * 100) / 100, currency });
  };
  const SYMBOL = { "£": "GBP", "€": "EUR", "$": "USD" };
  // 범위("€20-25m"·"£40m-£50m") — 앞 숫자에는 단위가 없어 아래 표기로는 읽히지 않는다. 두 끝을 모두 금액으로 본다
  for (const m of text.matchAll(/([€£$])\s?(\d[\d.,]*)\s?(?:million|mn|m|bn|billion|k)?\s?[-–]\s?[€£$]?(\d[\d.,]*)\s?(million|mn|m|billion|bn|thousand|k)\b/giu)) {
    push(num(m[2]), m[4], SYMBOL[m[1]]);
    push(num(m[3]), m[4], SYMBOL[m[1]]);
  }
  for (const m of text.matchAll(/([€£$])\s?(\d[\d.,]*\d|\d)\s?(million|mn|m|billion|bn|thousand|k)?\b/giu)) push(num(m[2]), m[3], SYMBOL[m[1]]);
  const WORD = { euro: "EUR", pound: "GBP", dollar: "USD" };
  for (const m of text.matchAll(/(\d[\d.,]*\d|\d)\s?(million|mn|m|billion|bn|thousand|k)?\s+(euro|pound|dollar)s?\b/giu)) push(num(m[1]), m[2], WORD[m[3].toLowerCase()]);
  return out;
}

/**
 * 판정자가 적은 금액을 받을지 — 형식이 맞고 **원문에 그 금액(같은 통화)이 있어야** 받는다. 아니면 null(판정은 그대로 둔다).
 * @returns {{ amount: number, currency: string, kind: string } | null}
 */
export function judgeFee(fee, sentText) {
  if (!fee || typeof fee !== "object") return null;
  const amount = Math.round(Number(fee.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > FEE_MAX_M) return null;
  if (!FEE_CURRENCIES.includes(fee.currency) || !FEE_KINDS.includes(fee.kind)) return null;
  const same = (m) => m.currency === fee.currency && Math.abs(m.amount - amount) < 0.011;
  // 모델이 옮긴 원문 표기(`text` — "£60m")가 원문에 그대로 있으면 그 표기로 대조한다 — 표기 읽기(`moneyMentions`)가 모르는 꼴
  // ("60 million pounds plus add-ons")도 받는다. 단 그 표기가 읽히는 금액과 어긋나면(표기 £60m인데 amount 65) 받지 않는다.
  const text = typeof fee.text === "string" ? fee.text.trim() : "";
  if (text && quotedIn(sentText, text)) {
    const read = moneyMentions(text);
    if (!read.length || read.some(same)) return { amount, currency: fee.currency, kind: fee.kind };
    return null;
  }
  if (!moneyMentions(sentText).some(same)) return null;
  return { amount, currency: fee.currency, kind: fee.kind };
}

/**
 * 원문이 임대를 말하는 낱말 — 판정자가 적은 임대 형태·임대 상태·임대 금액은 이것이 원문에 있어야 받는다. 모델이 이적설을 "임대"로
 * 지어 적으면 딜에 없는 임대 표지가 붙는다(이름·구단·금액을 원문과 대조하는 것과 같은 원칙).
 */
export const LOAN_CUE = /\b(?:loan(?:s|ed|ee|ees)?|on-loan|recall(?:s|ed|ing)?|cut short|spending the season at)\b|임대/iu;
/** 완전 이적 조항을 말하는 낱말 — 옵션·의무 표지는 이것이 원문에 있어야 받는다 */
export const CLAUSE_CUE = /\b(?:option\s+to\s+(?:buy|sign|make)|(?:buy|purchase|buy-back|buyback)\s+option|option\s+(?:clause|of|worth|for|fee)|(?:with|an|the|includes?|including)\s+(?:an?\s+|the\s+)?option|obligat(?:ion|ory|ed)|mandatory|compulsory|buy(?:-|\s)?clause|purchase clause|permanent (?:deal|transfer|move|basis)|make (?:the|his|it|that) (?:move|deal|loan) permanent|made permanent|becomes? permanent)\b|옵션|의무/iu;
/** 임대의 금액 — 임대 형태가 아닌 판정에서 이 성격의 금액은 받지 않는다 */
const LOAN_FEE_KINDS = new Set(["loan_fee", "buy_clause"]);
/** 조항(옵션·의무)이 붙을 수 있는 형태 — 조기 복귀에는 조항이 없다 */
const CLAUSE_FORMS = new Set(["loan", "loan_convert", "loan_standing", "loan_extend"]);

/**
 * 판정자가 적은 형태·임대 상태·조항 → 받을 값. 판정은 그대로 두고 **필드만** 버린다(금액 대조와 같은 원칙).
 * - 형태가 없으면 null(형태를 묻기 전의 옛 원출력 — 재생). 임대 형태인데 원문에 임대 낱말이 없으면 완전 이적으로 접는다.
 * - 임대 상태(owner·at)는 원문에 임대 낱말이 있고 그 구단이 원문에 있을 때만. 둘이 같은 구단이면 at을 버린다.
 * - 조항은 조항이 붙는 형태이고 원문에 조항 낱말이 있을 때만.
 * @returns {{ form: string | null, owner: string | null, at: string | null, clause: string | null }}
 */
export function judgeLoan(obj, sentText) {
  const loanText = LOAN_CUE.test(sentText);
  let form = MOVE_FORMS.includes(obj?.form) ? obj.form : null;
  if (form && LOAN_FORMS.includes(form) && !loanText) form = "permanent";
  const status = obj?.on_loan && typeof obj.on_loan === "object" && loanText ? obj.on_loan : null;
  const owner = status ? clubMentionIn(status.owner, sentText) : null;
  let at = status ? clubMentionIn(status.at, sentText) : null;
  if (owner && at && normalizeQuote(owner) === normalizeQuote(at)) at = null;
  const clause = form && CLAUSE_FORMS.has(form) && LOAN_CLAUSES.includes(obj?.loan_clause) && CLAUSE_CUE.test(sentText) ? obj.loan_clause : null;
  return { form, owner, at, clause };
}

/**
 * 한 토큰 이름을 전체 이름으로 푼다 — 판정자가 "Haaland"·"Alaba"만 적은 보도. 원문에 그 성으로 끝나는 전체 이름이 하나뿐이면
 * 그것, 아니면 이름 사전(사람 사전 · 확인된 선수)에서 그 성을 가진 선수가 한 명뿐일 때 그 선수다. 못 풀면 null — 한 토큰 이름
 * 하나로는 누구인지 특정하지 않는다(진짜 한 이름 선수는 사람 사전이 맡는다).
 * @param {{ playersBySurname?: (token: string) => { key: string, name: string }[] }} names
 */
export function fullNameFor(token, sentText, names) {
  const t = String(token).trim();
  if (!t || /\s/u.test(t)) return null;
  const inText = new Set();
  for (const m of sentText.matchAll(new RegExp(`(\\p{Lu}[\\p{L}\\p{M}'’‑-]+)[^\\S\\n]+${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}])`, "gu"))) {
    const full = personName(`${m[1]} ${t}`);
    if (full && full.split(/\s+/u).length >= 2) inText.add(full);
  }
  if (inText.size === 1) return [...inText][0];
  if (inText.size > 1) return null;
  const known = names?.playersBySurname?.(normalizePlayer(t)) ?? [];
  return known.length === 1 ? known[0].name : null;
}

/**
 * 요약 검증 — 한글이 있고 상한 안이어야 저장한다.
 * @returns {{ text: string } | { reason: string }}
 */
export function judgeSummary(raw, corrections) {
  if (typeof raw !== "string") return { reason: "요약이 없다" };
  // 문장이 끝난 뒤의 JSON 꼬리(`.”}, `)를 걷는다 — 모델이 요약 문자열 안에 닫는 따옴표·괄호를 흘린 것이 화면에 나갔다(벤치 실측)
  const trimmed = raw.replace(/\s+/g, " ").trim().replace(/(?<=[.!?다요])[\s"'“”‘’{}[\],]+$/u, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  const text = tidySummary(applyCorrections(stripMetaSentences(trimmed), corrections));
  if (!text) return { reason: "요약이 비었다" };
  // 그래도 괄호가 남았으면 출력 형식이 요약에 섞인 것이다 — 버리고 다시 묻는다
  if (/[{}]/u.test(text)) return { reason: "요약에 출력 형식 조각({ })이 섞였다" };
  if (!/[가-힣]/.test(text)) return { reason: "한글이 없다" };
  // 한글·라틴 문자 밖의 글자가 섞이면 버린다 — "메دي컬"(아랍 문자)·"맨체스터 시티行"(한자)이 화면에 나갔다(운영).
  // 흔한 것은 앞의 손질(`tidySummary` — 行 → 행)이 고치고, 남은 것은 다시 묻는다.
  const foreign = text.match(FOREIGN_SCRIPT);
  if (foreign) return { reason: `한글·영문 밖의 문자(${foreign[0]})` };
  if ([...text].length > SUMMARY_MAX_CHARS) return { reason: `${[...text].length}자 — 상한 초과` };
  return { text };
}

/** 근거 문장 번호 상한 — 지시문이 1~3개를 요구한다(구조화 출력은 개수 제한을 지원하지 않아 코드가 자른다) */
const EVIDENCE_IDS_MAX = 3;

/**
 * 근거 — 새 형식은 문장 번호(`evidence_ids`)를 원문 번호표(`sentences`)로 문장으로 바꾼다. 옛 형식(`evidence` 자유 인용)은
 * 원문 대조(`evidenceIn`)로 받는다 — `--replay`가 저장된 옛 원출력을 다시 읽는다.
 * 자유 인용을 버린 이유: 같은 보도를 다시 물으면 모델이 인용을 실행마다 다르게 줄여 판정의 7%쯤이 대조에서 갈렸고, 버려진 행이
 * 24시간마다 같은 이유로 다시 물렸다. 번호는 대조할 것이 없다 — 범위 안이면 그 문장이 근거다.
 * @returns {{ evidence: string, ok: boolean, issue?: string, quote?: string }} `ok`는 "원문에 있는 근거가 있다"
 */
function evidenceOf(obj, sentText, sentences) {
  if (Array.isArray(obj.evidence_ids)) {
    if (!Array.isArray(sentences)) return { evidence: "", ok: false, issue: "문장 번호표 없이 번호 근거를 읽을 수 없다" };
    const ids = [...new Set(obj.evidence_ids)];
    const bad = ids.filter((i) => !Number.isInteger(i) || i < 1 || i > sentences.length);
    const text = ids.filter((i) => !bad.includes(i)).slice(0, EVIDENCE_IDS_MAX).map((i) => sentences[i - 1].trim()).filter(Boolean).join(" ");
    if (bad.length) return { evidence: text, ok: false, issue: `근거 문장 번호가 범위 밖이다(${bad.join(", ")} / ${sentences.length}문장)` };
    if (!text) return { evidence: "", ok: false, issue: "이동이라면서 근거가 없다" };
    return { evidence: text, ok: true };
  }
  const evidence = typeof obj.evidence === "string" ? obj.evidence.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim() : "";
  if (!evidence) return { evidence: "", ok: false, issue: "이동이라면서 근거가 없다" };
  // 어떤 구절이 거부됐는지 남긴다 — 구절을 봐야 원인을 가른다
  return evidenceIn(sentText, evidence) ? { evidence, ok: true } : { evidence, ok: false, issue: "근거가 원문에 없다", quote: clampCp(evidence, 120) };
}

/**
 * 모델 출력 → 판정. 순수 함수라 테스트가 API 없이 돈다. 구단·선수는 **원문에 있는 표기(mention)** 까지만 가른다 —
 * 정규화·위키데이터 확인은 `resolveClubs`(비동기)가 한다.
 * @param {string} raw 모델이 낸 글자(JSON)
 * @param {string} sentText 모델에 보낸 원문의 평문(`prepareJudgeInput`의 `sentText`) — 구단·선수·금액 대조 대상
 * @param {{ corrections?: object, player?: string | null, names?: object | null, article?: string, sentences?: string[] }} opts `player`는 규칙이 뽑아 물은 선수
 *   (있으면 모델의 player를 무시한다) · `names`는 한 토큰 이름을 풀 이름 사전(`fullNameFor`) · `article`은 받은 기사 본문(제목뿐 판정) ·
 *   `sentences`는 번호표(`numbered.sentences` — `[n]`의 평문 문장이 `sentences[n-1]`)
 * @returns {{ kind: "move", rawClubs: string[], player: string, playerKo: string | null, stage: string | null, evidence: string, from: string | null,
 *   to: string | null, suitors: string[], form: string | null, loanOwner: string | null, loanClub: string | null, loanClause: string | null,
 *   fee: { amount: number, currency: string, kind: string } | null, summary: string | null, summaryIssue: string | null }
 *   | { kind: "not_move", evidence: string | null, retrospective?: true, unnamed?: true, mention?: string | null, titleOnly?: true, renewal?: true }
 *   | { kind: "invalid", reason: string, quote?: string }}
 */
export function parseJudgement(raw, sentText, { corrections, player = null, names = null, article = "", sentences } = {}) {
  let obj;
  try {
    obj = JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").match(/\{[\s\S]*\}/u)?.[0] ?? "");
  } catch {
    return { kind: "invalid", reason: "JSON 형식이 깨졌다" };
  }
  if (typeof obj?.move !== "boolean") return { kind: "invalid", reason: "move가 true/false가 아니다" };
  const ev = evidenceOf(obj, sentText, sentences);
  const evidence = ev.evidence;
  // "이동 아님"은 근거가 없어도 받는다 — 원문에서 확인된 근거만 남긴다
  const kept = ev.ok ? clampCp(evidence, EVIDENCE_MAX_CHARS) : null;
  if (!obj.move) return { kind: "not_move", evidence: kept };
  // 회고 — 모델이 "지난 일"이라 해 놓고도 이동으로 내는 일이 있다(운영: "이동" 95건 중 11건이 이번 여름 끝난 이적의 회고였다).
  // 지시문만으로는 안 잡혀 시점을 따로 적게 하고 코드가 접는다. 근거 대조보다 **먼저** 본다 — 딜을 열지 않는 판정이라 근거가
  // 필요 없고, 판정 불가로 두면 같은 회고를 24시간마다 다시 묻는다.
  if (obj.timing === "past") return { kind: "not_move", evidence: kept, retrospective: true };
  // "이동이다"는 원문에 실제로 있는 근거가 있어야 받는다 — 지어낸 근거로 딜을 열지 않는다
  if (!ev.ok) return { kind: "invalid", reason: ev.issue, ...(ev.quote ? { quote: ev.quote } : {}) };

  // 선수 — 규칙이 뽑아 물은 이름이 있으면 그대로, 없으면 모델이 읽은 이름(원문에 있고 사람 이름처럼 생겨야 한다 — "Argentine international"은 이름이 아니다)
  // 한 토큰 이름("Haaland")은 전체 이름으로 풀리면 받는다(`fullNameFor`) — 사람 사전에 없는 한 토큰 이름을 통째로 버렸더니
  // 보드에 있는 선수의 보도까지 "선수 미특정"으로 지워졌다(운영: "이동 아님" 95건 중 놓친 5건의 4건).
  const mention = mentionIn(obj.player, sentText);
  const found = player ?? personName(mention) ?? (mention ? fullNameFor(mention, sentText, names) : null);
  // 이동이라는데 선수를 특정할 수 없는 글("South American star"·"£60m full-back")은 **영영 딜이 될 수 없다** — 판정 불가로 두면 24시간마다
  // 같은 글에 다시 물어 비용만 반복된다(감사: 판정 불가 18건 중 8건). 후보가 아니라는 뜻으로 not_move에 접고 표시만 남긴다.
  // 정규형이 비는 이름(키릴·아랍 문자 등 — 딜 키를 만들 수 없다)도 같다. 그대로 두면 판정 저장이 CHECK(선수 키 1자 이상)에 걸려 매시 다시 물린다
  if (!found || !normalizePlayer(found)) return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), unnamed: true, mention: mention ?? found ?? null };
  // 기사 본문을 받았는데 **본문에 그 선수가 없으면** 제목의 낱말만으로 만든 이적설이다 — 라이브 블로그·소식 모음의 제목
  // ("Transfer news LIVE: Arsenal target Alexander-Arnold; …")이 본문(임원 선임)과 무관한 딜이 됐다. 지시문으로 막았는데도 모델이
  // 실행마다 다르게 읽어 코드가 접는다. 성(마지막 토큰)으로 본다 — 본문은 성만 쓰는 일이 많다.
  if (article && !normalizePlayer(article).includes(normalizePlayer(found).split(" ").at(-1))) {
    return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), titleOnly: true };
  }
  let from = clubMentionIn(obj.from, sentText);
  let to = clubMentionIn(obj.to, sentText);
  if (from && to && normalizeQuote(from) === normalizeQuote(to)) from = to = null; // 같은 구단이 양쪽에 오면 어느 쪽도 믿지 않는다
  let suitors = [...new Set((Array.isArray(obj.suitors) ? obj.suitors : []).map((s) => clubMentionIn(s, sentText)).filter((s) => s && s !== from && s !== to))].slice(0, SUITORS_MAX);
  ({ to, suitors } = normalizeDestination({ to, suitors }, sentText));
  const loan = judgeLoan(obj, sentText);
  // 진행 중인 임대를 말한다면서 원문에 임대 낱말이 없다 — 새 움직임이 없다는 판정이라 이동 아님이다. 완전 이적으로 접으면 단계가 비어
  // 파생이 그 보도의 규칙 단계("합의 임박" 등)로 딜을 움직인다(가르나초의 진행 중 임대 기사가 그렇게 "합의 임박"이 됐다)
  if (obj.form === "loan_standing" && loan.form !== "loan_standing") {
    return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), standingWithoutLoan: true };
  }
  // 모델이 행선지도 관심 구단도 비웠지만 짧은 글에 출발 구단 말고 구단이 하나뿐이면 그 구단이 행선지다 — 판정이 읽은 임대 구단·보유
  // 구단은 그 "하나"가 아니다("on loan at Bournemouth from Juventus"의 본머스는 사려는 쪽이 아니다). 단 완전 영입 전환·임대 연장은 지금
  // 임대로 뛰는 구단이 곧 상대라 행선지가 비었으면 그 구단이다
  if (!to && !suitors.length) to = (loan.form === "loan_convert" || loan.form === "loan_extend") && loan.at ? loan.at : loneOtherClub(sentText, from, [loan.at, loan.owner]);
  // 재계약 가드 — 근거가 **지금 구단과의 계약**(new contract·extension)이고 행선지가 없는데 단계가 진전(협상·합의·완료)이면 그 진전은
  // 재계약의 것이다. 모델이 같은 기사를 어떤 날은 "부인", 어떤 날은 "합의"로 읽어 케인의 재계약이 다시 "합의 임박"이 됐다(운영 재판정).
  // 이적설 부인·루머로 읽은 판정(rumour·denied·collapsed)은 그대로 둔다 — 재계약이 복귀설을 끝낸다는 보도는 부인이 맞다.
  // 진행 중인 임대를 설명할 뿐인 글은 단계가 없다 — 모델이 단계를 적어도 버린다(파생이 그 보도로 딜의 단계를 움직이지 않는다)
  const stage = loan.form === "loan_standing" ? null : JUDGE_STAGES.includes(obj.stage) ? obj.stage : null;
  // 임대 연장은 "extension"을 말해도 재계약이 아니다
  if (!to && stage && !DEAD.includes(stage) && stage !== "rumour" && loan.form !== "loan_extend" && RENEWAL.test(evidence)) {
    return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), renewal: true };
  }
  const s = judgeSummary(obj.summary_ko, corrections);
  // 임대 금액(임대료·조항 금액)은 임대 형태의 판정에서만 받는다 — 완전 이적으로 접힌 판정에 남으면 이적료처럼 그려진다
  let fee = judgeFee(obj.fee, sentText);
  if (fee && LOAN_FEE_KINDS.has(fee.kind) && !(loan.form && LOAN_FORMS.includes(loan.form))) fee = null;
  return {
    kind: "move",
    // 모델이 적은 그대로의 구단 표기 — 요약에 영문으로 남은 구단명을 한국어로 바꾸는 데 쓴다(`localizeSummary`)
    rawClubs: [obj.from, obj.to, ...(Array.isArray(obj.suitors) ? obj.suitors : []), obj.on_loan?.owner, obj.on_loan?.at].filter((c) => typeof c === "string" && c.trim()),
    player: found,
    playerKo: koNameOf(obj.player_ko, corrections),
    stage,
    evidence: clampCp(evidence, EVIDENCE_MAX_CHARS),
    from,
    to,
    suitors,
    form: loan.form,
    loanOwner: loan.owner,
    loanClub: loan.at,
    loanClause: loan.clause,
    fee,
    summary: s.text ?? null,
    summaryIssue: s.reason ?? null,
  };
}

/** 나열의 이음말 — "A, B and C"·"A as well as B"·"A, alongside B". 쉼표나 접속사 중 하나는 있어야 나열이다(공백만으로는 아니다) */
const LIST_JOIN = String.raw`(?:,\s*(?:(?:and|or|&|as well as|alongside|plus|along with)\s+)?|\s+(?:and|or|&|as well as|alongside|plus|along with)\s+)(?:the\s+)?`;

/** to가 원문에서 suitors 중 하나와 같은 나열에 묶여 있는가 — "Tottenham, Newcastle and Chelsea are interested"의 Tottenham */
export function isEnumeratedWith(text, to, suitors) {
  const t = normalizeQuote(text);
  const e = (s) => escapeRe(normalizeQuote(s));
  return suitors.some((s) => new RegExp(`${e(to)}${LIST_JOIN}${e(s)}|${e(s)}${LIST_JOIN}${e(to)}`, "u").test(t));
}

/** 그 구단이 "여럿 중 하나"로 언급됐다는 표지 — 이름이 하나뿐이어도 관심 구단은 여럿이다("Championship clubs and Celtic are eyeing …") */
const PLURAL_CUE = /\b(?:among|one of|also|several|a host of|number of|clubs|sides|teams)\b/iu;
/**
 * 같은 뜻의 **엄격한** 표지 — 모델이 직접 적은 행선지를 내릴 때 쓴다. 잘못 내리면 맞는 행선지를 잃으므로 "also"처럼 다른 뜻으로도
 * 쓰이는 낱말은 빼고("Bayern are also eyeing X"의 also는 다른 선수 얘기다), 구단·팀을 가리키는 복수 표현만 남긴다.
 */
const STRICT_PLURAL_CUE = /\b(?:among (?:the |those |several |many )?(?:clubs|sides|teams|suitors|those)|one of (?:the |several |many |a number of |[a-z]+ )?(?:clubs|sides|teams|suitors)|other (?:clubs|sides|teams|suitors)|several (?:[\w-]+ ){0,3}(?:clubs|sides|teams|suitors)|a (?:host|number) of (?:[\w-]+ ){0,3}(?:clubs|sides|teams|suitors))\b/iu;
const sentencesWith = (text, name) => String(text).split(/(?<=[.!?])\s+|\n+/u).filter((s) => normalizeQuote(s).includes(normalizeQuote(name)));
/** 영입 관심·행선지를 말하는 낱말 — 구단이 그냥 언급된 것과 가른다 */
const SUITOR_CUE = /\b(?:interest(?:ed)?|target(?:s|ed|ing)?|keen|monitor(?:ing|ed)?|tracking|eyeing|eye|wants?|bid|offer|approach(?:ed)?|linked|swoop|pursu(?:e|it|ing)|sign(?:ing)?|move for|radar)\b/iu;
/** 한 문장짜리 글로 치는 길이 — 가십 항목·트윗. 긴 기사는 구단이 여럿 스쳐 가서 "하나뿐"이 뜻을 잃는다 */
const LONE_CLUB_MAX_CHARS = 350;

/**
 * 모델이 행선지도 관심 구단도 비워 보냈는데, 짧은 글에 출발 구단 말고 **구단이 하나뿐**이고 영입 관심을 말하는 글이면 그 구단이
 * 행선지다(감사: 이카르디 → 토트넘, 코네 → 첼시). 전 소속("former X"·"from X")으로 나온 구단, 복수 표지가 있는 글은 받지 않는다.
 * @returns 정규 영문명 또는 null
 */
export function loneOtherClub(text, from, exclude = []) {
  if ([...text].length > LONE_CLUB_MAX_CHARS || text.includes("[기사 본문]")) return null;
  const origin = from ? (detectClubs(from)[0] ?? null) : null;
  if (!origin) return null; // 출발 구단을 모르면 남은 하나가 출발인지 행선지인지 알 수 없다
  // 행선지가 될 수 없는 구단(판정이 읽은 임대 구단·보유 구단)은 "하나뿐"을 셀 때도 뺀다
  const skip = new Set(exclude.filter(Boolean).map((c) => detectClubs(c)[0] ?? c));
  const others = detectClubs(text).filter((c) => c !== origin && !skip.has(c));
  if (others.length !== 1) return null;
  // 이름 없는 구단 무리("Championship clubs"·"several sides")가 함께 나오면 관심 구단이 여럿이다(`PLURAL_CUE`) — 하나로 확정하지 않는다
  if (/\b(?:former|ex-)/iu.test(text) || PLURAL_CUE.test(text) || !SUITOR_CUE.test(text)) return null;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/u);
  if (collectVotes(sentences, FROM, null, 1).has(others[0])) return null; // "joined from X" — 떠나온 구단이다
  return others[0];
}

/**
 * 이름이 적힌 관심 구단이 하나여도 원문이 **다른 관심 구단들**을 암시하면 행선지로 올리지 않는다 —
 * "Besiktas were among the sides interested"·"who is also attracting interest from Barcelona"가 행선지로 확정됐다(재측정).
 * 그 구단이 나오는 문장만 본다.
 */
function hintsOtherSuitors(text, suitor) {
  const name = normalizeQuote(suitor);
  return String(text).split(/(?<=[.!?])\s+|\n+/u).some((s) => normalizeQuote(s).includes(name) && PLURAL_CUE.test(s));
}

/**
 * 행선지 정규화 — 지시문("관심 구단이 하나뿐이면 to, 여럿이면 to는 null")을 모델이 **양방향으로** 어긴다
 * (감사 111건: 하나뿐인데 suitors에만 둔 것 7건, 여럿인데 첫 구단을 to로 확정한 것 2건). 지시문으로는 안 잡혀 코드가 정규화한다.
 * - to가 없고 suitors가 하나뿐이면 그 구단이 행선지다 — 단 원문이 다른 관심 구단을 암시하면(`hintsOtherSuitors`) 올리지 않는다.
 * - to가 suitors 중 하나와 같은 나열에 묶여 있으면 관심 구단 중 하나일 뿐이다 → suitors 맨 앞으로 내린다.
 *   "Chelsea are monitoring X but may face competition from United and Liverpool"처럼 to가 나열 밖이면(주된 구단) 그대로 둔다.
 * - to 하나만 있고 원문이 그 구단을 "여러 구단 중 하나"(`STRICT_PLURAL_CUE`)로 말하면 관심 구단으로 내린다.
 * @param {{ to: string | null, suitors: string[] }} m 원문 표기(mentionIn을 지난 값)
 */
export function normalizeDestination({ to, suitors }, sentText) {
  if (!to && suitors.length === 1 && !hintsOtherSuitors(sentText, suitors[0])) return { to: suitors[0], suitors: [] };
  // 모델이 하나만 적어 행선지로 확정했어도 원문이 "여러 구단 중 하나"라 하면 관심 구단이다(감사: 브랜스웨이트 → 레알, 엔드릭 → 맨유)
  if (to && !suitors.length && sentencesWith(sentText, to).some((s) => STRICT_PLURAL_CUE.test(s))) return { to: null, suitors: [to] };
  if (to && suitors.length && isEnumeratedWith(sentText, to, suitors)) return { to: null, suitors: [to, ...suitors].slice(0, SUITORS_MAX) };
  return { to, suitors };
}

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
    let out = detectClubs(raw)[0] ?? null;
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

/**
 * 요약의 이름을 사전 표기로 맞춘다 — 선수를 비워 물은 보도(규칙이 선수를 못 뽑았거나 넓힌 후보)는 <표기>에 선수가 실리지 않아
 * 모델이 제 표기로 적는다. 같은 선수가 요약마다 "JJ Gabriel"·"JJ 가브리엘"·"JJ 개브리얼", "마누/마뉴 코네"로 갈렸다(재실행).
 * - 선수: 영문 이름과 모델이 적은 한글 표기를 사전 표기(`ko`)로 바꾼다.
 * - 구단: 모델이 영문 그대로 남긴 구단명(`rawClubs`·정규명)을 사전의 한국어 이름으로 바꾼다.
 * 길이 상한을 넘기면 바꾸지 않은 요약을 돌려준다.
 */
export function localizeSummary(summary, { player, playerKoByModel, ko, rawClubs = [], clubKo = () => null }) {
  let out = summary;
  if (ko) {
    if (playerKoByModel && playerKoByModel !== ko) out = renameInSummary(out, playerKoByModel, ko);
    if (player) out = out.split(player).join(ko);
    // 영문 성만 남은 자리("Gakpo는") — 사전 표기의 성으로 바꾼다. 라틴 낱말 경계에서만(한글 조사는 바로 붙는다), 3자 이상만(짧은 성은
    // 다른 낱말 속에서 맞는다)
    const surname = player?.trim().split(/\s+/u);
    if (surname && surname.length >= 2 && [...surname.at(-1)].length >= 3) {
      const koSurname = ko.trim().split(/\s+/u).at(-1);
      out = out.replace(new RegExp(`(?<![\\p{Script=Latin}\\p{M}])${escapeRe(surname.at(-1))}(?![\\p{Script=Latin}\\p{M}])`, "gu"), koSurname);
    }
  }
  for (const raw of [...new Set(rawClubs)].sort((a, b) => b.length - a.length)) {
    if (!/[A-Za-z]/u.test(raw) || !out.includes(raw)) continue;
    const name = clubKo(raw);
    // 이미 그 한국어 이름이 적혀 있으면 건드리지 않는다 — "PSV 에인트호번"의 "PSV"를 또 바꿔 "PSV 에인트호번 에인트호번"이 됐다
    if (name && name !== raw && !out.includes(name)) out = out.split(raw).join(name);
  }
  // 원출력의 구단 칸에 없던 영문 구단명("Sporting", "Al-Ittifaq")도 구단 사전·확인 캐시로 풀리면 한국어로 바꾼다. 영문 구절이 **통째로**
  // 구단 하나로 풀릴 때만(사람 이름·다른 낱말 속 구단은 건드리지 않는다)
  out = out.replace(/(?<![\p{Script=Latin}\p{M}])\p{Lu}[\p{Script=Latin}\p{M}'’.&-]*(?:[ -][\p{Lu}0-9][\p{Script=Latin}\p{M}0-9'’.&-]*)*/gu, (phrase) => {
    // "Everton Soares"(선수)·"Bologna Rangers"처럼 구단 이름을 품은 다른 구절을 바꾸지 않는다 — 별칭과 통째로 같거나, 사전 밖이면 확인된 이름과 같아야 한다
    if (detectClubs(phrase).length && !isClubName(phrase)) return phrase;
    const name = clubKo(phrase);
    return name && name !== phrase && !out.includes(name) ? name : phrase;
  });
  return [...out].length <= SUMMARY_MAX_CHARS ? out : summary;
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
const REPLAY_COLUMNS = ["verdict", "verdict_player", "verdict_player_name", "verdict_evidence", "verdict_from", "verdict_to", "verdict_suitors", "verdict_stage", "verdict_fee_amount", "verdict_fee_currency", "verdict_fee_kind", "verdict_form", "verdict_loan_owner", "verdict_loan_club", "verdict_loan_clause", "summary_ko"];
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
    if (wantsArticle(r)) {
      article = await fetchArticleText(r.url, fetchImpl);
      // 판정 때도 본문 없이 물었으면(`verdict_article_chars` 0) 저장된 글만으로 재생한다 — 같은 글인지는 아래 원문 지문 대조가 지킨다
      if (!article && r.verdict_article_chars !== 0) { out.skipped += 1; continue; }
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
    passWarnings.push(`${why} — 남은 ${left}건은 다음 실행이 묻는다`);
  };
  const onStop = (r, left) => {
    if (stopped) return;
    stopped = true;
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

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
import { detectClubs } from "./clubs.mjs";
import { FROM, collectVotes } from "./direction.mjs";
import { personName } from "./extract.mjs";
import { NAME_TABLE, cacheLlmNames, loadGlossary, renameInSummary } from "./names-ko.mjs";
import { COLLECTOR_UA } from "./sources.mjs";
import { DEAD, RANK, RENEWAL, isRoundupItem } from "./story.mjs";
import { lookupKo } from "./wikidata.mjs";
import { clampCp } from "../sync-db.mjs";
import { normalizePlayer } from "./player-key.mjs";

/** 사용자가 고른 모델 — Haiku 4.5는 공식 이적 보도를 "무관"으로 버린 적이 있다 */
export const JUDGE_MODEL = "claude-sonnet-5";
/** 한 번 실행의 호출 상한 — 백필·버그가 한 시간에 비용을 태우지 않게 한다. 남은 행은 다음 실행이 잇는다 */
export const JUDGE_MAX_PER_RUN = 60;
/** 판정 불가·요약 실패로 끝난 행을 다시 묻기까지의 간격 */
export const JUDGE_RETRY_MS = 24 * 3_600_000;
/** 요약 실패를 다시 시도하는 기간 — 이보다 오래된 보도는 영문 발췌로 둔다 */
export const SUMMARY_RETRY_WINDOW_MS = 14 * 86_400_000;
/** 근거 인용 상한 — DB CHECK(`transfer_news_verdict_evidence_len`)와 같은 값 */
export const EVIDENCE_MAX_CHARS = 300;
/** 요약 상한 — DB CHECK(`transfer_news_summary_ko_len`)와 같은 값. 지시문은 120자 안팎을 요구한다 */
export const SUMMARY_MAX_CHARS = 160;
/** 관심 구단 상한 — DB CHECK(`transfer_news_verdict_suitors_size`)와 같은 값 */
export const SUITORS_MAX = 10;
/** 원출력 상한 — DB CHECK(`transfer_news_verdict_raw_len`)와 같은 값 */
export const RAW_MAX_CHARS = 2_000;
/** 금액의 성격 — `transfer_fee_kind` enum과 같은 값 */
export const FEE_KINDS = ["fee", "bid", "asking_price", "release_clause", "valuation"];
const FEE_CURRENCIES = ["GBP", "EUR", "USD"];
/** 단일 이적의 금액 상한(백만) — DB CHECK(`transfer_news_verdict_fee_amount_range`)와 같은 값 */
const FEE_MAX_M = 350;
/** 저장된 글의 상한(글자) — 기자 속보는 핵심을 첫 문장에 쓰므로 뒤를 자른다 */
export const BODY_MAX_CHARS = 1_200;
/** 기사 본문의 상한(글자) — 핵심은 앞 문단에 있다 */
export const ARTICLE_MAX_CHARS = 3_000;
const ARTICLE_TIMEOUT_MS = 10_000;
/** 판정자가 낼 수 있는 단계 — `transfer_stage` enum에서 unknown을 뺀 것 */
export const JUDGE_STAGES = [...RANK, ...DEAD];

const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
/** 모델 출력의 형식 — 스키마로 고정한다 */
export const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["move", "timing", "player", "player_ko", "stage", "from", "to", "suitors", "fee", "evidence", "summary_ko"],
  properties: {
    move: { type: "boolean" },
    timing: nullable({ type: "string", enum: ["current", "past"] }),
    player: nullable({ type: "string" }),
    player_ko: nullable({ type: "string" }),
    stage: nullable({ type: "string", enum: JUDGE_STAGES }),
    from: nullable({ type: "string" }),
    to: nullable({ type: "string" }),
    suitors: { type: "array", items: { type: "string" } },
    fee: nullable({
      type: "object",
      additionalProperties: false,
      required: ["amount", "currency", "kind"],
      properties: { amount: { type: "number" }, currency: { type: "string", enum: FEE_CURRENCIES }, kind: { type: "string", enum: FEE_KINDS } },
    }),
    evidence: { type: "string" },
    summary_ko: nullable({ type: "string" }),
  },
};

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
export async function fetchArticleText(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": COLLECTOR_UA }, signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS), redirect: "follow" });
    if (!res.ok) return "";
    return extractArticleText(await res.text());
  } catch {
    return "";
  }
}

// ── 요청 조립 ──────────────────────────────────────────────────────────

/**
 * 모델에 보낼 글의 말줄임 — 잘렸음을 `…`로 알린다(자르기는 `sync-db.mjs`의 `clampCp`).
 * ⚠ **DB에 저장하는 값에는 쓰지 않는다** — `…`가 붙어 상한보다 한 글자 길어진다. 근거 인용이
 *   300자를 넘으면 301코드포인트가 되어 CHECK(`transfer_news_verdict_evidence_len`)에 걸렸다.
 */
function ellipsize(text, max) {
  const cut = clampCp(text, max);
  return cut === text ? text : `${cut}…`;
}

/** 링크 주소를 걷는다 — 모델은 링크를 열 수 없고 열 도구도 주지 않는다 */
export function stripLinks(body) {
  return body
    .replace(/\bhttps?:\/\/\S+/giu, " ")
    .replace(/\b(?:pic\.twitter\.com|t\.co)\/\S+/giu, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/** 모델에 보내는 글 — 저장된 글(링크를 걷고 자른 것) + 받은 기사 본문. 근거·구단·선수 대조도 이 글과 한다 */
export function composeText(storedBody, article = "") {
  const stored = ellipsize(stripLinks(storedBody), BODY_MAX_CHARS);
  return article ? `${stored}\n\n[기사 본문]\n${stripLinks(article)}` : stored;
}

/** 지시문 — 모든 호출이 같은 문자열이다(용어 사전 포함). 행마다 달라지는 것은 사용자 메시지로 간다 */
export function buildSystem(terms = loadGlossary().terms) {
  const termLines = Object.entries(terms).map(([en, ko]) => `${en} → ${ko}`);
  return `너는 축구 이적 보도를 읽는 편집자다. <원문>이 <선수>의 구단 이동을 지금 보도하는지 판정하고, 선수·시점·단계·구단·금액과 한국어 요약을 낸다. 아래 순서대로 정한다.

[player] <선수>가 있으면 그 이름을 그대로 옮긴다. <선수>가 비어 있으면 원문이 이동을 다루는 선수 **한 명**의 이름을 원문 표기 그대로 적는다 — 성과 이름이 원문에 모두 있으면 전체 이름(감독·코치·임원·에이전트는 선수가 아니다). 선수를 특정할 수 없으면 null이고 move는 false다.

[timing] current — 지금 진행 중이거나 이번에 새로 나온 소식(새 관심·협상·합의·발표·무산·부인). past — 이미 끝난 일(완료된 이적, 지난 창의 무산·관심)을 돌아보는 글(무산된 이적을 회상하는 선수 인터뷰 포함)과 그 뒷이야기(뒤늦게 공개된 이적료·협상 과정, 대리인·변호사·전 감독의 설명, 이적한 뒤의 적응·평가, 지난 창 영입을 정리·평가하는 베스트 영입·결산 기사). 지난 일을 언급해도 **지금 다시 움직임이 있다**는 소식(1월에 재도전한다, 여전히 원한다, 다시 접촉했다)이면 current다. 이적과 무관한 글은 null.
예: "X reflects on collapse of City move" → past · "Braga president reveals fee Newcastle paid for X" → past · "X rejected interest from Liverpool this summer" → past · "X still keen to join Liverpool after summer move failed" → current · "Juventus confirm signing of X" → current.

[move] true: 이적·임대·자유계약 이적, 영입 관심·루머·제안·협상·합의·개인 조건·메디컬·공식 발표, 진행 중인 이적의 무산·결렬, **루머에 대한 부인**(구단이 팔 생각이 없다·선수가 떠날 생각이 없다·기자가 관심설을 부인 — stage denied), 입단 테스트 뒤 **계약을 맺었다·서명했다**는 보도(official), 가족·에이전트·대리인의 발언으로 전하는 이적 가능성과 관심 구단(rumour), 친정 복귀설·복귀 가능성(rumour), 유스·10대 선수의 구단 이동.
false:
- timing이 past인 글
- 지금 소속 구단과의 재계약·계약 연장·첫 프로 계약
- 인터뷰·발언·의견·비교·칭찬(누구를 닮았다, 누구와 의견이 같다)
- 경기 결과·부상·징계·대표팀 소집
- 감독·코치·단장·임원의 선임·거취
- <선수>는 곁다리이고 다른 사람의 이동을 다루는 글
- 제목에만 이적 낱말이 있고 본문이 다른 이야기인 글(라이브 블로그·소식 모음의 제목)
- 입단 테스트·전지훈련 합류(계약을 맺었다는 말이 없으면)
관용구에 속지 않는다: "in agreement with"(의견 동의), "not interested in", 낚시성 제목.

[stage] move가 true일 때 보도가 말하는 단계 하나, false면 null. rumour(관심·주시·연결) · talks(협상·접촉·논의) · offer(제안·입찰 제출) · agreement(구단 간 합의) · personal_terms(개인 조건 합의) · medical(메디컬 진행) · here_we_go(확정, 공식 발표 전) · official(공식 발표·완료) · collapsed(진행 중이던 협상·제안·합의가 깨짐·제안 거절) · denied(관심·연결 루머를 구단·선수·기자가 부인, 매각 거부, 이적 생각 없음).

[from / to / suitors] 원문에 적힌 구단명을 글자 그대로 옮긴다(번역·줄임·정규화하지 않는다). 원문에 없으면 null·[].
- from: <선수>의 현재 소속 구단(자유계약이면 직전 소속, 임대 중이면 임대로 뛰는 구단).
- to: 선수가 **실제로 가려는·간 구단** — 협상·제안·합의·완료의 상대, 또는 관심을 보인 구단이 하나뿐일 때 그 구단.
- 관심만 보인 구단이 여럿이면 to는 null이고 그 구단들을 전부 suitors에 언급 순으로 적는다(최대 ${SUITORS_MAX}) — 그중 하나를 골라 to에 넣지 않는다. to가 있으면서 다른 관심 구단도 있으면 그것들이 suitors다.
- suitors에는 **이 글이 지금 관심을 보인다고 말하는 구단만** 적는다 — 과거에 무산된 이적의 상대나 다른 루머의 구단은 넣지 않는다.
예: "Bayern are keen on X" → to Bayern, suitors [] · "Tottenham, Newcastle and Chelsea are interested in X" → to null, suitors 셋 · "Chelsea are monitoring X but face competition from United and Liverpool" → to Chelsea, suitors [United, Liverpool] · "Real Madrid are interested in Stuttgart's X" → from Stuttgart, to Real Madrid.

[fee] <선수>의 이동에 붙은 금액 **하나**와 그 성격, 원문에 없으면 null. amount는 원문 숫자 그대로 백만 단위로(£60m → 60, €500k → 0.5), currency는 GBP·EUR·USD. kind: fee(합의·완료된 이적료) · bid(제안·입찰액) · asking_price(구단의 요구액·가격표) · release_clause(바이아웃) · valuation(평가액·예상액). 금액이 여럿이면 가장 최근의 핵심 금액, 범위(€20-25m)면 높은 값, 같은 금액을 두 통화로 적었으면(€100m (£86m)) 먼저 적힌 쪽. 다른 선수의 금액, 주급·연봉, 옵션(add-ons)은 적지 않는다.

[evidence] move 판단의 근거가 된 원문 구절 하나를 글자 그대로 옮긴다(25단어 이내). false이고 마땅한 구절이 없으면 "".

[player_ko] 선수의 한글 표기 — <표기>에 있으면 그것, 없으면 **한국 축구 팬·매체가 실제로 쓰는 표기**(외래어 표기법식이 아니다: Cody Gakpo → 코디 각포, Erling Haaland → 엘링 홀란드, Virgil van Dijk → 버질 반 다이크, Alex Scott → 알렉스 스콧, Trent Alexander-Arnold → 트렌트 알렉산더-아놀드). 통용 표기를 모르면 null(음역을 지어내지 않는다).

[summary_ko] move가 true일 때만 한국어 1~2문장, 공백 포함 120자 안팎. false면 null.
- 원문에 없는 사실을 더하지 않는다. 숫자는 원문 값 그대로(€50m, 2027년 6월).
- <선수>의 이야기만 쓴다 — 같은 글의 다른 선수 소식은 뺀다.
- fee가 있으면 그 금액을 **반드시** 적고 성격을 밝힌다("£60m 제안이 거절됐다", "요구액은 €100m", "바이아웃 €65m"). 요구액·제안액을 이적료라고 쓰지 않는다.
- 현재 소속 구단이 원문에 있으면 적고, 임대·자유계약이면 그 사실을 적는다. 지난 일은 과거형으로, 지금 일과 섞지 않는다.
- 이름은 <표기>의 표기를 쓰고 선수는 player_ko와 같게 쓴다. 표기를 모르면 영문 그대로 둔다. 이적 용어는 <용어>의 표기를 쓴다.
- 한글·숫자·통화 기호와 영문 고유명사만 쓴다(한자·다른 문자를 섞지 않는다).
<용어>
${termLines.join("\n") || "(없음)"}
</용어>`;
}

/**
 * 그 보도에 나온 구단·선수의 한국어 표기 — 표기가 있는 것만 싣는다(전체 사전은 호출마다 토큰이다).
 * @param {{ clubs?: string[], playerKey: string | null, player: string | null }} need 구단은 정규 영문명
 * @param {{ club: Function, playerKo: Function }} names
 */
export function buildGlossary(need, names) {
  const lines = [];
  for (const en of need.clubs ?? []) {
    const ko = names.club(en)?.name;
    if (ko && ko !== en) lines.push(`${en} = ${ko}`);
  }
  // 선수 표기는 **사람 사전과 판정자의 통용 표기만** 넘긴다 — 위키데이터 레이블(외래어 표기법식)을 넘기면 모델이 그대로 받아 적어
  // 팬들이 쓰는 표기로 바뀔 기회가 없다. 넘기지 않으면 모델이 통용 표기를 적고 그 값이 캐시를 덮는다(`cacheLlmNames`).
  const ko = need.playerKey ? (names.playerKoTrusted ?? names.playerKo)(need.playerKey) : null;
  if (ko) lines.push(`${need.player} = ${ko}`);
  return lines;
}

/** 사용자 메시지 — 선수 · 표기 · 원문. 시각·난수 같은 변동값을 싣지 않는다(같은 행이면 같은 요청) */
export function buildUserContent(player, glossaryLines, text) {
  return `<선수>${player ?? ""}</선수>\n<표기>\n${glossaryLines.join("\n") || "(없음)"}\n</표기>\n<원문>\n${text}\n</원문>`;
}

/**
 * 요청 — 순수 함수(테스트가 모양을 고정한다).
 * @param {{ player: string | null, playerKey: string | null, body: string, clubs?: string[] }} need
 */
export function buildJudgeRequest(need, names, system, article = "") {
  return {
    model: JUDGE_MODEL,
    max_tokens: 700,
    // 짧은 판정과 두 줄 요약이라 생각이 필요 없다
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserContent(need.player, buildGlossary(need, names), composeText(need.body, article)) }],
  };
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
export function clubMentionIn(mention, sentText) {
  const verbatim = mentionIn(mention, sentText);
  if (verbatim || typeof mention !== "string") return verbatim;
  const canonical = detectClubs(mention)[0];
  return canonical && detectClubs(sentText).includes(canonical) ? canonical : null;
}

/** 선수 한글 표기의 형식 — 한글 낱말들(사이 공백·가운뎃점·붙임표), 40자 이내 */
export const isKoName = (v) => typeof v === "string" && /^[가-힣]+(?:[\s·-][가-힣]+)*$/u.test(v.trim()) && [...v.trim()].length <= 40;

/** 요약문의 옛·틀린 표기를 저장 직전에 바로잡는다 — 긴 키부터(“스포팅 디렉터”가 “스포팅”보다 먼저) */
export function applyCorrections(text, corrections = loadGlossary().corrections) {
  let out = text;
  for (const [wrong, right] of Object.entries(corrections).sort(([a], [b]) => b.length - a.length)) out = out.split(wrong).join(right);
  return out;
}

/**
 * 요약의 기계적 손질 — 교정표(한국어 → 한국어)로 적을 수 없는 것. "시티行"(한자 行 → 행)과, 용어 표기를 괄호로 되풀이한
 * "확정되었으며(이적 확정)"이 운영에 나갔다.
 */
const tidySummary = (text) => text.replace(/(?<=[가-힣A-Za-z])行/gu, "행").replace(/(확정[가-힣]*)\s?\(이적 확정\)/gu, "$1");

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
  if (!moneyMentions(sentText).some((m) => m.currency === fee.currency && Math.abs(m.amount - amount) < 0.011)) return null;
  return { amount, currency: fee.currency, kind: fee.kind };
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
  const text = tidySummary(applyCorrections(raw.replace(/\s+/g, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim(), corrections));
  if (!text) return { reason: "요약이 비었다" };
  if (!/[가-힣]/.test(text)) return { reason: "한글이 없다" };
  // 한글·라틴 문자 밖의 글자가 섞이면 버린다 — "메دي컬"(아랍 문자)·"맨체스터 시티行"(한자)이 화면에 나갔다(운영).
  // 흔한 것은 앞의 손질(`tidySummary` — 行 → 행)이 고치고, 남은 것은 다시 묻는다.
  const foreign = text.match(FOREIGN_SCRIPT);
  if (foreign) return { reason: `한글·영문 밖의 문자(${foreign[0]})` };
  if ([...text].length > SUMMARY_MAX_CHARS) return { reason: `${[...text].length}자 — 상한 초과` };
  return { text };
}

/**
 * 모델 출력 → 판정. 순수 함수라 테스트가 API 없이 돈다. 구단·선수는 **원문에 있는 표기(mention)** 까지만 가른다 —
 * 정규화·위키데이터 확인은 `resolveClubs`(비동기)가 한다.
 * @param {string} raw 모델이 낸 글자(JSON)
 * @param {string} sentText 모델에 보낸 원문(`composeText`) — 근거·구단·선수 대조 대상
 * @param {{ corrections?: object, player?: string | null, names?: object | null, article?: string }} opts `player`는 규칙이 뽑아 물은 선수
 *   (있으면 모델의 player를 무시한다) · `names`는 한 토큰 이름을 풀 이름 사전(`fullNameFor`) · `article`은 받은 기사 본문(제목뿐 판정)
 * @returns {{ kind: "move", rawClubs: string[], player: string, playerKo: string | null, stage: string | null, evidence: string, from: string | null,
 *   to: string | null, suitors: string[], fee: { amount: number, currency: string, kind: string } | null, summary: string | null, summaryIssue: string | null }
 *   | { kind: "not_move", evidence: string | null, retrospective?: true, unnamed?: true, mention?: string | null, titleOnly?: true, renewal?: true }
 *   | { kind: "invalid", reason: string, quote?: string }}
 */
export function parseJudgement(raw, sentText, { corrections, player = null, names = null, article = "" } = {}) {
  let obj;
  try {
    obj = JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").match(/\{[\s\S]*\}/u)?.[0] ?? "");
  } catch {
    return { kind: "invalid", reason: "JSON 형식이 깨졌다" };
  }
  if (typeof obj?.move !== "boolean") return { kind: "invalid", reason: "move가 true/false가 아니다" };
  const evidence = typeof obj.evidence === "string" ? obj.evidence.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim() : "";
  const quoted = evidenceIn(sentText, evidence);
  if (!obj.move) return { kind: "not_move", evidence: quoted ? clampCp(evidence, EVIDENCE_MAX_CHARS) : null };
  // 회고 — 모델이 "지난 일"이라 해 놓고도 이동으로 내는 일이 있다(운영: "이동" 95건 중 11건이 이번 여름 끝난 이적의 회고였다).
  // 지시문만으로는 안 잡혀 시점을 따로 적게 하고 코드가 접는다. 근거 대조보다 **먼저** 본다 — 딜을 열지 않는 판정이라 근거가
  // 필요 없고, 판정 불가로 두면 같은 회고를 24시간마다 다시 묻는다.
  if (obj.timing === "past") return { kind: "not_move", evidence: quoted ? clampCp(evidence, EVIDENCE_MAX_CHARS) : null, retrospective: true };
  // "이동이다"는 원문에 실제로 있는 근거가 있어야 받는다 — 지어낸 근거로 딜을 열지 않는다
  if (!evidence) return { kind: "invalid", reason: "이동이라면서 근거가 없다" };
  // 어떤 구절이 거부됐는지 남긴다 — 근거 불일치가 판정의 5%쯤 나오는데(감사) 구절을 봐야 원인을 가른다
  if (!quoted) return { kind: "invalid", reason: "근거가 원문에 없다", quote: clampCp(evidence, 120) };

  // 선수 — 규칙이 뽑아 물은 이름이 있으면 그대로, 없으면 모델이 읽은 이름(원문에 있고 사람 이름처럼 생겨야 한다 — "Argentine international"은 이름이 아니다)
  // 한 토큰 이름("Haaland")은 전체 이름으로 풀리면 받는다(`fullNameFor`) — 사람 사전에 없는 한 토큰 이름을 통째로 버렸더니
  // 보드에 있는 선수의 보도까지 "선수 미특정"으로 지워졌다(운영: "이동 아님" 95건 중 놓친 5건의 4건).
  const mention = mentionIn(obj.player, sentText);
  const found = player ?? personName(mention) ?? (mention ? fullNameFor(mention, sentText, names) : null);
  // 이동이라는데 선수를 특정할 수 없는 글("South American star"·"£60m full-back")은 **영영 딜이 될 수 없다** — 판정 불가로 두면 24시간마다
  // 같은 글에 다시 물어 비용만 반복된다(감사: 판정 불가 18건 중 8건). 후보가 아니라는 뜻으로 not_move에 접고 표시만 남긴다.
  if (!found) return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), unnamed: true, mention: mention ?? null };
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
  // 모델이 행선지도 관심 구단도 비웠지만 짧은 글에 출발 구단 말고 구단이 하나뿐이면 그 구단이 행선지다
  if (!to && !suitors.length) to = loneOtherClub(sentText, from);
  // 재계약 가드 — 근거가 **지금 구단과의 계약**(new contract·extension)이고 행선지가 없는데 단계가 진전(협상·합의·완료)이면 그 진전은
  // 재계약의 것이다. 모델이 같은 기사를 어떤 날은 "부인", 어떤 날은 "합의"로 읽어 케인의 재계약이 다시 "합의 임박"이 됐다(운영 재판정).
  // 이적설 부인·루머로 읽은 판정(rumour·denied·collapsed)은 그대로 둔다 — 재계약이 복귀설을 끝낸다는 보도는 부인이 맞다.
  const stage = JUDGE_STAGES.includes(obj.stage) ? obj.stage : null;
  if (!to && stage && !DEAD.includes(stage) && stage !== "rumour" && RENEWAL.test(evidence)) {
    return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), renewal: true };
  }
  const s = judgeSummary(obj.summary_ko, corrections);
  return {
    kind: "move",
    // 모델이 적은 그대로의 구단 표기 — 요약에 영문으로 남은 구단명을 한국어로 바꾸는 데 쓴다(`localizeSummary`)
    rawClubs: [obj.from, obj.to, ...(Array.isArray(obj.suitors) ? obj.suitors : [])].filter((c) => typeof c === "string" && c.trim()),
    player: found,
    playerKo: isKoName(obj.player_ko) ? obj.player_ko.trim() : null,
    stage,
    evidence: clampCp(evidence, EVIDENCE_MAX_CHARS),
    from,
    to,
    suitors,
    fee: judgeFee(obj.fee, sentText),
    summary: s.text ?? null,
    summaryIssue: s.reason ?? null,
  };
}

/** 나열의 이음말 — "A, B and C"·"A as well as B"·"A, alongside B". 쉼표나 접속사 중 하나는 있어야 나열이다(공백만으로는 아니다) */
const LIST_JOIN = String.raw`(?:,\s*(?:(?:and|or|&|as well as|alongside|plus|along with)\s+)?|\s+(?:and|or|&|as well as|alongside|plus|along with)\s+)(?:the\s+)?`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
export function loneOtherClub(text, from) {
  if ([...text].length > LONE_CLUB_MAX_CHARS || text.includes("[기사 본문]")) return null;
  const origin = from ? (detectClubs(from)[0] ?? null) : null;
  if (!origin) return null; // 출발 구단을 모르면 남은 하나가 출발인지 행선지인지 알 수 없다
  const others = detectClubs(text).filter((c) => c !== origin);
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
export function hintsOtherSuitors(text, suitor) {
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
 * @param {{ from: string | null, to: string | null, suitors: string[] }} m
 * @param {ReturnType<import("./names-ko.mjs").createNameBook>} book
 * @param {{ lookup?: typeof lookupKo, cacheRows?: object[], nowMs?: number }} opts `cacheRows`에 새로 확인한 행을 모아 준다(호출부가 한 번에 쓴다)
 */
export async function resolveClubs(m, book, { lookup = lookupKo, cacheRows = [], nowMs = Date.now() } = {}) {
  const memo = new Map();
  const resolve = async (raw) => {
    if (!raw) return null;
    if (memo.has(raw)) return memo.get(raw);
    let out = detectClubs(raw)[0] ?? null;
    if (!out) {
      if (book.isVerifiedClub(raw)) out = raw;
      else if (!book.needsLookup("club", raw, nowMs)) out = null; // 최근에 찾아봤지만 축구 클럽이 아니었다
      else {
        try {
          const r = await lookup(raw, "club");
          cacheRows.push({ kind: "club", key: raw, name_en: raw.slice(0, 120), name_ko: r.nameKo, wikidata_id: r.wikidataId, source: "wikidata", checked_at: new Date().toISOString() });
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
  return { from, to, suitors };
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
  }
  for (const raw of [...new Set(rawClubs)].sort((a, b) => b.length - a.length)) {
    if (!/[A-Za-z]/u.test(raw) || !out.includes(raw)) continue;
    const name = clubKo(raw);
    // 이미 그 한국어 이름이 적혀 있으면 건드리지 않는다 — "PSV 에인트호번"의 "PSV"를 또 바꿔 "PSV 에인트호번 에인트호번"이 됐다
    if (name && name !== raw && !out.includes(name)) out = out.split(raw).join(name);
  }
  return [...out].length <= SUMMARY_MAX_CHARS ? out : summary;
}

// ── 실행 ──────────────────────────────────────────────────────────────

/**
 * 해석된 판정 → 저장할 값. 판정 실행(`runJudgements`)과 재생(`replayJudgements`)이 함께 쓴다.
 * @param {{ id: number, playerKey: string | null, player: string | null, summary_ko?: string | null }} n
 * @param {object} ctx `out`(집계) · `book`·`trusted`(이름) · `llmKo`·`koEntries`(이번 실행의 통용 표기) · `clubCache` · `lookup` · `nowMs` · `verdictAt`
 */
async function settleJudgement(n, judged, rawText, ctx) {
  const { out, book, trusted, llmKo, koEntries, clubCache, lookup, nowMs } = ctx;
  // 판정 불가도 시각을 찍는다 — 매시간 다시 부르지 않게(`JUDGE_RETRY_MS` 뒤 다시 묻는다)
  const update = {
    verdict: null, verdict_player: n.playerKey, verdict_player_name: null, verdict_evidence: null, verdict_from: null, verdict_to: null,
    verdict_suitors: [], verdict_stage: null, verdict_at: ctx.verdictAt ?? new Date().toISOString(),
    verdict_fee_amount: null, verdict_fee_currency: null, verdict_fee_kind: null,
    // 원출력 — 상한을 넘으면(요약이 비정상적으로 길다) 남기지 않는다. 잘린 JSON은 재생할 수 없다
    verdict_raw: rawText && [...rawText].length <= RAW_MAX_CHARS ? rawText : null,
  };
  const label = n.player ?? judged.player ?? "?";
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
    });
    // 통용 표기 — 사람 사전·앞선 통용 표기가 없을 때만 받는다(위키데이터 레이블은 덮는다)
    if (judged.playerKo && !trusted(key)) {
      llmKo.set(key, judged.playerKo);
      koEntries.push({ key, name: judged.player, ko: judged.playerKo });
    }
    if (judged.summary) {
      out.summarized += 1;
      update.summary_ko = localizeSummary(judged.summary, {
        player: judged.player, playerKoByModel: judged.playerKo, ko: book.playerKo(key), rawClubs: judged.rawClubs,
        clubKo: (raw) => { const c = detectClubs(raw)[0] ?? (book.isVerifiedClub(raw) ? raw : null); return c ? (book.club(c)?.name ?? null) : null; },
      });
    } else {
      out.summaryInvalid += 1;
      out.warnings.push(`#${n.id} 요약 버림(${label}): ${judged.summaryIssue} — 다음 실행이 다시 묻는다`);
      // 옛 요약이 있으면 둔다(다시 물은 경우) — 영문으로 되돌릴 이유가 없다
      if (!n.summary_ko) update.summary_ko = null;
    }
  } else if (judged.kind === "not_move") {
    out.notMove += 1;
    if (judged.unnamed) out.unnamed += 1; // 이적 글이지만 선수를 특정할 수 없다 — 딜 후보가 아니라 not_move로 접는다(다시 묻지 않는다)
    // 한 토큰 이름이라 접은 글은 사람이 봐야 한다 — 진짜 한 이름 선수(Patric·Dodo)는 사람 사전에 넣어야 열린다
    if (judged.unnamed && judged.mention) out.warnings.push(`#${n.id} 한 토큰 이름이라 선수를 특정하지 못했다: "${judged.mention}" — 선수가 맞으면 players-ko.json에 넣는다`);
    if (judged.retrospective) out.retrospective += 1;
    if (judged.titleOnly) out.titleOnly += 1;
    Object.assign(update, { verdict: "not_move", verdict_evidence: judged.evidence, summary_ko: null });
  } else {
    out.invalid += 1;
    out.warnings.push(`#${n.id} 판정 불가(${label}): ${judged.reason}${judged.quote ? ` — "${judged.quote}"` : ""} — ${JUDGE_RETRY_MS / 3_600_000}시간 뒤 다시 묻는다`);
  }
  return update;
}

const newStats = (read) => ({
  read, move: 0, notMove: 0, unnamed: 0, retrospective: 0, titleOnly: 0, invalid: 0, summarized: 0, summaryInvalid: 0, failed: 0, extractedPlayers: 0,
  clubsVerified: 0, clubsRejected: 0, namesWritten: 0,
  articles: 0, articleMissing: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, warnings: [], updates: [],
});

/** 새로 확인한 구단(위키데이터)과 모델의 통용 표기를 이름 캐시에 쓴다 — 실패는 경고다(다음 실행이 다시 찾는다) */
async function flushNames(supabase, out, clubCache, koEntries, names) {
  if (clubCache.length) {
    const { error } = await supabase.from(NAME_TABLE).upsert(clubCache, { onConflict: "kind,key" });
    if (error) out.warnings.push(`구단 확인 캐시 저장 실패: ${error.message}`);
    else out.namesWritten += clubCache.length;
  }
  if (koEntries.length) {
    try {
      out.namesWritten += await cacheLlmNames(supabase, koEntries, names);
    } catch (e) {
      out.warnings.push(e instanceof Error ? e.message : String(e));
    }
  }
}

/** 저장된 판정과 재생한 판정이 같은가 — 재생은 달라진 행만 쓴다 */
const REPLAY_COLUMNS = ["verdict", "verdict_player", "verdict_player_name", "verdict_evidence", "verdict_from", "verdict_to", "verdict_suitors", "verdict_stage", "verdict_fee_amount", "verdict_fee_currency", "verdict_fee_kind", "summary_ko"];
const sameVerdict = (a, b) => REPLAY_COLUMNS.every((c) => (c.includes("fee_amount") ? Number(a[c] ?? NaN) === Number(b[c] ?? NaN) || (a[c] == null && b[c] == null) : JSON.stringify(a[c] ?? null) === JSON.stringify(b[c] ?? null)));

/**
 * 재생 — 저장된 원출력(`verdict_raw`)을 **지금의 해석으로 다시 읽어** 달라진 행만 쓴다. API를 부르지 않는다.
 * 해석(`parseJudgement`)·구단 확인·요약 손질을 고쳤을 때 쓴다(지시문을 고쳤으면 다시 물어야 한다 — `--rejudge`).
 * ⚠ 근거·구단 대조는 판정 때 보낸 글과 해야 맞는다 — 매체 RSS는 기사 본문을 다시 받는다(받지 못하면 그 행은 건드리지 않는다:
 *   본문 없이 다시 읽으면 본문에서 인용한 근거가 "원문에 없다"로 떨어진다).
 * ⚠ 판정 시각은 그대로 둔다 — 재생은 새 시도가 아니다.
 * @param {object[]} rows `id, body, source_id, external_id, url, verdict*, summary_ko`
 */
export async function replayJudgements(supabase, rows, { names, fetchImpl = fetch, lookup = lookupKo, corrections, nowMs = Date.now(), log = null } = {}) {
  const targets = rows.filter((r) => r.verdict_raw);
  const out = { ...newStats(targets.length), changed: 0, skipped: 0 };
  const fixes = corrections ?? loadGlossary().corrections;
  const llmKo = new Map();
  const trusted = (k) => (names.playerKoTrusted ?? names.playerKo)(k) ?? llmKo.get(k) ?? null;
  const book = { ...names, playerKo: (k) => llmKo.get(k) ?? names.playerKo(k) ?? null, playerKoTrusted: trusted };
  const clubCache = [];
  const koEntries = [];
  const titleCase = (key) => key.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
  for (const [i, r] of targets.entries()) {
    if (log && i > 0 && i % 100 === 0) log.log(`  재생 진행 ${i}/${targets.length}`);
    let article = "";
    if (wantsArticle(r)) {
      article = await fetchArticleText(r.url, fetchImpl);
      if (!article) { out.skipped += 1; continue; }
    }
    let asked = null;
    try { asked = JSON.parse(r.verdict_raw)?.player ?? null; } catch { asked = null; }
    // 물을 때 넘긴 선수 — 선수를 지정해 물은 행은 판정 키가 남아 있다. 이름은 모델이 되받아 적은 것(같은 선수일 때)이나 키에서 되살린다
    const player = r.verdict_player ? (r.verdict === "move" && r.verdict_player_name ? r.verdict_player_name : asked && normalizePlayer(asked) === r.verdict_player ? asked : titleCase(r.verdict_player)) : null;
    const n = { id: r.id, playerKey: r.verdict_player ?? null, player, summary_ko: r.summary_ko ?? null };
    const judged = parseJudgement(r.verdict_raw, composeText(r.body, article), { corrections: fixes, player, names, article });
    const update = await settleJudgement(n, judged, r.verdict_raw, { out, book, trusted, llmKo, koEntries, clubCache, lookup, nowMs, verdictAt: r.verdict_at });
    if (!("summary_ko" in update)) update.summary_ko = r.summary_ko ?? null;
    if (sameVerdict(r, update)) continue;
    const { error } = await supabase.from("transfer_news").update(update).eq("id", r.id);
    if (error) { out.failed += 1; out.warnings.push(`#${r.id} 재생 저장 실패: ${error.message}`); continue; }
    out.changed += 1;
    out.updates.push({ id: r.id, ...update });
  }
  await flushNames(supabase, out, clubCache, koEntries, names);
  return out;
}

/**
 * 판정 단계 — 파생이 넘긴 대상(`judgeNeeds`)을 묻고 저장한다.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase service_role 클라이언트
 * @param {{ id: number, playerKey: string | null, player: string | null, body: string, clubs?: string[], source_id?: string, external_id?: string, url?: string, summary_ko?: string | null }[]} needs
 *   `playerKey`가 null이면 규칙이 선수를 못 뽑은 보도다 — 모델이 선수를 읽는다.
 * @param {{ apiKey?: string, names: ReturnType<import("./names-ko.mjs").createNameBook>, limit?: number, client?: object, fetchImpl?: typeof fetch, lookup?: typeof lookupKo, corrections?: object, nowMs?: number }} opts
 *   `client`·`fetchImpl`·`lookup`은 테스트용, `system`은 지시문 비교용(옛 지시문과 새 지시문을 같은 보도에 물을 때). `corrections`가 없으면 `glossary-ko.json`의 교정표를 쓴다. `log`(Console)를 주면 20건마다 진행을 찍는다.
 * @returns 저장한 값(`updates` — 파생이 메모리의 행에 곧바로 입혀 다시 파생한다)과 집계. `namesWritten`이 0보다 크면 이름 사전을 다시 읽는다
 */
export async function runJudgements(supabase, needs, { apiKey, names, limit = JUDGE_MAX_PER_RUN, client, fetchImpl = fetch, lookup = lookupKo, corrections, nowMs = Date.now(), log = null, system = buildSystem() } = {}) {
  const api = client ?? new Anthropic({ apiKey });
  const fixes = corrections ?? loadGlossary().corrections;
  const out = newStats(needs.length);
  if (needs.length > limit) out.warnings.push(`판정 상한(${limit}) — 남은 ${needs.length - limit}건은 다음 실행이 잇는다`);

  // 이 실행에서 모델이 처음 낸 통용 표기 — 같은 선수의 다음 호출이 같은 표기를 보게 한다(사전은 실행 뒤에 다시 읽는다)
  const llmKo = new Map();
  const trusted = (k) => (names.playerKoTrusted ?? names.playerKo)(k) ?? llmKo.get(k) ?? null;
  const book = { ...names, playerKo: (k) => llmKo.get(k) ?? names.playerKo(k) ?? null, playerKoTrusted: trusted };
  const clubCache = [];
  const koEntries = [];

  const batch = needs.slice(0, limit);
  const started = Date.now();
  for (const [i, n] of batch.entries()) {
    // 호출이 한 건에 3초 안팎이라 수십 건이면 몇 분 동안 아무 출력이 없다 — 20건마다 진행을 찍는다(호출부가 log를 줄 때만)
    if (log && i > 0 && i % 20 === 0) log.log(`  LLM 판정 진행 ${i}/${batch.length} · ${((Date.now() - started) / 1000).toFixed(0)}초`);
    // 기사 본문 — 받지 못하면 저장된 글만으로 판정한다(실패가 아니다)
    let article = "";
    if (wantsArticle(n)) {
      article = await fetchArticleText(n.url, fetchImpl);
      out[article ? "articles" : "articleMissing"] += 1;
    }
    let judged;
    let rawText = null;
    try {
      const res = await api.messages.create(buildJudgeRequest(n, book, system, article));
      out.inputTokens += res.usage?.input_tokens ?? 0;
      out.outputTokens += res.usage?.output_tokens ?? 0;
      out.cacheReadTokens += res.usage?.cache_read_input_tokens ?? 0;
      out.cacheWriteTokens += res.usage?.cache_creation_input_tokens ?? 0;
      rawText = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      judged = res.stop_reason === "refusal"
        ? { kind: "invalid", reason: "모델이 거절" }
        : parseJudgement(rawText, composeText(n.body, article), { corrections: fixes, player: n.player, names, article });
    } catch (e) {
      // 인증·권한 오류는 남은 행도 전부 같은 결과다 — 멈추고 호출부가 종료 코드를 올린다
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new Error(`판정 API 인증 실패(${e.status}) — ANTHROPIC_API_KEY를 확인하세요`);
      }
      if (e instanceof Anthropic.RateLimitError) {
        out.warnings.push("판정 API 한도 초과 — 남은 행은 다음 실행으로 넘긴다");
        break;
      }
      // 계정 사용 한도(400 "usage limits")·크레딧 소진(400 "credit balance is too low")도 남은 행이 전부 같은 결과다 —
      // 곧바로 거부될 호출을 이어 보내지 않는다. 크레딧 소진을 빠뜨렸더니 한 실행이 546건을 전부 부르고 전부 거부당했다.
      if (e instanceof Anthropic.APIError && e.status === 400 && /usage limit|credit balance/iu.test(e.message)) {
        out.failed += 1;
        out.warnings.push(`판정 API 계정 사용 한도에 닿았다 — 남은 ${batch.length - i - 1}건은 다음 실행으로 넘긴다: ${e.message.slice(0, 160)}`);
        break;
      }
      out.failed += 1;
      out.warnings.push(`#${n.id} 판정 실패: ${e instanceof Anthropic.APIError ? e.status : ""} ${e instanceof Error ? e.message : String(e)}`);
      continue; // 시도 시각을 찍지 않는다 — 일시 오류라 다음 실행이 다시 묻는다
    }

    const update = await settleJudgement(n, judged, rawText, { out, book, trusted, llmKo, koEntries, clubCache, lookup, nowMs });
    const { error } = await supabase.from("transfer_news").update(update).eq("id", n.id);
    if (error) {
      out.failed += 1;
      out.warnings.push(`#${n.id} 판정 저장 실패: ${error.message}`);
      continue;
    }
    out.updates.push({ id: n.id, ...update });
  }

  await flushNames(supabase, out, clubCache, koEntries, names);
  return out;
}


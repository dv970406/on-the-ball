/**
 * LLM 판정 — 규칙이 딜 후보로 묶은 보도 한 건에 **한 번의 호출**로 판정·추출·요약을 함께 얻는다.
 *
 *   move          이 보도가 <선수>의 구단 이동을 말하는가. **거부권** — 규칙이 만든 후보를 지울 수 있다.
 *   player        규칙이 선수를 못 뽑은 보도에서 이동 당사자 이름(원문 표기). 이 이름도 검증 관문(사전·위키데이터)을 지나야 딜이 된다.
 *   player_ko     선수의 한글 표기 — 위키데이터에 표기가 없을 때의 임시 표기(`transfer_name_ko`에 `source = 'llm'`으로 쌓인다).
 *   stage         보도가 말하는 단계 — 규칙이 그 선수의 단계를 못 읽은 문장에서만 파생이 쓴다.
 *   from / to / suitors  출발·행선지·그 밖의 관심 구단. 모델은 **원문에 적힌 구단명을 그대로** 옮기고, 코드가 원문 대조 →
 *                 구단 사전 정규화 → 사전 밖 이름은 **위키데이터로 축구 클럽인지 확인**한다(`resolveClubs`). 원문에 없는 구단은 받지 않는다.
 *   summary_ko    한국어 1~2문장 요약(이동일 때만). 원문 전문을 번역하지 않는다 — DB CHECK 160자.
 *
 * `transfer_news.verdict*`·`summary_ko`의 유일한 writer이고, `transfer_name_ko`의 LLM 음역 행도 여기서 쓴다.
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
import { personName } from "./extract.mjs";
import { NAME_TABLE, cacheLlmNames } from "./names-ko.mjs";
import { COLLECTOR_UA } from "./sources.mjs";
import { DEAD, RANK, isRoundupItem } from "./story.mjs";
import { lookupKo } from "./wikidata.mjs";
import { loadGlossary } from "./names-ko.mjs";

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
/** 요약 상한 — DB CHECK(`transfer_news_summary_ko_len`)와 같은 값. 지시문은 100자 안팎을 요구한다 */
export const SUMMARY_MAX_CHARS = 160;
/** 관심 구단 상한 — DB CHECK(`transfer_news_verdict_suitors_size`)와 같은 값 */
export const SUITORS_MAX = 10;
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
  required: ["move", "player", "player_ko", "stage", "from", "to", "suitors", "evidence", "summary_ko"],
  properties: {
    move: { type: "boolean" },
    player: nullable({ type: "string" }),
    player_ko: nullable({ type: "string" }),
    stage: nullable({ type: "string", enum: JUDGE_STAGES }),
    from: nullable({ type: "string" }),
    to: nullable({ type: "string" }),
    suitors: { type: "array", items: { type: "string" } },
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
  return clampCp(String(text).replace(/\s+/gu, " ").trim(), ARTICLE_MAX_CHARS);
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

/** 코드포인트 단위 자르기 — `.slice()`는 이모지를 반쪽으로 자른다 */
function clampCp(text, max) {
  const cps = [...text];
  return cps.length > max ? `${cps.slice(0, max).join("")}…` : text;
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
  const stored = clampCp(stripLinks(storedBody), BODY_MAX_CHARS);
  return article ? `${stored}\n\n[기사 본문]\n${stripLinks(article)}` : stored;
}

/** 지시문 — 모든 호출이 같은 문자열이다(용어 사전 포함). 행마다 달라지는 것은 사용자 메시지로 간다 */
export function buildSystem(terms = loadGlossary().terms) {
  const termLines = Object.entries(terms).map(([en, ko]) => `${en} → ${ko}`);
  return `너는 축구 이적 보도를 읽는 편집자다. <원문>이 <선수>의 구단 이동을 보도하는지 판정하고, 선수·단계·구단과 한국어 요약을 낸다.

[player] <선수>가 비어 있으면, 원문이 이동을 다루는 선수 **한 명**의 이름을 원문 표기 그대로 적는다(감독·코치·임원·에이전트는 선수가 아니다). <선수>가 있으면 그 이름을 그대로 옮긴다. 선수를 특정할 수 없으면 null이고 move는 false다.

[move] 구단 이동이다(true): 이적·임대·자유계약 이적, 영입 관심·루머·제안·협상·합의·개인 조건·메디컬·공식 발표, 진행 중인 이적의 무산·결렬, 그리고 **루머에 대한 부인**(구단이 팔 생각이 없다·선수가 떠날 생각이 없다·기자가 관심설을 부인 — 이적설에 대한 소식이므로 true, stage는 denied).
구단 이동이 아니다(false):
- 지금 소속 구단과의 재계약·계약 연장·첫 프로 계약
- 인터뷰·발언·의견·비교·칭찬(누구를 닮았다, 누구와 의견이 같다)
- 경기 결과·부상·징계·대표팀 소집
- 감독·코치·단장·임원의 선임·거취 — <선수>가 선수가 아니면 false
- <선수>는 곁다리이고 다른 사람의 이동을 다루는 글
- 이미 끝난 이적이나 지난 창의 관심·무산을 돌아보는 글(지금 진행 중인 움직임이 없다) — 지난 창의 영입을 정리·평가하는 기사(베스트 영입, 결산), 무산된 이적을 회상하는 선수 인터뷰
- 입단 테스트·전지훈련 합류(계약을 맺었다는 말이 없으면 이동이 아니다)
관용구에 속지 않는다: "in agreement with"(의견 동의), "not interested in", 낚시성 제목.

[stage] 보도가 말하는 이동 단계 하나. rumour(관심·주시·연결) · talks(협상·접촉·논의) · offer(제안·입찰 제출) · agreement(구단 간 합의) · personal_terms(개인 조건 합의) · medical(메디컬 진행) · here_we_go(확정, 공식 발표 전) · official(공식 발표·완료) · collapsed(진행 중이던 협상·제안·합의가 깨짐·제안 거절) · denied(관심·연결 루머를 구단·선수·기자가 부인, 매각 거부, 이적 생각 없음). move가 false면 null.

[from / to / suitors] 원문에 적힌 구단명을 글자 그대로 옮긴다(번역·줄임·정규화하지 않는다). from은 <선수>의 현재 소속 구단(자유계약이면 직전 소속), to는 가려는 구단 또는 간 구단이다. 관심 구단이 여럿이면 to는 **첫 번째로 언급된** 구단이고 나머지는 suitors에 적는다(최대 ${SUITORS_MAX}). 원문에 없으면 null·[].

[evidence] move 판단의 근거가 된 원문 구절 하나를 글자 그대로 옮긴다(25단어 이내). false이고 마땅한 구절이 없으면 "".

[player_ko] 선수의 한글 표기 — <표기>에 있으면 그것, 없으면 한국 축구 매체에서 통용되는 표기. 통용 표기를 모르면 null(음역을 지어내지 않는다).

[summary_ko] move가 true일 때만 한국어 1~2문장, 공백 포함 100자 안팎으로 요약한다. false면 null.
- 원문에 없는 사실을 더하지 않는다. 이적료·계약 기간 같은 숫자는 원문 값을 유지한다(€50m, 2027년 6월).
- 선수·구단 이름은 <표기>에 있으면 그 표기를, 선수는 player_ko와 같은 표기를 쓴다. 표기를 모르면 영문 그대로 둔다.
- 이적 용어는 아래 <용어> 표기를 쓴다.
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
  const ko = need.playerKey ? names.playerKo(need.playerKey) : null;
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
    max_tokens: 500,
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

/** 모델이 적은 이름(구단·선수)이 원문에 있으면 다듬어 돌려준다, 없으면 null */
export function mentionIn(mention, sentText) {
  if (typeof mention !== "string") return null;
  const raw = mention.trim().replace(/\s+/gu, " ");
  return raw && quotedIn(sentText, raw) ? raw : null;
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
 * 요약 검증 — 한글이 있고 상한 안이어야 저장한다.
 * @returns {{ text: string } | { reason: string }}
 */
export function judgeSummary(raw, corrections) {
  if (typeof raw !== "string") return { reason: "요약이 없다" };
  const text = applyCorrections(raw.replace(/\s+/g, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim(), corrections);
  if (!text) return { reason: "요약이 비었다" };
  if (!/[가-힣]/.test(text)) return { reason: "한글이 없다" };
  if ([...text].length > SUMMARY_MAX_CHARS) return { reason: `${[...text].length}자 — 상한 초과` };
  return { text };
}

/**
 * 모델 출력 → 판정. 순수 함수라 테스트가 API 없이 돈다. 구단·선수는 **원문에 있는 표기(mention)** 까지만 가른다 —
 * 정규화·위키데이터 확인은 `resolveClubs`(비동기)가 한다.
 * @param {string} raw 모델이 낸 글자(JSON)
 * @param {string} sentText 모델에 보낸 원문(`composeText`) — 근거·구단·선수 대조 대상
 * @param {{ corrections?: object, player?: string | null }} opts `player`는 규칙이 뽑아 물은 선수(있으면 모델의 player를 무시한다)
 * @returns {{ kind: "move", player: string, playerKo: string | null, stage: string | null, evidence: string, from: string | null, to: string | null,
 *   suitors: string[], summary: string | null, summaryIssue: string | null } | { kind: "not_move", evidence: string | null } | { kind: "invalid", reason: string }}
 */
export function parseJudgement(raw, sentText, { corrections, player = null } = {}) {
  let obj;
  try {
    obj = JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").match(/\{[\s\S]*\}/u)?.[0] ?? "");
  } catch {
    return { kind: "invalid", reason: "JSON 형식이 깨졌다" };
  }
  if (typeof obj?.move !== "boolean") return { kind: "invalid", reason: "move가 true/false가 아니다" };
  const evidence = typeof obj.evidence === "string" ? obj.evidence.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim() : "";
  const quoted = quotedIn(sentText, evidence);
  if (!obj.move) return { kind: "not_move", evidence: quoted ? clampCp(evidence, EVIDENCE_MAX_CHARS) : null };
  // "이동이다"는 원문에 실제로 있는 근거가 있어야 받는다 — 지어낸 근거로 딜을 열지 않는다
  if (!evidence) return { kind: "invalid", reason: "이동이라면서 근거가 없다" };
  if (!quoted) return { kind: "invalid", reason: "근거가 원문에 없다" };
  // 선수 — 규칙이 뽑아 물은 이름이 있으면 그대로, 없으면 모델이 읽은 이름(원문에 있고 사람 이름처럼 생겨야 한다 — "Argentine international"은 이름이 아니다)
  const found = player ?? personName(mentionIn(obj.player, sentText));
  if (!found) return { kind: "invalid", reason: "이동이라면서 선수를 특정하지 못했다" };
  let from = mentionIn(obj.from, sentText);
  let to = mentionIn(obj.to, sentText);
  if (from && to && normalizeQuote(from) === normalizeQuote(to)) from = to = null; // 같은 구단이 양쪽에 오면 어느 쪽도 믿지 않는다
  const suitors = [...new Set((Array.isArray(obj.suitors) ? obj.suitors : []).map((s) => mentionIn(s, sentText)).filter((s) => s && s !== from && s !== to))].slice(0, SUITORS_MAX);
  const s = judgeSummary(obj.summary_ko, corrections);
  return {
    kind: "move",
    player: found,
    playerKo: isKoName(obj.player_ko) ? obj.player_ko.trim() : null,
    stage: JUDGE_STAGES.includes(obj.stage) ? obj.stage : null,
    evidence: clampCp(evidence, EVIDENCE_MAX_CHARS),
    from,
    to,
    suitors,
    summary: s.text ?? null,
    summaryIssue: s.reason ?? null,
  };
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

// ── 실행 ──────────────────────────────────────────────────────────────

/**
 * 판정 단계 — 파생이 넘긴 대상(`judgeNeeds`)을 묻고 저장한다.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase service_role 클라이언트
 * @param {{ id: number, playerKey: string | null, player: string | null, body: string, clubs?: string[], source_id?: string, external_id?: string, url?: string, summary_ko?: string | null }[]} needs
 *   `playerKey`가 null이면 규칙이 선수를 못 뽑은 보도다 — 모델이 선수를 읽는다.
 * @param {{ apiKey?: string, names: ReturnType<import("./names-ko.mjs").createNameBook>, limit?: number, client?: object, fetchImpl?: typeof fetch, lookup?: typeof lookupKo, corrections?: object, nowMs?: number }} opts
 *   `client`·`fetchImpl`·`lookup`은 테스트용. `corrections`가 없으면 `glossary-ko.json`의 교정표를 쓴다. `log`(Console)를 주면 20건마다 진행을 찍는다.
 * @returns 저장한 값(`updates` — 파생이 메모리의 행에 곧바로 입혀 다시 파생한다)과 집계. `namesWritten`이 0보다 크면 이름 사전을 다시 읽는다
 */
export async function runJudgements(supabase, needs, { apiKey, names, limit = JUDGE_MAX_PER_RUN, client, fetchImpl = fetch, lookup = lookupKo, corrections, nowMs = Date.now(), log = null } = {}) {
  const api = client ?? new Anthropic({ apiKey });
  const system = buildSystem();
  const fixes = corrections ?? loadGlossary().corrections;
  const out = {
    read: needs.length, move: 0, notMove: 0, invalid: 0, summarized: 0, summaryInvalid: 0, failed: 0, extractedPlayers: 0,
    clubsVerified: 0, clubsRejected: 0, namesWritten: 0,
    articles: 0, articleMissing: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, warnings: [], updates: [],
  };
  if (needs.length > limit) out.warnings.push(`판정 상한(${limit}) — 남은 ${needs.length - limit}건은 다음 실행이 잇는다`);

  // 이 실행에서 모델이 처음 낸 음역 — 같은 선수의 다음 호출이 같은 표기를 보게 한다(사전은 실행 뒤에 다시 읽는다)
  const llmKo = new Map();
  const book = { ...names, playerKo: (k) => names.playerKo(k) ?? llmKo.get(k) ?? null };
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
    try {
      const res = await api.messages.create(buildJudgeRequest(n, book, system, article));
      out.inputTokens += res.usage?.input_tokens ?? 0;
      out.outputTokens += res.usage?.output_tokens ?? 0;
      out.cacheReadTokens += res.usage?.cache_read_input_tokens ?? 0;
      out.cacheWriteTokens += res.usage?.cache_creation_input_tokens ?? 0;
      judged = res.stop_reason === "refusal"
        ? { kind: "invalid", reason: "모델이 거절" }
        : parseJudgement(res.content.filter((b) => b.type === "text").map((b) => b.text).join(""), composeText(n.body, article), { corrections: fixes, player: n.player });
    } catch (e) {
      // 인증·권한 오류는 남은 행도 전부 같은 결과다 — 멈추고 호출부가 종료 코드를 올린다
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new Error(`판정 API 인증 실패(${e.status}) — ANTHROPIC_API_KEY를 확인하세요`);
      }
      if (e instanceof Anthropic.RateLimitError) {
        out.warnings.push("판정 API 한도 초과 — 남은 행은 다음 실행으로 넘긴다");
        break;
      }
      // 계정 사용 한도(400 "usage limits")도 남은 행이 전부 같은 결과다 — 곧바로 거부될 호출을 이어 보내지 않는다
      if (e instanceof Anthropic.APIError && e.status === 400 && /usage limit/iu.test(e.message)) {
        out.failed += 1;
        out.warnings.push(`판정 API 계정 사용 한도에 닿았다 — 남은 ${batch.length - i - 1}건은 다음 실행으로 넘긴다: ${e.message.slice(0, 160)}`);
        break;
      }
      out.failed += 1;
      out.warnings.push(`#${n.id} 판정 실패: ${e instanceof Anthropic.APIError ? e.status : ""} ${e instanceof Error ? e.message : String(e)}`);
      continue; // 시도 시각을 찍지 않는다 — 일시 오류라 다음 실행이 다시 묻는다
    }

    // 판정 불가도 시각을 찍는다 — 매시간 다시 부르지 않게(`JUDGE_RETRY_MS` 뒤 다시 묻는다)
    const update = {
      verdict: null, verdict_player: n.playerKey, verdict_player_name: null, verdict_evidence: null, verdict_from: null, verdict_to: null,
      verdict_suitors: [], verdict_stage: null, verdict_at: new Date().toISOString(),
    };
    const label = n.player ?? judged.player ?? "?";
    if (judged.kind === "move") {
      out.move += 1;
      const key = n.playerKey ?? normalizePlayerKey(judged.player);
      if (!n.playerKey) out.extractedPlayers += 1;
      const clubs = await resolveClubs(judged, book, { lookup, cacheRows: clubCache, nowMs });
      for (const [raw, ok] of [[judged.from, clubs.from], [judged.to, clubs.to]]) if (raw && !detectClubs(raw).length) out[ok ? "clubsVerified" : "clubsRejected"] += 1;
      Object.assign(update, {
        verdict: "move", verdict_player: key, verdict_player_name: judged.player, verdict_evidence: judged.evidence,
        verdict_from: clubs.from, verdict_to: clubs.to, verdict_suitors: clubs.suitors, verdict_stage: judged.stage,
      });
      if (judged.playerKo && !book.playerKo(key)) {
        llmKo.set(key, judged.playerKo);
        koEntries.push({ key, name: judged.player, ko: judged.playerKo });
      }
      if (judged.summary) {
        out.summarized += 1;
        update.summary_ko = judged.summary;
      } else {
        out.summaryInvalid += 1;
        out.warnings.push(`#${n.id} 요약 버림(${label}): ${judged.summaryIssue} — 다음 실행이 다시 묻는다`);
        // 옛 요약이 있으면 둔다(다시 물은 경우) — 영문으로 되돌릴 이유가 없다
        if (!n.summary_ko) update.summary_ko = null;
      }
    } else if (judged.kind === "not_move") {
      out.notMove += 1;
      Object.assign(update, { verdict: "not_move", verdict_evidence: judged.evidence, summary_ko: null });
    } else {
      out.invalid += 1;
      out.warnings.push(`#${n.id} 판정 불가(${label}): ${judged.reason} — ${JUDGE_RETRY_MS / 3_600_000}시간 뒤 다시 묻는다`);
    }
    const { error } = await supabase.from("transfer_news").update(update).eq("id", n.id);
    if (error) {
      out.failed += 1;
      out.warnings.push(`#${n.id} 판정 저장 실패: ${error.message}`);
      continue;
    }
    out.updates.push({ id: n.id, ...update });
  }

  // 새로 확인한 구단(위키데이터)과 모델의 음역을 이름 캐시에 쓴다 — 실패는 경고다(다음 실행이 다시 찾는다)
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
  return out;
}

/** 선수 키 — `derive-deals.mjs`의 `normalizePlayer`와 같은 계산(순환 import를 피해 따로 둔다) */
export function normalizePlayerKey(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

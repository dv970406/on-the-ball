/**
 * 이적 판정(LLM) — 규칙이 딜 후보로 묶은 보도가 **정말 그 선수의 구단 이동을 보도하는가**를 묻는다.
 * `transfer_news.verdict*`의 유일한 writer다.
 *
 * 규칙 추출은 단어 하나하나를 해석해서 문장 전체의 뜻을 놓친다 — "Alan Shearer in agreement with Thomas Tuchel"
 * (의견 동의)이 합의 딜이 됐고, "I'm not interested in politics"(인터뷰)가 루머 딜이 됐다(운영). 기사 전체를 읽는
 * 판정자를 두 번째 관문으로 두면 그 부류가 통째로 걸러진다.
 *
 * ⚠ **판정자는 거부권만 가진다.** 규칙이 만든 후보를 지울 수는 있어도 새로 만들 수는 없다 — 그래서 모델이 틀리면
 *   진짜 딜 하나가 숨겨질 뿐 없는 이적이 생기지 않는다(`summarize.mjs` 머리말의 "추출은 LLM에 맡기지 않는다"와
 *   같은 원칙 위에 있다). 추출·단계·이적료·방향은 여전히 규칙이 정한다.
 * ⚠ **근거를 원문에서 그대로 인용하게 하고 코드가 대조한다**(`parseVerdict`) — 원문에 없는 구절을 근거로 댄
 *   "이동이다" 판정은 받지 않는다(판정 불가로 두고 나중에 다시 묻는다).
 * ⚠ **판정할 수 없을 때 새 딜은 열지 않고, 이미 있는 딜은 둔다**(`deriveDeals`의 `requireVerdict`). 키가 없거나
 *   API가 멎어도 보드가 통째로 비지 않게 하면서, 확인되지 않은 새 딜은 올리지 않는다.
 * ⚠ **매체 RSS 보도는 기사 본문을 받아 함께 보낸다**(`fetchArticleText`). 저장된 글은 제목과 두 줄 발췌뿐이라 낚시성
 *   제목("Vinicius Jr to Arsenal truth emerges")만으로는 지난 관심의 회고인지 새 루머인지 가를 수 없었다 — 본문을
 *   주자 두 독립 채점자와 같은 판정이 나왔다(원문 대조 QA 4/4). **본문은 판정 요청에만 싣고 저장하지 않는다**(재배포 원칙 —
 *   `api-and-db.md`). 받지 못하면(403·시간 초과) 저장된 글만으로 판정한다. 텔레그램·블루스카이는 저장된 글이 곧 전문이고,
 *   구글 뉴스 링크는 리다이렉트라 받지 않는다.
 * ⚠ **요약(`summarize.mjs`)과 호출을 나눈다.** 요약 지시문·출력 형식을 건드리지 않기 위해서다 — 판정 대상은 딜
 *   후보 보도뿐이라(실행당 수 건) 호출이 하나 더 드는 비용이 작다.
 */
import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import { COLLECTOR_UA } from "./sources.mjs";
import { SUMMARY_MODEL, clampBody, stripLinks } from "./summarize.mjs";

/** 요약과 같은 모델 — 실측(보도 10건)에서 Haiku 4.5가 공식 이적 보도를 "무관"으로 버린 적이 있다 */
export const VERDICT_MODEL = SUMMARY_MODEL;
/** 한 번 실행의 상한 — 처음 켤 때 밀린 후보가 한 시간에 비용을 태우지 않게 한다. 남은 행은 다음 실행이 잇는다 */
export const VERDICT_MAX_PER_RUN = 60;
/** 판정 불가(형식 위반·근거 불일치)로 끝난 행을 다시 묻기까지의 간격 */
export const VERDICT_RETRY_MS = 24 * 3_600_000;
/** 근거 인용의 상한(글자) — DB CHECK(`transfer_news_verdict_evidence_len`)와 같은 값 */
export const VERDICT_EVIDENCE_MAX = 300;

/** 판정에 싣는 기사 본문의 상한(글자) — 핵심은 앞 문단에 있다. 넘으면 뒤를 자른다 */
export const ARTICLE_MAX_CHARS = 4_000;
const ARTICLE_TIMEOUT_MS = 10_000;

/** 기사 본문을 받을 보도인가 — 매체 RSS만(텔레그램·블루스카이는 저장된 글이 전문, 구글 뉴스는 리다이렉트) */
export const wantsArticle = (row) => typeof row.source_id === "string" && row.source_id.startsWith("rss:") && /^https?:\/\//u.test(row.url ?? "");

/**
 * 기사 HTML → 본문 글자. JSON-LD의 `articleBody`가 있으면 그것(가장 긴 것), 없으면 기사 영역의 문단들.
 * 순수 함수라 테스트가 네트워크 없이 돈다. 본문을 찾지 못하면 빈 문자열.
 */
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
  const text = bodies.sort((a, b) => b.length - a.length)[0] ??
    $("article p, main p, [itemprop=articleBody] p").map((_, p) => $(p).text().trim()).get().filter((t) => t.length > 40).join("\n");
  const flat = String(text).replace(/\s+/gu, " ").trim();
  const cps = [...flat];
  return cps.length > ARTICLE_MAX_CHARS ? `${cps.slice(0, ARTICLE_MAX_CHARS).join("")}…` : flat;
}

/** 기사 본문 받기 — 실패하면 빈 문자열(판정은 저장된 글만으로 한다). 던지지 않는다 */
export async function fetchArticleText(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": COLLECTOR_UA }, signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS), redirect: "follow" });
    if (!res.ok) return "";
    return extractArticleText(await res.text());
  } catch {
    return "";
  }
}

/** 판정에 보낼 글 — 저장된 글(링크를 걷고 자른 것) + 받은 기사 본문 */
export function composeVerdictText(storedBody, article) {
  const stored = clampBody(stripLinks(storedBody));
  return article ? `${stored}\n\n[기사 본문]\n${stripLinks(article)}` : stored;
}

/** 지시문 — 모든 호출이 같은 문자열이다(행마다 달라지는 것은 사용자 메시지로 간다) */
export function buildVerdictSystem() {
  return `너는 축구 이적 보도 판정자다. <원문>이 <선수>의 **구단 이동**을 보도하는지 판정한다.
구단 이동이다(true): 이적·임대·자유계약 이적, 영입 제안·협상·합의·메디컬·발표, 구단의 관심·루머, 이적 무산·결렬.
구단 이동이 아니다(false):
- 지금 소속 구단과의 재계약·계약 연장·첫 프로 계약
- 인터뷰·발언·의견·칭찬·비교(선수가 누구를 닮았다, 누구의 의견에 동의한다 등)
- 경기 결과·부상·징계·대표팀 소집
- 감독·코치·단장·임원의 선임·거취 — <선수>가 선수가 아니라 감독·임원이면 false
- <선수>가 곁다리로만 나오고 다른 사람의 이동을 다루는 기사
- 이미 끝난 이적·지난 창의 관심·무산을 돌아보거나 사후에 인정하는 기사(지금 진행 중인 움직임이 없다 — "was a target in the summer")
관용구에 속지 않는다: "in agreement with"(의견 동의), "not interested in"(관심 없음), 낚시성 제목("… agreement reached after verdict").
답은 JSON 한 줄만 쓴다: {"move": true 또는 false, "evidence": "판단의 근거가 된 원문 구절"}
evidence는 원문을 **글자 그대로** 옮긴 한 구절이다(번역·요약·수정하지 않는다, 40단어 이내). false이고 마땅한 구절이 없으면 빈 문자열.`;
}

/** 사용자 메시지 — 선수 + 원문. 시각·난수 같은 변동값을 싣지 않는다(같은 행이면 같은 요청) */
export function buildVerdictUserContent(player, body) {
  return `<선수>${player}</선수>\n<원문>\n${body}\n</원문>`;
}

/**
 * 판정 요청 — 순수 함수(테스트가 모양을 고정한다).
 * ⚠ **글자만 보낸다**(요약과 같은 원칙) — 이미지 블록도, 도구(웹 검색·웹 열기)도 없다. 기사 본문은 코드가 받아 글자로 싣는다.
 * @param {{ body: string }} row
 * @param {string} [article] 받은 기사 본문(없으면 저장된 글만)
 */
export function buildVerdictRequest(row, player, system = buildVerdictSystem(), article = "") {
  return {
    model: VERDICT_MODEL,
    max_tokens: 200,
    // 판정 한 줄이라 생각이 필요 없다 — Sonnet 5는 기본이 adaptive라 명시적으로 끈다
    thinking: { type: "disabled" },
    system,
    messages: [{ role: "user", content: buildVerdictUserContent(player, composeVerdictText(row.body, article)) }],
  };
}

/**
 * 인용 대조용 정규형 — 공백·따옴표·대소문자·말줄임·**이모지** 차이만 접는다(글자 자체는 바꾸지 않는다).
 * ⚠ 이모지를 빼는 이유: 모델이 두 문장을 이어 인용하면서 사이의 이모지("here we go! 💣🇦🇹 Former …")를 떨어뜨려,
 *   글자는 그대로인데 대조에 실패했다(운영 보도로 측정 — 같은 보도에서 3번 중 2번).
 */
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

/**
 * 모델 출력 → 판정. 순수 함수라 테스트가 API 없이 돈다.
 * @param {string} raw 모델이 낸 글자
 * @param {string} sentBody 모델에 보낸 원문(링크를 걷고 자른 것) — 근거 대조 대상
 * @returns {{ kind: "move" | "not_move", evidence: string | null } | { kind: "invalid", reason: string }}
 */
export function parseVerdict(raw, sentBody) {
  const text = String(raw).trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  const json = text.match(/\{[\s\S]*\}/u)?.[0];
  if (!json) return { kind: "invalid", reason: "JSON이 없다" };
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "JSON 형식이 깨졌다" };
  }
  if (typeof obj?.move !== "boolean") return { kind: "invalid", reason: "move가 true/false가 아니다" };
  const evidence = typeof obj.evidence === "string" ? obj.evidence.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim() : "";
  const quoted = evidence !== "" && normalizeQuote(sentBody).includes(normalizeQuote(evidence));
  if (obj.move) {
    // ⚠ "이동이다"는 원문에 실제로 있는 근거가 있어야 받는다 — 지어낸 근거로 딜을 열지 않는다
    if (!evidence) return { kind: "invalid", reason: "이동이라면서 근거가 없다" };
    if (!quoted) return { kind: "invalid", reason: "근거가 원문에 없다" };
    return { kind: "move", evidence: clampEvidence(evidence) };
  }
  // "이동이 아니다"는 근거가 없어도 받는다(거부만 하므로 틀려도 없는 딜이 생기지 않는다). 원문에 없는 근거는 버린다
  return { kind: "not_move", evidence: quoted ? clampEvidence(evidence) : null };
}

const clampEvidence = (s) => {
  const cps = [...s];
  return cps.length > VERDICT_EVIDENCE_MAX ? `${cps.slice(0, VERDICT_EVIDENCE_MAX - 1).join("")}…` : s;
};

/** 판정 한 건 — API 호출과 해석. 계통적 오류(인증·권한)는 던져서 실행 전체를 멈춘다 */
async function judgeOne(client, row, player, system, article) {
  const res = await client.messages.create(buildVerdictRequest(row, player, system, article));
  if (res.stop_reason === "refusal") return { verdict: { kind: "invalid", reason: "모델이 거절" }, usage: res.usage };
  const raw = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  // 근거는 **보낸 글**(저장된 글 + 기사 본문)과만 대조한다(선수 태그 같은 메시지 틀은 빼고)
  return { verdict: parseVerdict(raw, composeVerdictText(row.body, article)), usage: res.usage };
}

/**
 * 판정 단계 — 파생이 넘긴 대상(`verdictNeeds`)을 묻고 저장한다.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase service_role 클라이언트
 * @param {{ id: number, playerKey: string, player: string, body: string, source_id?: string, url?: string }[]} needs
 * @param {{ apiKey: string, limit?: number, client?: object, fetchImpl?: typeof fetch }} opts `client`·`fetchImpl`은 테스트용
 * @returns 저장한 판정(`updates` — 파생이 메모리의 행에 곧바로 입혀 다시 파생한다)과 집계
 */
export async function runVerdicts(supabase, needs, { apiKey, limit = VERDICT_MAX_PER_RUN, client, fetchImpl = fetch } = {}) {
  const api = client ?? new Anthropic({ apiKey });
  const system = buildVerdictSystem();
  const out = { read: needs.length, move: 0, notMove: 0, invalid: 0, failed: 0, articles: 0, articleMissing: 0, inputTokens: 0, outputTokens: 0, warnings: [], updates: [] };
  if (needs.length > limit) out.warnings.push(`판정 상한(${limit}) — 남은 ${needs.length - limit}건은 다음 실행이 잇는다`);

  for (const n of needs.slice(0, limit)) {
    let verdict;
    // 기사 본문 — 받지 못하면 저장된 글만으로 판정한다(실패가 아니다)
    let article = "";
    if (wantsArticle(n)) {
      article = await fetchArticleText(n.url, fetchImpl);
      out[article ? "articles" : "articleMissing"] += 1;
    }
    try {
      const r = await judgeOne(api, n, n.player, system, article);
      verdict = r.verdict;
      out.inputTokens += r.usage?.input_tokens ?? 0;
      out.outputTokens += r.usage?.output_tokens ?? 0;
    } catch (e) {
      // ⚠ 인증·권한 오류는 남은 행도 전부 같은 결과다 — 멈추고 호출부가 종료 코드를 올린다
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new Error(`판정 API 인증 실패(${e.status}) — ANTHROPIC_API_KEY를 확인하세요`);
      }
      if (e instanceof Anthropic.RateLimitError) {
        out.warnings.push("판정 API 한도 초과 — 남은 행은 다음 실행으로 넘긴다");
        break;
      }
      // ⚠ 계정 사용 한도(400 "usage limits")도 남은 행이 전부 같은 결과다 — 곧바로 거부될 호출을 이어 보내지 않는다.
      //   판정이 없으면 새 딜은 닫히고 있던 딜은 남는다(파생의 관문 규칙)
      if (e instanceof Anthropic.APIError && e.status === 400 && /usage limit/iu.test(e.message)) {
        out.failed += 1;
        out.warnings.push(`판정 API 계정 사용 한도에 닿았다 — 남은 ${needs.slice(0, limit).length - needs.slice(0, limit).indexOf(n) - 1}건은 다음 실행으로 넘긴다: ${e.message.slice(0, 160)}`);
        break;
      }
      out.failed += 1;
      out.warnings.push(`#${n.id} 판정 실패: ${e instanceof Anthropic.APIError ? e.status : ""} ${e instanceof Error ? e.message : String(e)}`);
      continue; // 시도 시각을 찍지 않는다 — 일시 오류라 다음 실행이 다시 묻는다
    }

    if (verdict.kind === "move") out.move += 1;
    else if (verdict.kind === "not_move") out.notMove += 1;
    else {
      out.invalid += 1;
      out.warnings.push(`#${n.id} 판정 불가(${n.player}): ${verdict.reason} — ${VERDICT_RETRY_MS / 3_600_000}시간 뒤 다시 묻는다`);
    }
    const update = {
      verdict: verdict.kind === "invalid" ? null : verdict.kind,
      verdict_player: n.playerKey,
      verdict_evidence: verdict.kind === "invalid" ? null : verdict.evidence,
      // 판정 불가도 시각을 찍는다 — 형식을 어기는 행을 매시간 다시 부르지 않게(`VERDICT_RETRY_MS` 뒤 다시 묻는다)
      verdict_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("transfer_news").update(update).eq("id", n.id);
    if (error) {
      out.failed += 1;
      out.warnings.push(`#${n.id} 판정 저장 실패: ${error.message}`);
      continue;
    }
    out.updates.push({ id: n.id, ...update });
  }
  return out;
}

/**
 * 이적 소식 한국어 요약 — `transfer_news.summary_ko`의 유일한 writer.
 *
 * 추출(선수·구단·단계·이적료)은 규칙이 하고, **화면에 보이는 문장만** LLM이 만든다. 추출을 LLM에
 * 맡기지 않는 이유는 딜 파생이 그 값 위에 서 있어서다 — 요약은 틀려도 그 한 줄만 틀리지만,
 * 추출이 틀리면 없는 이적이 보드에 생긴다.
 *
 * ⚠ **원문 전문을 번역하지 않는다 — 1~2문장 요약이다.** `body`를 공개하지 않는 재배포 원칙을
 *   번역문으로 우회하지 않기 위해서다(DB CHECK가 160자로 상한을 건다).
 * ⚠ **행마다 한 번만 부른다.** 매시 돌기 때문에 "요약이 없는 행"을 대상으로 잡으면 이적과 무관한
 *   보도를 매시간 다시 부른다 → 대상은 `summarized_at is null`이고, 요약이 없어도 시도 시각을 찍는다.
 * ⚠ **요약 실패는 수집 실패가 아니다.** 화면은 영문 발췌로 대신하므로 행 단위 실패는 경고로 남기고
 *   종료 코드를 올리지 않는다. 단 **키가 틀렸거나 없는 것(계통적)**은 올린다 — 조용히 두면 영영 영문이다.
 * ⚠ 이름 사전(구단·선수 한국어 표기 — `names-ko.mjs`, 화면과 같은 사전)은 **그 보도에 나온 것만** 싣는다.
 *   용어 사전(`glossary-ko.json`의 `terms`)은 호출마다 같으므로 지시문에 싣는다. 전체를 실으면 호출마다 입력이
 *   1,500토큰을 넘고(실측) 비용이 3~4배가 된다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { normalizePlayer } from "./derive-deals.mjs";
import { loadGlossary, loadNameBook } from "./names-ko.mjs";

/** 사용자가 고른 모델 — 실측(보도 10건)에서 Haiku 4.5가 공식 이적 보도를 "무관"으로 버려 올렸다 */
export const SUMMARY_MODEL = "claude-sonnet-5";
/** 화면 한도(두 줄). DB CHECK는 160 — 모델이 조금 넘겨도 DB 거부 대신 여기서 거른다 */
export const SUMMARY_MAX_CHARS = 120;
/**
 * LLM에 싣는 원문의 상한(글자). 보도 대부분은 짧다(실측 524건: 중앙 171자 · 상위 10% 341자) —
 * 이 값은 **최악을 자르는 안전장치**다(가장 긴 보도 2,837자는 원문만 700토큰 안팎).
 * ⚠ 앞을 자르지 않고 **뒤를** 자른다 — 기자 속보는 핵심(누가·어디로·단계)을 첫 문장에 쓴다.
 */
export const SUMMARY_BODY_MAX_CHARS = 1_200;
/** 이 기간보다 오래된 보도는 요약하지 않는다 — 수집기가 받는 창(14일)과 같다 */
export const SUMMARY_WINDOW_MS = 14 * 86_400_000;
/**
 * 한 번 실행의 상한 — 백필(처음 켤 때 수백 건)이나 버그가 **한 시간에** 비용을 태우지 않게 한다.
 * 남은 행은 다음 실행이 이어서 한다. 1건 약 1초라 워크플로 타임아웃(10분)에도 들어간다.
 */
export const SUMMARY_MAX_PER_RUN = 120;
/**
 * LLM에 보낼 보도인가 — **딜에 연결된 보도만** 보낸다.
 * 요약이 화면에 나오는 자리는 전부 딜에 딸린 보도다(상세 타임라인 · 최근 3일 소식 캐러셀 · 결렬 사유 ·
 * 상세 description). 딜에 묶이지 않은 보도는 요약해도 아무도 보지 않는다 — 부를 이유가 없다.
 * ⚠ 파생이 요약보다 **먼저** 돈다(같은 실행) — 새 보도가 딜에 붙은 그 실행에서 곧바로 요약된다.
 * ⚠ 걸러진 행에는 시도 시각을 찍지 않는다 — 나중에 딜에 붙으면(추출 규칙을 고쳐 `--reprocess`,
 *   또는 새 보도로 딜이 생김) 저절로 대상이 된다.
 */
export const isSummaryCandidate = (row) => row.deal_id != null;

/** 이적과 무관하다는 모델의 답 */
export const IRRELEVANT = "-";

/**
 * 지시문 — 용어 사전을 담는다. ⚠ **같은 실행 안에서는 모든 호출이 같은 문자열**이다(시각·행 정보를 넣지
 * 않는다). 보도마다 달라지는 것(이름 사전·원문)은 사용자 메시지로 간다.
 */
export function buildSystemPrompt(terms = loadGlossary().terms) {
  const termLines = Object.entries(terms).map(([en, ko]) => `${en} → ${ko}`);
  return `너는 축구 이적 소식 편집자다. 영어 보도 원문을 한국어 요약으로 옮긴다.
규칙:
- 한국어 1~2문장, 공백 포함 ${SUMMARY_MAX_CHARS - 40}자 안팎. 원문에 없는 사실을 더하지 않는다.
- 선수·구단은 <표기>에 있으면 그 표기를 쓴다. 없으면 원문의 영문 그대로 둔다(음역하지 않는다).
- 이적료·계약 기간 같은 숫자는 원문 값을 유지한다(€50m, 2027년 6월).
- 이적 용어는 아래 <용어> 표기를 쓴다. 표에 없는 용어는 한국 축구 기사 관례를 따른다.
- 이적(영입·방출·임대·재계약·협상·루머)과 무관한 내용이면 정확히 "${IRRELEVANT}" 한 글자만 출력한다.
- 요약문만 출력한다. 따옴표·머리말·설명을 붙이지 않는다.
<용어>
${termLines.join("\n") || "(없음)"}
</용어>`;
}

/**
 * 그 보도에 나온 구단·선수의 한국어 표기 — 표기가 없는 것은 싣지 않는다(모델이 영문 그대로 두게).
 * @param {{ clubs?: string[], players?: string[] }} row
 * @param {ReturnType<import("./names-ko.mjs").createNameBook>} names 화면과 같은 이름 사전
 */
export function buildGlossary(row, names) {
  const clubs = [];
  for (const en of row.clubs ?? []) {
    const ko = names.club(en)?.name;
    if (ko && ko !== en) clubs.push([en, ko]);
  }
  const people = [];
  for (const en of row.players ?? []) {
    const ko = names.playerKo(normalizePlayer(en));
    if (ko) people.push([en, ko]);
  }
  return { clubs, players: people };
}

/**
 * LLM에 싣기 전 링크 주소를 걷어낸다 — 요약에 쓰이지 않는 글자다(모델은 링크를 열 수 없고, 열 도구도 주지
 * 않는다). 원문(`body`)은 그대로 두고 **보내는 글자만** 줄인다.
 */
export function stripLinks(body) {
  return body
    .replace(/\bhttps?:\/\/\S+/giu, " ")
    .replace(/\b(?:pic\.twitter\.com|t\.co)\/\S+/giu, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/** 원문 상한 — 코드포인트 단위로 자른다(`.slice()`는 이모지를 반쪽으로 자른다) */
export function clampBody(body) {
  const cps = [...body];
  return cps.length > SUMMARY_BODY_MAX_CHARS ? `${cps.slice(0, SUMMARY_BODY_MAX_CHARS).join("")}…` : body;
}

/** 사용자 메시지 — 사전 + 원문. 시각·난수 같은 변동값을 싣지 않는다(같은 행이면 같은 요청) */
export function buildUserContent(body, glossary) {
  const lines = [...glossary.clubs, ...glossary.players].map(([en, ko]) => `${en} = ${ko}`);
  return `<표기>\n${lines.join("\n") || "(없음)"}\n</표기>\n<원문>\n${body}\n</원문>`;
}

/**
 * 요약문의 옛·틀린 표기를 바로잡는다("그루지야" → "조지아"). 용어 사전으로 알려 줘도 모델이 고집하는 표기라
 * **저장 직전에 기계적으로** 바꾼다 — 지시문에 싣지 않으므로 토큰이 들지 않는다.
 * ⚠ 긴 키부터 바꾼다 — "스포팅 디렉터"가 "스포팅"보다 먼저 걸려야 한다.
 */
export function applyCorrections(text, corrections = loadGlossary().corrections) {
  let out = text;
  for (const [wrong, right] of Object.entries(corrections).sort(([a], [b]) => b.length - a.length)) {
    out = out.split(wrong).join(right);
  }
  return out;
}

/**
 * 모델 출력 → 저장할 값. 순수 함수라 테스트가 API 없이 돈다.
 * ⚠ 요약 끝에 무관 표시(" -")를 덧붙이는 출력이 있다("…이적과 무관하다. -") — 요약도 무관 판정도 아닌
 *   모순된 답이라 버린다(영문 발췌가 대신 나간다).
 * @returns {{ kind: "summary", text: string } | { kind: "irrelevant" } | { kind: "invalid", reason: string }}
 */
export function judgeSummary(raw, { linkedToDeal, corrections }) {
  const text = applyCorrections(raw.replace(/\s+/g, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim(), corrections);
  if (text === IRRELEVANT) {
    // ⚠ 딜에 연결된 보도를 "무관"이라 하면 규칙 추출과 모순이다 — 요약을 버리고 영문 발췌에 맡긴다
    return linkedToDeal ? { kind: "invalid", reason: "딜에 연결된 보도를 무관으로 판정" } : { kind: "irrelevant" };
  }
  if (!/[가-힣]/.test(text)) return { kind: "invalid", reason: "한글이 없다" };
  if (/\s-$/u.test(text) || /이적과 무관/u.test(text)) return { kind: "invalid", reason: "요약에 무관 판정이 섞였다" };
  if ([...text].length > SUMMARY_MAX_CHARS) return { kind: "invalid", reason: `${[...text].length}자 — 상한 초과` };
  return { kind: "summary", text };
}

/**
 * 요약 요청 — 순수 함수(테스트가 모양을 고정한다).
 * ⚠ **글자만 보낸다.** 사용자 메시지는 문자열 하나이고 이미지 블록이 없다. 도구(`tools` — 웹 검색·웹 열기)도
 *   주지 않는다 — 모델이 원문 링크를 따라가 사진을 읽거나 번역하느라 토큰을 쓸 길이 없다.
 */
export function buildSummaryRequest(row, names, system) {
  return {
    model: SUMMARY_MODEL,
    max_tokens: 300,
    // 두 줄 요약이라 생각이 필요 없다 — Sonnet 5는 기본이 adaptive라 명시적으로 끈다
    thinking: { type: "disabled" },
    system,
    messages: [{ role: "user", content: buildUserContent(clampBody(stripLinks(row.body)), buildGlossary(row, names)) }],
  };
}

/** 요약 한 건 — API 호출과 판정. 계통적 오류(인증·권한)는 던져서 실행 전체를 멈춘다 */
async function summarizeOne(client, row, names, system) {
  const res = await client.messages.create(buildSummaryRequest(row, names, system));
  if (res.stop_reason === "refusal") return { verdict: { kind: "invalid", reason: "모델이 거절" }, usage: res.usage };
  const raw = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { verdict: judgeSummary(raw, { linkedToDeal: row.deal_id != null }), usage: res.usage };
}

/**
 * 요약 단계 — 시도하지 않은 최근 보도를 최신순으로 요약해 저장한다.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase service_role 클라이언트
 * @param {{ apiKey: string, nowMs?: number, dryRun?: boolean, limit?: number, resummarize?: boolean }} opts
 *   `resummarize` — 이미 요약한 행도 다시 요약한다(사전·용어를 고친 뒤 반영할 때). 상한·기간은 그대로다.
 */
export async function runSummaries(supabase, { apiKey, nowMs = Date.now(), dryRun = false, limit = SUMMARY_MAX_PER_RUN, resummarize = false }) {
  let query = supabase.from("transfer_news").select("id, body, clubs, players, deal_id");
  // 다시 요약할 때도 옛 요약은 새 요약이 저장되기 전까지 화면에 남는다(행마다 덮어쓴다)
  if (!resummarize) query = query.is("summarized_at", null);
  const { data: rows, error } = await query
    // ⚠ `isSummaryCandidate`와 같은 판정이다 — 조건을 바꾸면 둘을 함께 바꾼다
    .not("deal_id", "is", null)
    .gte("published_at", new Date(nowMs - SUMMARY_WINDOW_MS).toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`요약 대상 조회 실패: ${error.message}`);

  const client = new Anthropic({ apiKey });
  const names = await loadNameBook(supabase);
  const system = buildSystemPrompt();
  const out = { read: rows.length, summarized: 0, irrelevant: 0, invalid: 0, failed: 0, inputTokens: 0, outputTokens: 0, warnings: [], preview: [] };

  for (const row of rows) {
    let verdict;
    try {
      const r = await summarizeOne(client, row, names, system);
      verdict = r.verdict;
      out.inputTokens += r.usage.input_tokens;
      out.outputTokens += r.usage.output_tokens;
    } catch (e) {
      // ⚠ 인증·권한 오류는 남은 행도 전부 같은 결과다 — 멈추고 호출부가 종료 코드를 올린다
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new Error(`요약 API 인증 실패(${e.status}) — ANTHROPIC_API_KEY를 확인하세요`);
      }
      // 한도 초과는 이번 실행을 접는다 — 다음 시간에 같은 행부터 이어진다(시도 시각을 안 찍었으므로)
      if (e instanceof Anthropic.RateLimitError) {
        out.warnings.push("요약 API 한도 초과 — 남은 행은 다음 실행으로 넘긴다");
        break;
      }
      out.failed += 1;
      out.warnings.push(`#${row.id} 요약 실패: ${e instanceof Anthropic.APIError ? e.status : ""} ${e.message}`);
      continue; // 시도 시각을 찍지 않는다 — 일시 오류라 다음 실행이 다시 시도한다
    }

    out[verdict.kind === "summary" ? "summarized" : verdict.kind] += 1;
    if (verdict.kind === "invalid") out.warnings.push(`#${row.id} 요약 버림: ${verdict.reason}`);
    if (dryRun) {
      out.preview.push({ id: row.id, verdict });
      continue;
    }
    // 다시 요약하다 버린 것은 쓰지 않는다 — 옛 요약(있다면)을 버리고 영문으로 되돌릴 이유가 없다
    if (resummarize && verdict.kind === "invalid") continue;
    const { error: upErr } = await supabase
      .from("transfer_news")
      .update({
        summary_ko: verdict.kind === "summary" ? verdict.text : null,
        // 요약이 없어도(무관 · 버림) 찍는다 — 같은 행을 매시간 다시 부르지 않게
        summarized_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upErr) {
      out.failed += 1;
      out.warnings.push(`#${row.id} 저장 실패: ${upErr.message}`);
    }
  }
  return out;
}

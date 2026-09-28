/**
 * 이동 판정(LLM) 단계의 회귀 테스트 — API를 부르지 않는다(모델 출력은 비결정적이라 **해석·조립·저장 흐름만** 검사한다).
 *
 *   node scripts/test-transfer-verdict.mjs
 */
import {
  ARTICLE_MAX_CHARS,
  VERDICT_EVIDENCE_MAX,
  extractArticleText,
  fetchArticleText,
  wantsArticle,
  VERDICT_MODEL,
  buildVerdictRequest,
  buildVerdictSystem,
  normalizeQuote,
  parseVerdict,
  runVerdicts,
} from "./lib/transfer/verdict.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 해석 ────────────────────────────────────────────────────────────────
const BODY = "Udinese have reached a verbal agreement with David Alaba! Austrian star, a dream signing for the Italian club.";
check("이동 + 원문에 있는 근거 → move", eq(parseVerdict('{"move": true, "evidence": "reached a verbal agreement with David Alaba"}', BODY), { kind: "move", evidence: "reached a verbal agreement with David Alaba" }));
check("코드 블록으로 감싸도 읽는다", parseVerdict('```json\n{"move": true, "evidence": "a dream signing for the Italian club"}\n```', BODY).kind === "move");
check("근거의 공백·따옴표·대소문자 차이는 접는다", parseVerdict('{"move": true, "evidence": "Udinese have  reached a VERBAL agreement"}', BODY).kind === "move");
check("⚠ 이동이라면서 원문에 없는 근거 → 판정 불가(지어낸 근거로 딜을 열지 않는다)",
  eq(parseVerdict('{"move": true, "evidence": "Alaba completes his medical at Udinese"}', BODY), { kind: "invalid", reason: "근거가 원문에 없다" }));
check("⚠ 이동이라면서 근거가 비었다 → 판정 불가", parseVerdict('{"move": true, "evidence": ""}', BODY).kind === "invalid");
check("이동 아님은 근거가 없어도 받는다", eq(parseVerdict('{"move": false, "evidence": ""}', BODY), { kind: "not_move", evidence: null }));
check("이동 아님의 근거가 원문에 없으면 근거만 버린다", eq(parseVerdict('{"move": false, "evidence": "지어낸 말"}', BODY), { kind: "not_move", evidence: null }));
check("이동 아님 + 원문 근거는 남긴다", eq(parseVerdict('{"move": false, "evidence": "Austrian star"}', BODY), { kind: "not_move", evidence: "Austrian star" }));
check("JSON이 없으면 판정 불가", parseVerdict("이 기사는 이적 보도입니다.", BODY).kind === "invalid");
check("깨진 JSON은 판정 불가", parseVerdict('{"move": true, "evidence": ', BODY).kind === "invalid");
check('move가 불리언이 아니면 판정 불가("yes")', parseVerdict('{"move": "yes", "evidence": "Austrian star"}', BODY).kind === "invalid");
{
  const long = "a ".repeat(400).trim();
  const r = parseVerdict(JSON.stringify({ move: false, evidence: long }), long);
  check(`근거는 ${VERDICT_EVIDENCE_MAX}자로 자른다(DB CHECK와 같은 값)`, r.kind === "not_move" && [...r.evidence].length === VERDICT_EVIDENCE_MAX);
}
{
  // 운영 보도 — 모델이 두 문장을 이으며 사이 이모지를 떨어뜨렸다(글자는 그대로)
  const src = "🚨⚪️⚫️ David Alaba to Udinese, exclusive story confirmed and here we go! 💣🇦🇹\n\nFormer Real Madrid and FC Bayern centre back signs a one year deal until June 2027 with the Italian club.";
  check("근거 — 사이의 이모지를 떨어뜨린 인용도 받는다", parseVerdict(JSON.stringify({ move: true, evidence: "David Alaba to Udinese, exclusive story confirmed and here we go! Former Real Madrid and FC Bayern centre back signs a one year deal until June 2027" }), src).kind === "move");
  check("근거 — 이모지를 접어도 글자가 다르면 받지 않는다", parseVerdict(JSON.stringify({ move: true, evidence: "David Alaba to Juventus, here we go!" }), src).kind === "invalid");
}
check("normalizeQuote — 굽은 따옴표·말줄임을 접는다", normalizeQuote("It’s “done”…") === normalizeQuote("it's \"done\"..."));

// 운영 사고 원문 — 판정자가 받을 원문이 그대로 보인다(판정은 모델이 한다 — 여기서는 조립만 본다)
{
  const tuchel = { id: 1, body: "Alan Shearer in agreement with Thomas Tuchel after brutal Cole Palmer blast https://t.co/abc" };
  const req = buildVerdictRequest(tuchel, "Thomas Tuchel");
  check("요청 — 요약과 같은 모델", req.model === VERDICT_MODEL);
  check("요청 — 생각을 끈다(한 줄 판정)", eq(req.thinking, { type: "disabled" }));
  check("요청 — 도구가 없다(웹 검색·열기 금지)", !("tools" in req));
  check("요청 — 사용자 메시지는 글자 하나(이미지 블록 없음)", req.messages.length === 1 && typeof req.messages[0].content === "string");
  check("요청 — 원문의 링크 주소를 걷는다", !req.messages[0].content.includes("t.co"));
  check("요청 — 선수 이름을 싣는다", req.messages[0].content.includes("<선수>Thomas Tuchel</선수>"));
  const sys = buildVerdictSystem();
  check("지시문 — 재계약·인터뷰·감독 인사는 이동이 아니라고 적는다", ["재계약", "인터뷰", "감독"].every((w) => sys.includes(w)));
  check('지시문 — 관용구 "in agreement with"을 경고한다', sys.includes("in agreement with"));
  check("지시문 — 지난 이적·관심을 돌아보는 기사는 이동이 아니라고 적는다(원문 대조 QA — 비니시우스)", sys.includes("사후에 인정"));
  check("지시문 — 같은 실행 안에서 모든 호출이 같은 문자열이다", sys === buildVerdictSystem());
}

// ── 저장 흐름(가짜 API·가짜 DB) ─────────────────────────────────────────
function fakeDb() {
  const writes = [];
  return {
    writes,
    from: () => ({ update: (v) => ({ eq: async (_c, id) => { writes.push({ id, ...v }); return { error: null }; } }) }),
  };
}
const fakeClient = (answers) => ({
  messages: {
    create: async (req) => {
      const body = req.messages[0].content;
      const a = answers.find(([needle]) => body.includes(needle));
      if (a?.[1] instanceof Error) throw a[1];
      return { stop_reason: "end_turn", content: [{ type: "text", text: a ? a[1] : "{}" }], usage: { input_tokens: 10, output_tokens: 5 } };
    },
  },
});
{
  const db = fakeDb();
  const needs = [
    { id: 1, playerKey: "david alaba", player: "David Alaba", body: BODY },
    { id: 2, playerKey: "thomas tuchel", player: "Thomas Tuchel", body: "Alan Shearer in agreement with Thomas Tuchel after brutal Cole Palmer blast" },
    { id: 3, playerKey: "joao pedro", player: "Joao Pedro", body: "Joao Pedro agreement reached after bold Xabi Alonso verdict" },
    { id: 4, playerKey: "rayan cherki", player: "Rayan Cherki", body: "Rayan Cherki on dreaming to win the Ballon d'Or" },
  ];
  const r = await runVerdicts(db, needs, {
    client: fakeClient([
      ["David Alaba", '{"move": true, "evidence": "reached a verbal agreement with David Alaba"}'],
      ["Thomas Tuchel", '{"move": false, "evidence": "Alan Shearer in agreement with Thomas Tuchel"}'],
      ["Joao Pedro", '{"move": true, "evidence": "Joao Pedro completes move to Arsenal"}'],
      ["Rayan Cherki", new Error("일시 오류")],
    ]),
  });
  check("집계 — 이동 1 · 아님 1 · 판정 불가 1 · 실패 1", eq([r.move, r.notMove, r.invalid, r.failed], [1, 1, 1, 1]));
  check("저장 — 이동·아님·판정 불가는 쓰고, 일시 실패는 쓰지 않는다(다음 실행이 다시 묻는다)", eq(db.writes.map((w) => w.id), [1, 2, 3]));
  check("저장 — 판정 불가는 값 없이 선수·시각만", db.writes[2].verdict === null && db.writes[2].verdict_player === "joao pedro" && db.writes[2].verdict_at && db.writes[2].verdict_evidence === null);
  check("저장 — 아님은 선수 키와 근거를 남긴다", db.writes[1].verdict === "not_move" && db.writes[1].verdict_player === "thomas tuchel" && db.writes[1].verdict_evidence === "Alan Shearer in agreement with Thomas Tuchel");
  check("updates — 파생이 메모리에 입힐 판정을 돌려준다", eq(r.updates.map((u) => [u.id, u.verdict]), [[1, "move"], [2, "not_move"], [3, null]]));
}
{
  const db = fakeDb();
  const needs = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, playerKey: "david alaba", player: "David Alaba", body: BODY }));
  const r = await runVerdicts(db, needs, { limit: 2, client: fakeClient([["David Alaba", '{"move": true, "evidence": "Austrian star"}']]) });
  check("상한 — 실행당 상한까지만 묻고 경고한다", db.writes.length === 2 && r.warnings.some((w) => w.includes("상한")));
}

// ── 기사 본문 — 저장된 제목·발췌만으로는 회고 기사와 새 루머를 가를 수 없었다(원문 대조 QA) ──
{
  const ld = `<html><head><script type="application/ld+json">{"@type":"NewsArticle","articleBody":"Arsenal's assistant admits the Brazilian was a target in the summer. He has since signed a new deal at Real Madrid."}</script></head><body><p>짧다</p></body></html>`;
  check("본문 — JSON-LD의 articleBody를 읽는다", extractArticleText(ld).startsWith("Arsenal's assistant admits"));
  const graph = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"NewsArticle","articleBody":"Nested body text here."}]}</script>`;
  check("본문 — @graph 안의 articleBody도 찾는다", extractArticleText(graph) === "Nested body text here.");
  const paras = `<article><p>${"Chelsea are preparing a bid for the striker ahead of January. ".repeat(2)}</p><p>short</p></article>`;
  check("본문 — JSON-LD가 없으면 기사 문단을 읽는다(짧은 문단은 뺀다)", extractArticleText(paras).startsWith("Chelsea are preparing") && !extractArticleText(paras).includes("short"));
  check("본문 — 깨진 JSON-LD는 건너뛴다", extractArticleText(`<script type="application/ld+json">{깨짐</script><main><p>${"x".repeat(50)}</p></main>`) === "x".repeat(50));
  check(`본문 — ${ARTICLE_MAX_CHARS}자에서 자른다`, [...extractArticleText(`<script type="application/ld+json">{"articleBody":"${"a".repeat(ARTICLE_MAX_CHARS + 500)}"}</script>`)].length === ARTICLE_MAX_CHARS + 1);
  check("받기 — HTTP 실패는 빈 문자열(판정은 저장된 글로)", (await fetchArticleText("https://x.test/a", async () => ({ ok: false, status: 403, text: async () => "" }))) === "");
  check("받기 — 네트워크 오류도 던지지 않는다", (await fetchArticleText("https://x.test/a", async () => { throw new Error("timeout"); })) === "");
  check("대상 — 매체 RSS만 받는다", wantsArticle({ source_id: "rss:fl-arsenal", url: "https://www.football.london/a" }) && !wantsArticle({ source_id: "tg:romano", url: "https://t.me/x" }) && !wantsArticle({ source_id: "gnews:romano", url: "https://news.google.com/x" }) && !wantsArticle({ source_id: "rss:bbc", url: null }));
}
{
  const db = fakeDb();
  const fetched = [];
  const fakeFetch = async (url) => {
    fetched.push(url);
    if (url.includes("blocked")) return { ok: false, status: 403, text: async () => "" };
    return { ok: true, status: 200, text: async () => `<script type="application/ld+json">{"articleBody":"Arsenal's assistant admits the Brazilian was a target in the summer."}</script>` };
  };
  const sent = [];
  const client = { messages: { create: async (req) => { sent.push(req.messages[0].content); return { stop_reason: "end_turn", content: [{ type: "text", text: '{"move": false, "evidence": "admits the Brazilian was a target in the summer"}' }], usage: { input_tokens: 1, output_tokens: 1 } }; } } };
  const r = await runVerdicts(db, [
    { id: 1, playerKey: "vinicius jr", player: "Vinicius Jr", body: "Vinicius Jr to Arsenal truth emerges", source_id: "rss:fl-arsenal", url: "https://www.football.london/a" },
    { id: 2, playerKey: "vinicius jr", player: "Vinicius Jr", body: "Vinicius Jr to Arsenal truth emerges", source_id: "rss:fl-arsenal", url: "https://blocked.test/b" },
    { id: 3, playerKey: "david alaba", player: "David Alaba", body: "admits the Brazilian was a target in the summer", source_id: "tg:romano", url: "https://t.me/x" },
  ], { client, fetchImpl: fakeFetch });
  check("흐름 — 받은 본문을 요청에 싣는다", sent[0].includes("[기사 본문]") && sent[0].includes("was a target in the summer"));
  check("흐름 — 본문에서 인용한 근거를 받는다", db.writes[0].verdict === "not_move" && db.writes[0].verdict_evidence === "admits the Brazilian was a target in the summer");
  check("흐름 — 못 받으면 저장된 글만으로 판정한다(근거가 없으면 근거만 비운다)", !sent[1].includes("[기사 본문]") && db.writes[1].verdict === "not_move" && db.writes[1].verdict_evidence === null);
  check("흐름 — 텔레그램은 받지 않는다", fetched.length === 2 && !fetched.some((u) => u.includes("t.me")));
  check("흐름 — 받은/못 받은 수를 센다", r.articles === 1 && r.articleMissing === 1);
  check("저장 — 기사 본문은 DB에 쓰지 않는다(판정·선수·근거·시각만)", db.writes.every((w) => eq(Object.keys(w).sort(), ["id", "verdict", "verdict_at", "verdict_evidence", "verdict_player"])));
}

{
  // 계정 사용 한도 — 첫 거부에서 멈춘다(남은 호출이 전부 곧바로 거부된다)
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  let calls = 0;
  const client = { messages: { create: async () => { calls += 1; throw new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "You have reached your specified API usage limits." } }, "You have reached your specified API usage limits.", new Headers()); } } };
  const db = fakeDb();
  const r = await runVerdicts(db, [1, 2, 3].map((id) => ({ id, playerKey: "david alaba", player: "David Alaba", body: BODY })), { client });
  check("사용 한도 — 첫 거부에서 멈추고 나머지를 부르지 않는다", calls === 1 && db.writes.length === 0 && r.warnings.some((w) => w.includes("사용 한도")));
}

console.log(`\n이동 판정 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);

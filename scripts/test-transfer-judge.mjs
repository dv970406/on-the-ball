/**
 * LLM 판정 단계(`scripts/lib/transfer/judge.mjs`) 회귀 테스트 — API를 부르지 않는다
 * (모델 출력은 비결정적이라 **해석·조립·저장 흐름만** 검사한다).
 *
 *   node scripts/test-transfer-judge.mjs
 */
import { createNameBook } from "./lib/transfer/names-ko.mjs";
import { isEnumeratedWith, normalizeDestination,
  ARTICLE_MAX_CHARS,
  BODY_MAX_CHARS,
  EVIDENCE_MAX_CHARS,
  JUDGE_MODEL,
  JUDGE_SCHEMA,
  JUDGE_STAGES,
  SUMMARY_MAX_CHARS,
  applyCorrections,
  buildGlossary,
  buildJudgeRequest,
  buildSystem,
  composeText,
  extractArticleText,
  fetchArticleText,
  isKoName,
  judgeSummary,
  mentionIn,
  normalizeQuote,
  parseJudgement,
  resolveClubs,
  runJudgements,
  stripLinks,
  wantsArticle,
} from "./lib/transfer/judge.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const NO_FIX = { corrections: {} };
const J = (o) => JSON.stringify({ player: null, player_ko: null, stage: null, from: null, to: null, suitors: [], summary_ko: null, ...o });
const ALABA = { ...NO_FIX, player: "David Alaba" };

// ── 행선지 정규화 — 지시문을 모델이 양방향으로 어긴다(감사) ──────────────────
{
  const T1 = "Tottenham, Newcastle and Chelsea are interested in Giorgio Scalvini.";
  check("행선지 — to가 관심 구단들과 같은 나열이면 suitors 맨 앞으로 내린다", eq(normalizeDestination({ to: "Tottenham", suitors: ["Newcastle", "Chelsea"] }, T1), { to: null, suitors: ["Tottenham", "Newcastle", "Chelsea"] }));
  check("행선지 — 'as well as' 나열도 같다", eq(normalizeDestination({ to: "Arsenal", suitors: ["Real Madrid"] }, "Arsenal, as well as Real Madrid, have made contact with Haaland's representatives."), { to: null, suitors: ["Arsenal", "Real Madrid"] }));
  check("행선지 — 나열 밖의 주된 구단은 그대로 둔다(competition from …)", eq(normalizeDestination({ to: "Chelsea", suitors: ["Manchester United", "Liverpool"] }, "Chelsea are monitoring Tyrick Mitchell but may face competition from Manchester United and Liverpool."), { to: "Chelsea", suitors: ["Manchester United", "Liverpool"] }));
  check("행선지 — to가 없고 관심 구단이 하나뿐이면 그 구단이 행선지다", eq(normalizeDestination({ to: null, suitors: ["Liverpool"] }, "Liverpool have some interest in Lamine Camara."), { to: "Liverpool", suitors: [] }));
  check("행선지 — to도 없고 관심 구단이 여럿이면 그대로", eq(normalizeDestination({ to: null, suitors: ["Real Madrid", "Barcelona"] }, "Real Madrid and Barcelona are ready to pounce."), { to: null, suitors: ["Real Madrid", "Barcelona"] }));
  check("행선지 — 공백만으로 이어진 이름은 나열이 아니다", !isEnumeratedWith("Chelsea Liverpool", "Chelsea", ["Liverpool"]));
}

// ── 해석 ────────────────────────────────────────────────────────────────
const BODY = "Udinese have reached a verbal agreement with David Alaba! Austrian star leaves Real Madrid as a free agent.";
{
  const r = parseJudgement(J({ move: true, player: "David Alaba", player_ko: "다비드 알라바", stage: "agreement", from: "Real Madrid", to: "Udinese", evidence: "reached a verbal agreement with David Alaba", summary_ko: "다비드 알라바가 우디네세와 구두 합의했다." }), BODY, ALABA);
  check("이동 + 근거 + 선수·단계·구단·요약 → move", eq(r, { kind: "move", player: "David Alaba", playerKo: "다비드 알라바", stage: "agreement", evidence: "reached a verbal agreement with David Alaba", from: "Real Madrid", to: "Udinese", suitors: [], summary: "다비드 알라바가 우디네세와 구두 합의했다.", summaryIssue: null }), JSON.stringify(r));
}
check("코드 블록으로 감싸도 읽는다", parseJudgement('```json\n' + J({ move: true, evidence: "Austrian star", summary_ko: "요약." }) + "\n```", BODY, ALABA).kind === "move");
check("근거의 공백·따옴표·대소문자 차이는 접는다", parseJudgement(J({ move: true, evidence: "Udinese have  reached a VERBAL agreement", summary_ko: "요약." }), BODY, ALABA).kind === "move");
check("⚠ 이동이라면서 원문에 없는 근거 → 판정 불가(지어낸 근거로 딜을 열지 않는다)",
  eq(parseJudgement(J({ move: true, evidence: "Alaba completes his medical at Udinese", summary_ko: "요약." }), BODY, ALABA), { kind: "invalid", reason: "근거가 원문에 없다" }));
check("⚠ 이동이라면서 근거가 비었다 → 판정 불가", parseJudgement(J({ move: true, evidence: "", summary_ko: "요약." }), BODY, ALABA).kind === "invalid");
check("이동 아님은 근거가 없어도 받는다", eq(parseJudgement(J({ move: false, evidence: "" }), BODY, ALABA), { kind: "not_move", evidence: null }));
check("이동 아님의 근거가 원문에 없으면 근거만 버린다", eq(parseJudgement(J({ move: false, evidence: "지어낸 말" }), BODY, ALABA), { kind: "not_move", evidence: null }));
check("JSON이 없으면 판정 불가", parseJudgement("이 기사는 이적 보도입니다.", BODY, ALABA).kind === "invalid");
check("깨진 JSON은 판정 불가", parseJudgement('{"move": true, "evidence": ', BODY, ALABA).kind === "invalid");
check('move가 불리언이 아니면 판정 불가("yes")', parseJudgement(JSON.stringify({ move: "yes", evidence: "Austrian star" }), BODY, ALABA).kind === "invalid");
{
  const long = "a ".repeat(400).trim();
  const r = parseJudgement(J({ move: false, evidence: long }), long, NO_FIX);
  // ⚠ 정확히 상한이다 — 전에는 `…`를 붙여 301코드포인트가 됐고 CHECK(`between 1 and 300`)가 그 행의 판정 저장을 거부했다
  check(`근거는 ${EVIDENCE_MAX_CHARS}자로 자른다(DB CHECK와 같은 값)`, r.kind === "not_move" && [...r.evidence].length === EVIDENCE_MAX_CHARS && !r.evidence.endsWith("…"));
}
{
  // 모델이 두 문장을 이으며 사이 이모지를 떨어뜨렸다(글자는 그대로)
  const src = "🚨⚪️⚫️ David Alaba to Udinese, exclusive story confirmed and here we go! 💣🇦🇹\n\nFormer Real Madrid and FC Bayern centre back signs a one year deal until June 2027 with the Italian club.";
  check("근거 — 사이의 이모지를 떨어뜨린 인용도 받는다", parseJudgement(J({ move: true, to: "Udinese", evidence: "David Alaba to Udinese, exclusive story confirmed and here we go! Former Real Madrid and FC Bayern centre back signs a one year deal until June 2027", summary_ko: "요약." }), src, ALABA).kind === "move");
  check("근거 — 이모지를 접어도 글자가 다르면 받지 않는다", parseJudgement(J({ move: true, evidence: "David Alaba to Juventus, here we go!", summary_ko: "요약." }), src, ALABA).kind === "invalid");
}
check("normalizeQuote — 굽은 따옴표·말줄임을 접는다", normalizeQuote("It’s “done”…") === normalizeQuote("it's \"done\"..."));

// ── 선수 — 규칙이 못 뽑은 보도는 모델이 읽되 원문에 있는 이름만 ──────────────
const MANZAMBI = "Johan Manzambi addresses rumours after €70m Aston Villa transfer. He has spoken about his move from Freiburg to Aston Villa.";
{
  const r = parseJudgement(J({ move: true, player: "Johan Manzambi", from: "Freiburg", to: "Aston Villa", stage: "official", evidence: "his move from Freiburg to Aston Villa", summary_ko: "요약." }), MANZAMBI, NO_FIX);
  check("선수 — <선수>가 비면 모델이 읽은 이름을 받는다(원문에 있다)", r.kind === "move" && r.player === "Johan Manzambi" && r.from === "Freiburg" && r.to === "Aston Villa" && r.stage === "official");
  check("선수 — 규칙이 뽑아 물은 이름이 있으면 모델의 이름을 무시한다", parseJudgement(J({ move: true, player: "Someone Else", evidence: "his move from Freiburg", summary_ko: "요약." }), MANZAMBI, { ...NO_FIX, player: "Johan Manzambi" }).player === "Johan Manzambi");
  const unnamed = (r) => r.kind === "not_move" && r.unnamed === true;
  check("⚠ 선수 — 원문에 없는 이름은 받지 않는다 → 이동 아님(선수 미특정, 다시 묻지 않는다)", unnamed(parseJudgement(J({ move: true, player: "Erling Haaland", evidence: "his move from Freiburg", summary_ko: "요약." }), MANZAMBI, NO_FIX)));
  check("⚠ 선수 — 이동이라면서 선수가 null이면 이동 아님(선수 미특정)", unnamed(parseJudgement(J({ move: true, player: null, evidence: "his move from Freiburg", summary_ko: "요약." }), MANZAMBI, NO_FIX)));
  const ARG = "Fabrizio Romano denies rumours of Barcelona being interested in Argentine international. Left-Back Target named.";
  check("⚠ 선수 — 국적·역할어 덩어리는 이름이 아니다(Argentine international · Left-Back Target) → 이동 아님(선수 미특정)", unnamed(parseJudgement(J({ move: true, player: "Argentine international", evidence: "denies rumours", summary_ko: "요약." }), ARG, NO_FIX)) && unnamed(parseJudgement(J({ move: true, player: "Left-Back Target", evidence: "denies rumours", summary_ko: "요약." }), ARG, NO_FIX)));
  check("선수 — 수식어가 붙은 이름은 다듬어 받는다(Brazilian wonderkid Endrick → Endrick, 사전에 있는 한 토큰)", parseJudgement(J({ move: true, player: "Brazilian wonderkid Endrick", evidence: "Real Madrid star", summary_ko: "요약." }), "Real Madrid star Brazilian wonderkid Endrick is wanted by Milan.", NO_FIX).player === "Endrick");
}
check("단계 — 목록 밖 값은 null", parseJudgement(J({ move: true, stage: "done", evidence: "Austrian star", summary_ko: "요약." }), BODY, ALABA).stage === null && JUDGE_STAGES.includes("here_we_go") && !JUDGE_STAGES.includes("unknown"));
check("한글 표기 — 한글 낱말만 받는다", isKoName("다비드 알라바") && isKoName("응골로 캉테") && !isKoName("David Alaba") && !isKoName("알라바!") && !isKoName("가".repeat(41)));
check("한글 표기 — 형식이 틀리면 null", parseJudgement(J({ move: true, player_ko: "Alaba", evidence: "Austrian star", summary_ko: "요약." }), BODY, ALABA).playerKo === null);

// ── 구단 — 원문에 있는 이름만, 사전 → 위키데이터 확인 ──────────────────────────
check("구단 언급 — 원문에 없으면 null, 있으면 다듬은 표기", mentionIn("Arsenal", BODY) === null && mentionIn("  real   madrid ", BODY) === "real madrid" && mentionIn(null, BODY) === null);
{
  const r = parseJudgement(J({ move: true, from: "Udinese", to: "Udinese", evidence: "Austrian star", summary_ko: "요약." }), BODY, ALABA);
  check("구단 — 같은 구단이 양쪽에 오면 어느 쪽도 믿지 않는다", r.from === null && r.to === null);
  const s = parseJudgement(J({ move: true, from: "Real Madrid", to: "Udinese", suitors: ["Udinese", "Real Madrid", "Juventus", "Austrian"], evidence: "Austrian star", summary_ko: "요약." }), BODY, ALABA);
  check("관심 구단 — 출발·행선지·원문에 없는 이름을 빼고 남긴다", eq(s.suitors, ["Austrian"]));
}
{
  const lookups = [];
  const lookup = async (name) => { lookups.push(name); return name === "Sturm Graz" ? { wikidataId: "Q1", nameKo: "SK 슈투름 그라츠" } : { wikidataId: null, nameKo: null }; };
  const book = createNameBook({ cache: [{ kind: "club", key: "Philadelphia Union", name_ko: "필라델피아 유니언", wikidata_id: "Q2", checked_at: "2026-09-27T00:00:00Z" }, { kind: "club", key: "Austria", name_ko: null, wikidata_id: null, checked_at: "2026-09-27T00:00:00Z" }] });
  const rows = [];
  const r = await resolveClubs({ from: "Man Utd", to: "Sturm Graz", suitors: ["Philadelphia Union", "Austria", "Norway", "Man United"] }, book, { lookup, cacheRows: rows, nowMs: Date.parse("2026-09-28T00:00:00Z") });
  check("구단 — 사전 별칭은 정규명으로(Man Utd → Manchester United)", r.from === "Manchester United");
  check("구단 — 사전 밖 이름은 위키데이터가 축구 클럽으로 확인하면 원문 표기로 받는다", r.to === "Sturm Graz");
  check("구단 — 캐시에 확인된 이름은 다시 찾지 않고 받는다", r.suitors.includes("Philadelphia Union") && !lookups.includes("Philadelphia Union"));
  check("구단 — 최근에 찾아봤지만 클럽이 아니었던 이름은 다시 찾지 않고 버린다", !r.suitors.includes("Austria") && !lookups.includes("Austria"));
  check("구단 — 위키데이터에 없는 이름은 버리고 캐시에 '없음'으로 남긴다", !r.suitors.includes("Norway") && rows.some((x) => x.key === "Norway" && x.wikidata_id === null) && rows.some((x) => x.key === "Sturm Graz" && x.name_ko === "SK 슈투름 그라츠"));
  check("구단 — 관심 구단이 출발·행선지와 같은 정규명이면 뺀다(Man United = from)", !r.suitors.includes("Manchester United") && eq(lookups, ["Sturm Graz", "Norway"]));
}

// ── 요약 검증 ─────────────────────────────────────────────────────────
check("요약 — 공백을 하나로 접고 둘러싼 따옴표를 걷는다", eq(judgeSummary(" “다비드 알라바가\n우디네세와 계약을 맺었다.” ", {}), { text: "다비드 알라바가 우디네세와 계약을 맺었다." }));
check("요약 — 한글이 없으면 버린다(번역하지 않고 원문을 되돌려 준 경우)", "reason" in judgeSummary("Alaba joins Udinese.", {}));
check(`요약 — ${SUMMARY_MAX_CHARS}자 초과는 버린다(DB CHECK보다 먼저 거른다)`, "reason" in judgeSummary("가".repeat(SUMMARY_MAX_CHARS + 1), {}) && "text" in judgeSummary("가".repeat(SUMMARY_MAX_CHARS), {}));
check("요약 — 이모지는 코드포인트로 센다", "text" in judgeSummary("가".repeat(SUMMARY_MAX_CHARS - 1) + "⚽", {}));
check("요약 — null·빈 문자열은 버린다", "reason" in judgeSummary(null, {}) && "reason" in judgeSummary("  ", {}));
check("요약 — 교정표(그루지야·터키·스포팅 디렉터)는 저장 전에 바로잡힌다",
  eq(judgeSummary("그루지야 대표 선수가 터키 구단 스포팅 디렉터와 만났다.", undefined), { text: "조지아 대표 선수가 튀르키예 구단 스포츠 디렉터와 만났다." }));
check("교정은 긴 키부터 — 스포팅 디렉터가 한 번만 바뀐다", applyCorrections("스포팅 디렉터", { "스포팅": "스포르팅", "스포팅 디렉터": "스포츠 디렉터" }) === "스포츠 디렉터");
{
  const r = parseJudgement(J({ move: true, to: "Udinese", evidence: "Austrian star", summary_ko: "Alaba joins Udinese." }), BODY, ALABA);
  check("요약이 틀려도 판정은 move로 남고 사유만 붙는다", r.kind === "move" && r.summary === null && r.summaryIssue === "한글이 없다");
}

// ── 요청 조립 ─────────────────────────────────────────────────────────
const names = createNameBook({ players: { "david alaba": { ko: "다비드 알라바" } }, cache: [{ kind: "club", key: "Watford", name_ko: "왓퍼드 FC", checked_at: "2026-09-25T00:00:00Z" }] });
{
  const need = { player: "David Alaba", playerKey: "david alaba", body: "🚨 Alaba joins Udinese https://t.co/DOzpNRhhbi pic.twitter.com/abc123 — here we go!", clubs: ["Real Madrid", "Udinese", "Watford", "Kolkheti 1913"] };
  const req = buildJudgeRequest(need, names, "system");
  check("요청 — 사용자가 고른 모델", req.model === JUDGE_MODEL);
  check("요청 — 생각을 끈다(짧은 판정·두 줄 요약)", eq(req.thinking, { type: "disabled" }));
  check("요청 — 출력을 JSON 스키마로 고정하고 effort를 낮춘다", req.output_config.effort === "low" && eq(req.output_config.format, { type: "json_schema", schema: JUDGE_SCHEMA }));
  check("요청 — 지시문에 캐시 표식이 있다(모든 호출이 같은 문자열)", req.system[0].cache_control.type === "ephemeral" && req.system[0].text === "system");
  check("요청 — 도구가 없다(웹 검색·열기 금지)", !("tools" in req) && !("tool_choice" in req));
  check("요청 — 사용자 메시지는 글자 하나(이미지 블록 없음)", req.messages.length === 1 && typeof req.messages[0].content === "string");
  check("요청 — 원문의 링크 주소를 걷는다", !/https?:\/\/|t\.co\/|pic\.twitter/.test(req.messages[0].content) && req.messages[0].content.includes("here we go!"));
  check("요청 — 선수 이름을 싣는다(없으면 빈 태그)", req.messages[0].content.includes("<선수>David Alaba</선수>") && buildJudgeRequest({ ...need, player: null, playerKey: null }, names, "s").messages[0].content.includes("<선수></선수>"));
  check("요청 — 표기는 그 보도의 구단·선수 중 표기가 있는 것만(프리셋 · 자동 캐시 · 사람 사전)",
    eq(buildGlossary(need, names), ["Real Madrid = 레알 마드리드", "Udinese = 우디네세", "Watford = 왓퍼드 FC", "David Alaba = 다비드 알라바"]), JSON.stringify(buildGlossary(need, names)));
  check("요청 — 같은 입력이면 같은 요청(변동값이 없다)", JSON.stringify(req) === JSON.stringify(buildJudgeRequest(need, names, "system")));
  check("요청 — 스키마는 모든 필드를 요구하고 다른 필드를 막는다", JUDGE_SCHEMA.additionalProperties === false && eq(JUDGE_SCHEMA.required, ["move", "player", "player_ko", "stage", "from", "to", "suitors", "evidence", "summary_ko"]));
}
{
  const sys = buildSystem({ "pre-contract": "사전 계약" });
  check("지시문 — 재계약·인터뷰·감독 인사·회고·입단 테스트는 이동이 아니라고 적는다", ["재계약", "인터뷰", "감독", "돌아보는", "입단 테스트"].every((w) => sys.includes(w)));
  check('지시문 — 관용구 "in agreement with"을 경고한다', sys.includes("in agreement with"));
  check("지시문 — 구단은 원문 표기 그대로, 관심만 보인 구단이 여럿이면 to는 null이고 전부 suitors, 요약은 이동일 때만", sys.includes("글자 그대로 옮긴다") && sys.includes("to는 null이고 그 구단들을 전부 suitors") && sys.includes("move가 true일 때만"));
  check("지시문 — 선수가 비면 원문에서 읽고, 특정하지 못하면 false", sys.includes("<선수>가 비어 있으면") && sys.includes("특정할 수 없으면 null"));
  check("지시문 — 용어 사전이 실린다", sys.includes("<용어>\npre-contract → 사전 계약\n</용어>"));
  check("지시문 — 같은 용어면 같은 지시문", sys === buildSystem({ "pre-contract": "사전 계약" }));
}
check("원문 상한 — 길면 뒤를 자른다(핵심은 첫 문장에 있다)", [...composeText("가".repeat(BODY_MAX_CHARS + 50))].length === BODY_MAX_CHARS + 1 && composeText("short") === "short");
check("원문 + 기사 본문을 함께 싣는다", composeText("title", "long article").endsWith("[기사 본문]\nlong article"));
check("stripLinks — 줄바꿈은 살린다", stripLinks("a https://x.y/z\nb") === "a\nb");

// ── 기사 본문 ─────────────────────────────────────────────────────────
{
  const ld = `<html><head><script type="application/ld+json">{"@type":"NewsArticle","articleBody":"Arsenal's assistant admits the Brazilian was a target in the summer. He has since signed a new deal at Real Madrid."}</script></head><body><p>짧다</p></body></html>`;
  check("본문 — JSON-LD의 articleBody를 읽는다", extractArticleText(ld).startsWith("Arsenal's assistant admits"));
  check("본문 — @graph 안의 articleBody도 찾는다", extractArticleText(`<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"NewsArticle","articleBody":"Nested body text here."}]}</script>`) === "Nested body text here.");
  const paras = `<article><p>${"Chelsea are preparing a bid for the striker ahead of January. ".repeat(2)}</p><p>short</p></article>`;
  check("본문 — JSON-LD가 없으면 기사 문단을 읽는다(짧은 문단은 뺀다)", extractArticleText(paras).startsWith("Chelsea are preparing") && !extractArticleText(paras).includes("short"));
  check("본문 — 깨진 JSON-LD는 건너뛴다", extractArticleText(`<script type="application/ld+json">{깨짐</script><main><p>${"x".repeat(50)}</p></main>`) === "x".repeat(50));
  check(`본문 — ${ARTICLE_MAX_CHARS}자에서 자른다`, [...extractArticleText(`<script type="application/ld+json">{"articleBody":"${"a".repeat(ARTICLE_MAX_CHARS + 500)}"}</script>`)].length === ARTICLE_MAX_CHARS + 1);
  check("본문 — articleBody 안의 HTML 태그를 걷고 문단 사이를 띄운다", extractArticleText(`<script type="application/ld+json">${JSON.stringify({ articleBody: "<p><strong>Chelsea</strong> want Doe - <em>Mirror</em></p><p>Arsenal eye Roe</p>" })}</script>`) === "Chelsea want Doe - Mirror Arsenal eye Roe");
  check("받기 — HTTP 실패는 빈 문자열(판정은 저장된 글로)", (await fetchArticleText("https://x.test/a", async () => ({ ok: false, status: 403, text: async () => "" }))) === "");
  check("받기 — 네트워크 오류도 던지지 않는다", (await fetchArticleText("https://x.test/a", async () => { throw new Error("timeout"); })) === "");
  check("대상 — 매체 RSS만 받는다", wantsArticle({ source_id: "rss:fl-arsenal", url: "https://www.football.london/a" }) && !wantsArticle({ source_id: "tg:romano", url: "https://t.me/x" }) && !wantsArticle({ source_id: "gnews:romano", url: "https://news.google.com/x" }) && !wantsArticle({ source_id: "rss:bbc", url: null }));
  check("대상 — 가십 칼럼의 항목 행은 받지 않는다(URL이 칼럼 전체다)", !wantsArticle({ source_id: "rss:bbc-gossip", external_id: "abc#item-1a2b", url: "https://www.bbc.co.uk/sport/football/articles/x" }));
}

// ── 저장 흐름(가짜 API·가짜 DB·가짜 위키데이터) ────────────────────────────
function fakeDb() {
  const writes = [];
  const upserts = [];
  return {
    writes, upserts,
    from: (table) => ({
      update: (v) => ({ eq: async (_c, id) => { writes.push({ id, ...v }); return { error: null }; } }),
      upsert: async (rows) => { upserts.push({ table, rows }); return { error: null }; },
    }),
  };
}
const fakeClient = (answers, sent = []) => ({
  messages: {
    create: async (req) => {
      const body = req.messages[0].content;
      sent.push(body);
      const a = answers.find(([needle]) => body.includes(needle));
      if (a?.[1] instanceof Error) throw a[1];
      return { stop_reason: "end_turn", content: [{ type: "text", text: a ? a[1] : "{}" }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 0 } };
    },
  },
});
const noLookup = async () => ({ wikidataId: null, nameKo: null });
{
  const db = fakeDb();
  const needs = [
    { id: 1, playerKey: "david alaba", player: "David Alaba", body: BODY, clubs: ["Udinese", "Real Madrid"] },
    { id: 2, playerKey: "thomas tuchel", player: "Thomas Tuchel", body: "Alan Shearer in agreement with Thomas Tuchel after brutal Cole Palmer blast" },
    { id: 3, playerKey: "joao pedro", player: "Joao Pedro", body: "Joao Pedro agreement reached after bold Xabi Alonso verdict" },
    { id: 4, playerKey: "rayan cherki", player: "Rayan Cherki", body: "Rayan Cherki on dreaming to win the Ballon d'Or" },
    { id: 5, playerKey: "david alaba", player: "David Alaba", body: BODY + " (2)", summary_ko: "옛 요약." },
    { id: 6, playerKey: null, player: null, body: MANZAMBI, clubs: ["Aston Villa"] },
    { id: 7, playerKey: null, player: null, body: "Liverpool confirm a £47m agreement to sign a South American star." },
  ];
  const r = await runJudgements(db, needs, {
    names, corrections: {}, lookup: noLookup,
    client: fakeClient([
      ["Austrian star leaves Real Madrid as a free agent. (2)", J({ move: true, from: "Real Madrid", to: "Udinese", evidence: "Austrian star", summary_ko: "English only" })],
      ["David Alaba", J({ move: true, from: "Real Madrid", to: "Udinese", stage: "agreement", evidence: "reached a verbal agreement with David Alaba", summary_ko: "다비드 알라바가 우디네세와 구두 합의했다." })],
      ["Thomas Tuchel", J({ move: false, evidence: "Alan Shearer in agreement with Thomas Tuchel" })],
      ["Joao Pedro", J({ move: true, to: "Arsenal", evidence: "Joao Pedro completes move to Arsenal", summary_ko: "요약." })],
      ["Rayan Cherki", new Error("일시 오류")],
      ["Johan Manzambi", J({ move: true, player: "Johan Manzambi", player_ko: "요한 만잠비", stage: "official", from: "Freiburg", to: "Aston Villa", evidence: "his move from Freiburg to Aston Villa", summary_ko: "요한 만잠비가 프라이부르크에서 애스턴 빌라로 이적했다." })],
      ["South American star", J({ move: true, player: null, evidence: "agreement to sign a South American star", summary_ko: "요약." })],
    ]),
  });
  check("집계 — 이동 3(요약 2 · 버림 1) · 아님 2(그중 선수 미특정 1) · 판정 불가 1 · 실패 1 · 모델이 읽은 선수 1", eq([r.move, r.summarized, r.summaryInvalid, r.notMove, r.unnamed, r.invalid, r.failed, r.extractedPlayers], [3, 2, 1, 2, 1, 1, 1, 1]), JSON.stringify(r));
  check("집계 — 캐시 읽은 토큰을 센다", r.cacheReadTokens === 42 && r.inputTokens === 60);
  check("저장 — 이동·아님·판정 불가는 쓰고, 일시 실패는 쓰지 않는다(다음 실행이 다시 묻는다)", eq(db.writes.map((w) => w.id), [1, 2, 3, 5, 6, 7]));
  const w1 = db.writes[0];
  check("저장 — 이동은 판정·선수·근거·구단·단계·관심 구단·요약·시각을 쓴다",
    eq(Object.keys(w1).sort(), ["id", "summary_ko", "verdict", "verdict_at", "verdict_evidence", "verdict_from", "verdict_player", "verdict_player_name", "verdict_stage", "verdict_suitors", "verdict_to"]) && w1.verdict_from === "Real Madrid" && w1.verdict_to === "Udinese" && w1.verdict_stage === "agreement" && w1.verdict_player_name === "David Alaba" && w1.summary_ko === "다비드 알라바가 우디네세와 구두 합의했다.", JSON.stringify(w1));
  check("저장 — 아님은 요약을 비우고 근거를 남긴다", db.writes[1].verdict === "not_move" && db.writes[1].summary_ko === null && db.writes[1].verdict_evidence === "Alan Shearer in agreement with Thomas Tuchel" && db.writes[1].verdict_from === null);
  check("저장 — 판정 불가는 값 없이 선수·시각만(요약은 건드리지 않는다)", db.writes[2].verdict === null && db.writes[2].verdict_player === "joao pedro" && db.writes[2].verdict_at && !("summary_ko" in db.writes[2]));
  check("저장 — 요약이 버려졌는데 옛 요약이 있으면 둔다(영문으로 되돌리지 않는다)", db.writes[3].verdict === "move" && !("summary_ko" in db.writes[3]));
  check("저장 — 선수 없는 보도는 모델이 읽은 선수를 정규형 키와 원문 표기로 남긴다", db.writes[4].verdict === "move" && db.writes[4].verdict_player === "johan manzambi" && db.writes[4].verdict_player_name === "Johan Manzambi" && db.writes[4].verdict_to === "Aston Villa");
  check("저장 — 선수 없는 보도에서 선수를 못 특정하면 이동 아님으로 접는다(선수 null · 근거는 남긴다 · 다시 묻지 않는다)", db.writes[5].verdict === "not_move" && db.writes[5].verdict_player === null && db.writes[5].verdict_evidence === "agreement to sign a South American star");
  check("저장 — 사전 밖 구단(Freiburg는 사전에 있다)·기사 본문은 DB에 쓰지 않는다", db.writes[4].verdict_from === "SC Freiburg" && db.writes.every((w) => !("body" in w)));
  check("음역 — 표기가 없는 선수의 한글 표기를 이름 캐시에 llm 출처로 쓴다", r.namesWritten === 1 && db.upserts.some((u) => u.table === "transfer_name_ko" && u.rows[0].key === "johan manzambi" && u.rows[0].name_ko === "요한 만잠비" && u.rows[0].source === "llm"));
  check("updates — 파생이 메모리에 입힐 값을 돌려준다", eq(r.updates.map((u) => [u.id, u.verdict, u.verdict_to ?? null]), [[1, "move", "Udinese"], [2, "not_move", null], [3, null, null], [5, "move", "Udinese"], [6, "move", "Aston Villa"], [7, "not_move", null]]));
  check("경고 — 요약 버림·판정 불가는 사유를 남긴다", r.warnings.some((w) => w.includes("#5 요약 버림") && w.includes("한글이 없다")) && r.warnings.some((w) => w.includes("#3 판정 불가") && w.includes("근거가 원문에 없다")));
}
{
  // 위키데이터로 확인한 사전 밖 구단은 캐시에 남고 판정에 실린다
  const db = fakeDb();
  const body = "Arsenal, Brighton and Aston Villa are all monitoring Sturm Graz midfielder Luca Weinhandl, 17.";
  const r = await runJudgements(db, [{ id: 9, playerKey: "luca weinhandl", player: "Luca Weinhandl", body }], {
    names, corrections: {},
    lookup: async (name) => (name === "Sturm Graz" ? { wikidataId: "Q1", nameKo: "SK 슈투름 그라츠" } : { wikidataId: null, nameKo: null }),
    client: fakeClient([["Weinhandl", J({ move: true, from: "Sturm Graz", to: "Arsenal", suitors: ["Brighton", "Aston Villa"], stage: "rumour", evidence: "monitoring Sturm Graz midfielder Luca Weinhandl", summary_ko: "요약." })]]),
  });
  check("구단 확인 — 사전 밖 출발 구단을 위키데이터로 확인해 받고 캐시에 쓴다", db.writes[0].verdict_from === "Sturm Graz" && r.clubsVerified === 1 && db.upserts.some((u) => u.rows.some((x) => x.kind === "club" && x.key === "Sturm Graz" && x.wikidata_id === "Q1")));
  check("관심 구단 — 정규명으로 저장되고, 나열된 세 구단이 다 관심 구단이라 to는 비고 아스날은 suitors 맨 앞이다", eq(db.writes[0].verdict_suitors, ["Arsenal", "Brighton", "Aston Villa"]) && db.writes[0].verdict_to === null);
}
{
  const db = fakeDb();
  const needs = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, playerKey: "david alaba", player: "David Alaba", body: BODY }));
  const r = await runJudgements(db, needs, { names, corrections: {}, limit: 2, lookup: noLookup, client: fakeClient([["David Alaba", J({ move: true, evidence: "Austrian star", summary_ko: "요약." })]]) });
  check("상한 — 실행당 상한까지만 묻고 경고한다", db.writes.length === 2 && r.warnings.some((w) => w.includes("상한")));
}
{
  // 매체 RSS는 기사 본문을 받아 싣고, 근거는 본문에서 인용해도 받는다
  const db = fakeDb();
  const fetched = [];
  const fakeFetch = async (url) => {
    fetched.push(url);
    if (url.includes("blocked")) return { ok: false, status: 403, text: async () => "" };
    return { ok: true, status: 200, text: async () => `<script type="application/ld+json">{"articleBody":"Arsenal's assistant admits the Brazilian was a target in the summer."}</script>` };
  };
  const sent = [];
  const r = await runJudgements(db, [
    { id: 1, playerKey: "vinicius jr", player: "Vinicius Jr", body: "Vinicius Jr to Arsenal truth emerges", source_id: "rss:fl-arsenal", url: "https://www.football.london/a" },
    { id: 2, playerKey: "vinicius jr", player: "Vinicius Jr", body: "Vinicius Jr to Arsenal truth emerges", source_id: "rss:fl-arsenal", url: "https://blocked.test/b" },
    { id: 3, playerKey: "david alaba", player: "David Alaba", body: "admits the Brazilian was a target in the summer", source_id: "tg:romano", url: "https://t.me/x" },
  ], { names, corrections: {}, lookup: noLookup, fetchImpl: fakeFetch, client: fakeClient([["Vinicius", J({ move: false, evidence: "admits the Brazilian was a target in the summer" })], ["Brazilian", J({ move: false, evidence: "" })]], sent) });
  check("흐름 — 받은 본문을 요청에 싣는다", sent[0].includes("[기사 본문]") && sent[0].includes("was a target in the summer"));
  check("흐름 — 본문에서 인용한 근거를 받는다", db.writes[0].verdict === "not_move" && db.writes[0].verdict_evidence === "admits the Brazilian was a target in the summer");
  check("흐름 — 못 받으면 저장된 글만으로 판정한다(근거가 없으면 근거만 비운다)", !sent[1].includes("[기사 본문]") && db.writes[1].verdict === "not_move" && db.writes[1].verdict_evidence === null);
  check("흐름 — 텔레그램은 받지 않는다", fetched.length === 2 && !fetched.some((u) => u.includes("t.me")));
  check("흐름 — 받은/못 받은 수를 센다", r.articles === 1 && r.articleMissing === 1);
}
{
  // 계정 사용 한도 — 첫 거부에서 멈춘다(남은 호출이 전부 곧바로 거부된다)
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  let calls = 0;
  const client = { messages: { create: async () => { calls += 1; throw new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "You have reached your specified API usage limits." } }, "You have reached your specified API usage limits.", new Headers()); } } };
  const db = fakeDb();
  const r = await runJudgements(db, [1, 2, 3].map((id) => ({ id, playerKey: "david alaba", player: "David Alaba", body: BODY })), { names, corrections: {}, lookup: noLookup, client });
  check("사용 한도 — 첫 거부에서 멈추고 나머지를 부르지 않는다", calls === 1 && db.writes.length === 0 && r.warnings.some((w) => w.includes("사용 한도")));
  // 크레딧 소진도 같은 취급이다(문구만 다르다)
  let creditCalls = 0;
  const broke = { messages: { create: async () => { creditCalls += 1; throw new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }, "Your credit balance is too low to access the Anthropic API.", new Headers()); } } };
  const r2 = await runJudgements(fakeDb(), [1, 2, 3].map((id) => ({ id, playerKey: "david alaba", player: "David Alaba", body: BODY })), { names, corrections: {}, lookup: noLookup, client: broke });
  check("크레딧 소진 — 첫 거부에서 멈춘다", creditCalls === 1 && r2.warnings.some((w) => w.includes("사용 한도")));
}

console.log(`\nLLM 판정 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);

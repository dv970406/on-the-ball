/**
 * 한국어 요약 단계의 회귀 테스트 — API를 부르지 않는다(모델 출력은 비결정적이라 **판정·조립만** 검사한다).
 *
 *   node scripts/test-transfer-summarize.mjs
 */
import { extractTransfer } from "./lib/transfer/extract.mjs";
import { createNameBook } from "./lib/transfer/names-ko.mjs";
import {
  IRRELEVANT,
  isSummaryCandidate,
  SUMMARY_MAX_CHARS,
  SUMMARY_BODY_MAX_CHARS,
  buildGlossary,
  buildSummaryRequest,
  buildSystemPrompt,
  buildUserContent,
  clampBody,
  stripLinks,
  applyCorrections,
  judgeSummary,
} from "./lib/transfer/summarize.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 판정 ────────────────────────────────────────────────────────────────
const free = { linkedToDeal: false };
const linked = { linkedToDeal: true };

check("요약문은 그대로 — 공백을 하나로 접는다",
  eq(judgeSummary("  다비드 알라바가\n우디네세와 1년 계약을 맺었다. ", free), { kind: "summary", text: "다비드 알라바가 우디네세와 1년 계약을 맺었다." }));
check("둘러싼 따옴표를 걷는다",
  eq(judgeSummary("“아스날, 영입 합의”", free), { kind: "summary", text: "아스날, 영입 합의" }));
check(`"${IRRELEVANT}"는 무관 판정`, judgeSummary(IRRELEVANT, free).kind === "irrelevant");
check("딜에 연결된 보도를 무관이라 하면 버린다(규칙 추출과 모순 — 실측에서 Haiku가 공식 이적을 버렸다)",
  judgeSummary(IRRELEVANT, linked).kind === "invalid");
check("한글이 없으면 버린다(번역하지 않고 원문을 되돌려 준 경우)",
  judgeSummary("Alaba joins Udinese.", free).kind === "invalid");
check(`${SUMMARY_MAX_CHARS}자 초과는 버린다(DB CHECK보다 먼저 거른다)`,
  judgeSummary("가".repeat(SUMMARY_MAX_CHARS + 1), free).kind === "invalid");
check("그루지야·터키·스포팅 디렉터는 저장 전에 바로잡힌다",
  eq(judgeSummary("그루지야 대표 선수가 터키 구단 스포팅 디렉터와 만났다.", free), { kind: "summary", text: "조지아 대표 선수가 튀르키예 구단 스포츠 디렉터와 만났다." }));
check("교정은 긴 키부터 — 스포팅 디렉터가 한 번만 바뀐다", applyCorrections("스포팅 디렉터", { "스포팅": "스포르팅", "스포팅 디렉터": "스포츠 디렉터" }) === "스포츠 디렉터");
check("요약 끝에 무관 표시가 붙은 답은 버린다", judgeSummary("여자팀 소식으로 이적과 무관하다. -", free).kind === "invalid");
check(`${SUMMARY_MAX_CHARS}자는 통과`, judgeSummary("가".repeat(SUMMARY_MAX_CHARS), free).kind === "summary");
check("이모지는 코드포인트로 센다(서로게이트 쌍을 2로 세지 않는다)",
  judgeSummary("가".repeat(SUMMARY_MAX_CHARS - 1) + "⚽", free).kind === "summary");

// ── 사전 ────────────────────────────────────────────────────────────────
const names = createNameBook({ players: { "david alaba": { ko: "다비드 알라바" } } });
const g = buildGlossary({ clubs: ["Real Madrid", "Udinese", "Kolkheti 1913"], players: ["David Alaba", "Isaac Konde"] }, names);
check("프리셋 구단만 싣는다 — 한국어 표기가 없는 구단은 뺀다(음역하지 않게)",
  eq(g.clubs, [["Real Madrid", "레알 마드리드"], ["Udinese", "우디네세"]]), JSON.stringify(g.clubs));
check("사전에 있는 선수만 싣는다", eq(g.players, [["David Alaba", "다비드 알라바"]]), JSON.stringify(g.players));
check("EPL 구단은 team-names-ko.json 표기",
  eq(buildGlossary({ clubs: ["Arsenal"], players: [] }, createNameBook()).clubs, [["Arsenal", "아스날"]]));
check("구단·선수가 비어도 된다", eq(buildGlossary({ clubs: [], players: [] }, createNameBook()), { clubs: [], players: [] }));
check("프리셋 밖 구단·사전 밖 선수도 **자동 캐시(위키데이터)**에 있으면 싣는다 — 화면과 같은 사전",
  eq(buildGlossary({ clubs: ["Watford"], players: ["Federico Chiesa"] }, createNameBook({ cache: [
    { kind: "club", key: "Watford", name_ko: "왓퍼드 FC", checked_at: "2026-09-25T00:00:00Z" },
    { kind: "player", key: "federico chiesa", name_ko: "페데리코 키에사", checked_at: "2026-09-25T00:00:00Z" },
  ] })), { clubs: [["Watford", "왓퍼드 FC"]], players: [["Federico Chiesa", "페데리코 키에사"]] }));

// ── 지시문 · 원문 상한 ────────────────────────────────────────────────────
const sys = buildSystemPrompt({ "pre-contract": "사전 계약" });
check("용어 사전이 지시문에 실린다", sys.includes("<용어>\npre-contract → 사전 계약\n</용어>"));
check("같은 용어면 같은 지시문(호출마다 변동값이 없다)", sys === buildSystemPrompt({ "pre-contract": "사전 계약" }));
check("원문 상한 — 짧으면 그대로", clampBody("short") === "short");
check("원문 상한 — 길면 뒤를 자르고 …(핵심은 첫 문장에 있다)",
  [...clampBody("가".repeat(SUMMARY_BODY_MAX_CHARS + 50))].length === SUMMARY_BODY_MAX_CHARS + 1 && clampBody("가".repeat(SUMMARY_BODY_MAX_CHARS + 50)).endsWith("…"));

// ── 메시지 조립 ──────────────────────────────────────────────────────────
const a = buildUserContent("Alaba joins Udinese.", g);
check("같은 입력이면 같은 메시지(변동값이 없다)", a === buildUserContent("Alaba joins Udinese.", g));
check("사전과 원문을 태그로 가른다", a.includes("<표기>\nReal Madrid = 레알 마드리드") && a.endsWith("<원문>\nAlaba joins Udinese.\n</원문>"));
check("사전이 비면 (없음)", buildUserContent("x", { clubs: [], players: [] }).includes("<표기>\n(없음)\n</표기>"));

// ── 글자만 보낸다 — 이미지·링크로 토큰을 쓰지 않는다 ─────────────────────────
const req = buildSummaryRequest(
  { body: "🚨 Alaba joins Udinese https://t.co/DOzpNRhhbi pic.twitter.com/abc123 — here we go! https://www.nytimes.com/athletic/1234/", clubs: [], players: [] },
  createNameBook(), "system",
);
check("사용자 메시지는 문자열 하나다(이미지 블록이 없다)", req.messages.length === 1 && typeof req.messages[0].content === "string");
check("도구를 주지 않는다(웹 검색·웹 열기로 사진을 볼 길이 없다)", !("tools" in req) && !("tool_choice" in req));
check("링크 주소는 보내지 않는다", !/https?:\/\/|t\.co\/|pic\.twitter/.test(req.messages[0].content), req.messages[0].content);
check("링크를 걷어도 본문 글자는 남는다", req.messages[0].content.includes("Alaba joins Udinese") && req.messages[0].content.includes("here we go!"));
check("stripLinks — 줄바꿈은 살린다", stripLinks("a https://x.y/z\nb") === "a\nb");

// ── LLM에 보낼 보도인가 ─────────────────────────────────────────────────
check("딜에 연결된 보도는 보낸다", isSummaryCandidate({ deal_id: 24 }));
check("딜이 없는 보도는 보내지 않는다 — 요약이 화면 어디에도 나오지 않는다", !isSummaryCandidate({ deal_id: null }));

// 떠나는 쪽 표현도 이적 신호다 — 관련도가 올라야 딜 파생 후보(relevance ≥ 0.3)에 닿을 수 있다
const rel = (text) => extractTransfer(text).relevance;
check("합의 해지로 떠나는 보도에 관련도가 붙는다(에릭센 — 0이었던 행)",
  rel("Eriksen leaves Wolfsburg by mutual consent Christian Eriksen leaves Wolfsburg by mutual consent, just over three months after collapsing during Denmark's friendly with Ukraine.") > 0);
check("방출·자유계약 표현에도 붙는다", rel("Veteran striker released by his club and now a free agent.") > 0);
check("경기·사건 기사는 0이다", rel("Striker charged with drink-driving after crash on the M6, police confirm.") === 0);

// ── 지역지·유럽 매체 RSS를 넣으며 실측한 오탐 ───────────────────────────────
const ex = (t) => extractTransfer(t);
check("부상 발표는 오피셜이 아니다(have announced + ligament injury)",
  ex("Real Madrid confirm ligament injury for France defender Ibrahima Konate. Real Madrid have announced that Ibrahima Konate has been diagnosed with a collateral ligament injury.").stage === "unknown");
check("이적 표현이 있으면 부상 언급이 있어도 판정한다",
  ex("Official: Arsenal have announced the signing of John Doe despite his recent hamstring injury.").stage !== "unknown");
check("소유격 이름은 선수가 아니다(감독의 팀)",
  !ex("The former Arsenal goalkeeper is closing in on a new club two years on from signing for Mikel Arteta's side.").players.some((p) => /Arteta/.test(p)));
check("첫 프로 계약 공지는 오피셜 이적이 아니다",
  ex("Official: Matteo Pagliei signs first professional contract with Milan Futuro").stage !== "official");

console.log(`\n한국어 요약 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);

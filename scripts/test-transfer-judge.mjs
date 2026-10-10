/**
 * LLM 판정 단계(`scripts/lib/transfer/judge.mjs`) 회귀 테스트 — API를 부르지 않는다
 * (모델 출력은 비결정적이라 **해석·조립·저장 흐름만** 검사한다).
 *
 *   node scripts/test-transfer-judge.mjs
 */
import { createNameBook } from "./lib/transfer/names-ko.mjs";
import { JUDGE_CONFIGS, judgeFingerprint, prepareJudgeInput } from "./lib/transfer/judge-prompt.mjs";
import { evidenceIn, fullNameFor, koNameOf, sourceFingerprint, judgeFee, localizeSummary, moneyMentions, replayJudgements, isEnumeratedWith, loneOtherClub, normalizeDestination,
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
  check("행선지 — 하나뿐이어도 '여럿 중 하나'로 언급됐으면 올리지 않는다(among the sides · also attracting)",
    eq(normalizeDestination({ to: null, suitors: ["Besiktas"] }, "Besiktas were among the sides interested in signing Willock in the summer."), { to: null, suitors: ["Besiktas"] }) &&
    eq(normalizeDestination({ to: null, suitors: ["Barcelona"] }, "The same three Premier League clubs are keeping an eye on Alessandro Bastoni, who is also attracting interest from Barcelona."), { to: null, suitors: ["Barcelona"] }));
  check("행선지 — 이름 없는 구단 무리와 함께 나온 하나는 올리지 않는다(Championship clubs and Celtic)", eq(normalizeDestination({ to: null, suitors: ["Celtic"] }, "Championship clubs and Celtic are eyeing a move for Liverpool defender Luke Chambers."), { to: null, suitors: ["Celtic"] }));
  check("행선지 — to도 없고 관심 구단이 여럿이면 그대로", eq(normalizeDestination({ to: null, suitors: ["Real Madrid", "Barcelona"] }, "Real Madrid and Barcelona are ready to pounce."), { to: null, suitors: ["Real Madrid", "Barcelona"] }));
  check("행선지 — 공백만으로 이어진 이름은 나열이 아니다", !isEnumeratedWith("Chelsea Liverpool", "Chelsea", ["Liverpool"]));
}

// ── 근거 대조 — 줄인 인용은 받고, 지어낸 인용은 받지 않는다 ──────────────────────
{
  const AMP = "Leeds United have no plans to sell Wales defender Ethan Ampadu, 26, despite links with his former club Chelsea. (Football Insider)";
  check("근거 — 나이 표기를 뺀 인용을 받는다", evidenceIn(AMP, "Leeds United have no plans to sell Wales defender Ethan Ampadu, despite links with his former club Chelsea"));
  const ALA = "🚨⚪️⚫️ EXCLUSIVE: Udinese have reached a verbal agreement with David Alaba! Austrian star, a dream signing for the Italian club. Formal steps needed ahead of the here we go.";
  check("근거 — '...'로 가운데를 건너뛴 인용을 받는다(조각이 순서대로 있다)", evidenceIn(ALA, "Udinese have reached a verbal agreement with David Alaba! ... Formal steps needed ahead of the here we go"));
  check("근거 — 말줄임표(…)도 같다", evidenceIn(ALA, "Udinese have reached a verbal agreement with David Alaba… Formal steps needed ahead"));
  check("근거 — 조각마다 원문에 있으면 순서가 달라도 받는다(모델은 뒤 문단의 문장을 먼저 적는다)", evidenceIn(ALA, "Formal steps needed ahead ... Udinese have reached a verbal agreement"));
  {
    const PORTO = "FC Porto agree deal to sign Chris Smalling, here we go!\n\nDeal done for the English centre back joining as free agent.\n\nMedical underway right now for English defender joining Porto.";
    check("근거 — \"...\" 없이 이어 적은 두 문장도 문장마다 원문에 있으면 받는다", evidenceIn(PORTO, "FC Porto agree deal to sign Chris Smalling, here we go! Medical underway right now"));
    check("근거 — ⚠ 문장 하나라도 원문에 없으면 받지 않는다", !evidenceIn(PORTO, "FC Porto agree deal to sign Chris Smalling, here we go! He signs a five year contract"));
    check("근거 — ⚠ 짧은 조각만으로는 받지 않는다", !evidenceIn(PORTO, "Deal done. Here we go!"));
  }
  check("근거 — 낱말 하나를 바꾼 인용은 받지 않는다(he ↔ they)", !evidenceIn("Falk suggesting they could well return in a year's time.", "he could well return in a year's time"));
  check("근거 — 원문에 없는 낱말이 끼면 받지 않는다", !evidenceIn(AMP, "Leeds United have agreed to sell Wales defender Ethan Ampadu"));
  check("근거 — 멀리 떨어진 낱말을 이어 붙인 인용은 받지 않는다(건너뛰기 한도)", !evidenceIn("Chelsea are keen. Many weeks later and after a long saga involving several other clubs and agents, Arsenal finally sign John Doe.", "Chelsea sign John Doe"));
  check("근거 — 한두 낱말짜리 조각은 받지 않는다", !evidenceIn(ALA, "Udinese ... Alaba"));
  check("이름 대조는 그대로 통째 일치다(건너뛰어 맞추지 않는다)", parseJudgement(J({ move: true, from: "Real Madrid", evidence: "Sociedad and Atletico Madrid are keen", summary_ko: "요약." }), "Real Sociedad and Atletico Madrid are keen on John Doe.", { ...NO_FIX, player: "John Doe" }).from === null);
}

// ── 행선지 후처리 — 모델이 비워 보낸 행선지 · '여럿 중 하나'로 확정한 행선지 ──────────
{
  check("행선지 — 하나만 적었어도 원문이 '여러 구단 중 하나'라 하면 관심 구단으로 내린다", eq(normalizeDestination({ to: "Manchester United", suitors: [] }, "Manchester United are one of the clubs interested in Real Madrid forward Endrick."), { to: null, suitors: ["Manchester United"] }) && eq(normalizeDestination({ to: "Real Madrid", suitors: [] }, "Real Madrid and several Premier League clubs are tracking Jarrad Branthwaite."), { to: null, suitors: ["Real Madrid"] }));
  check("행선지 — also는 내리는 표지가 아니다(다른 선수 얘기일 수 있다)", eq(normalizeDestination({ to: "Bayern Munich", suitors: [] }, "Bayern Munich are also eyeing a move for French defender Jules Kounde."), { to: "Bayern Munich", suitors: [] }));
  check("행선지 — 짧은 글에 출발 말고 구단이 하나뿐이고 영입 관심 글이면 그 구단", loneOtherClub("Tottenham are interested in Galatasaray striker Mauro Icardi, 33.", "Galatasaray") === "Tottenham Hotspur" && loneOtherClub("AS Roma are expected to double their asking price for Chelsea target Manu Kone, 25, to £86m in January.", "AS Roma") === "Chelsea");
  check("행선지 — 떠나온 구단(joined from X)·전 소속(former X)은 행선지가 아니다", loneOtherClub("Benfica forward John Doe, who joined from Porto last year, is a target for a move.", "Benfica") === null && loneOtherClub("Former Chelsea winger John Doe wants to leave Juventus and is a target.", "Juventus") === null);
  check("행선지 — 구단이 둘 이상이거나 긴 기사면 짐작하지 않는다", loneOtherClub("Arsenal and Tottenham are monitoring Bayer Leverkusen's Ibrahim Maza.", "Bayer Leverkusen") === null && loneOtherClub(`Tottenham are interested in Galatasaray striker Mauro Icardi.\n\n[기사 본문]\n…`, "Galatasaray") === null);
  check("행선지 — 이름 없는 구단 무리가 함께 나오면 하나로 확정하지 않는다(Championship clubs)", loneOtherClub("Celtic and Championship clubs want to sign Liverpool defender Luke Chambers on loan.", "Liverpool") === null);
  check("행선지 — 출발 구단을 모르면 짐작하지 않는다", loneOtherClub("Tottenham are interested in Mauro Icardi.", null) === null);
}

// ── 재계약 가드 — 지금 구단과의 계약 합의를 이적 단계로 읽지 않는다(케인) ──────────────
{
  const KANE = "Harry Kane makes feelings clear on Tottenham return as agreement 'close'. Kane is now on the verge of agreeing a new contract to extend his time with Bayern, which would see rumours of a potential return to Tottenham come to an end.";
  const opt = { ...NO_FIX, player: "Harry Kane" };
  const r = parseJudgement(J({ move: true, stage: "agreement", evidence: "Kane is now on the verge of agreeing a new contract to extend his time with Bayern", summary_ko: "요약." }), KANE, opt);
  check("재계약 — 근거가 재계약이고 행선지 없는 '합의'는 이동 아님(재계약)", r.kind === "not_move" && r.renewal === true);
  check("재계약 — 같은 근거라도 부인으로 읽은 판정은 그대로(복귀설을 끝내는 보도)", parseJudgement(J({ move: true, stage: "denied", from: "Bayern", suitors: ["Tottenham"], evidence: "Kane is now on the verge of agreeing a new contract to extend his time with Bayern", summary_ko: "요약." }), KANE, opt).kind === "move");
  check("재계약 — 행선지가 있으면 가드가 걸리지 않는다(이적하며 새 계약)", parseJudgement(J({ move: true, stage: "agreement", to: "Tottenham", evidence: "rumours of a potential return to Tottenham come to an end", summary_ko: "요약." }), KANE, opt).kind === "move");
}

// ── 해석 ────────────────────────────────────────────────────────────────
const BODY = "Udinese have reached a verbal agreement with David Alaba! Austrian star leaves Real Madrid as a free agent.";
{
  const r = parseJudgement(J({ move: true, player: "David Alaba", player_ko: "다비드 알라바", stage: "agreement", from: "Real Madrid", to: "Udinese", evidence: "reached a verbal agreement with David Alaba", summary_ko: "다비드 알라바가 우디네세와 구두 합의했다." }), BODY, ALABA);
  check("이동 + 근거 + 선수·단계·구단·요약 → move", eq(r, { kind: "move", rawClubs: ["Real Madrid", "Udinese"], player: "David Alaba", playerKo: "다비드 알라바", stage: "agreement", evidence: "reached a verbal agreement with David Alaba", from: "Real Madrid", to: "Udinese", suitors: [], fee: null, summary: "다비드 알라바가 우디네세와 구두 합의했다.", summaryIssue: null }), JSON.stringify(r));
}
// ── 시점·금액·한 토큰 이름·요약 문자 ────────────────────────────────────
{
  const GAKPO = "Cody Gakpo reflects on tough summer after collapse of Manchester City move. He was an £80m target for City in August before talks stalled.";
  const past = parseJudgement(J({ move: true, timing: "past", stage: "collapsed", evidence: "collapse of Manchester City move", summary_ko: "요약." }), GAKPO, { ...NO_FIX, player: "Cody Gakpo" });
  check("시점 — 지난 일의 회고(past)는 이동이라 해도 이동 아님으로 접는다(다시 묻지 않는다)", past.kind === "not_move" && past.retrospective === true, JSON.stringify(past));
  check("시점 — 회고는 근거가 원문과 어긋나도 이동 아님이다(판정 불가로 두고 다시 묻지 않는다)", parseJudgement(J({ move: true, timing: "past", evidence: "지어낸 근거", summary_ko: "요약." }), GAKPO, { ...NO_FIX, player: "Cody Gakpo" }).kind === "not_move");
  {
    const JELTSCH = "Real Madrid are interested in Stuttgart's 20-year-old centre-back Finn Jeltsch. (AS)";
    const r = parseJudgement(J({ move: true, from: "VfB Stuttgart", to: "Real Madrid", evidence: "Real Madrid are interested in Stuttgart's", summary_ko: "요약." }), JELTSCH, { ...NO_FIX, player: "Finn Jeltsch" });
    check("구단 — 모델이 다듬어 적은 이름도 원문에서 잡히는 구단이면 정규명으로 받는다(VfB Stuttgart ← Stuttgart's)", r.from === "VfB Stuttgart" && r.to === "Real Madrid", JSON.stringify(r));
    check("구단 — ⚠ 원문에 없는 구단은 사전에 있어도 받지 않는다", parseJudgement(J({ move: true, from: "Bayern Munich", to: "Real Madrid", evidence: "Real Madrid are interested in Stuttgart's", summary_ko: "요약." }), JELTSCH, { ...NO_FIX, player: "Finn Jeltsch" }).from === null);
  }
  check("시점 — current·없음은 그대로 이동", parseJudgement(J({ move: true, timing: "current", evidence: "collapse of Manchester City move", summary_ko: "요약." }), GAKPO, { ...NO_FIX, player: "Cody Gakpo" }).kind === "move");

  const MINTEH = "Liverpool had a £60m bid for Yankuba Minteh rejected, with Brighton wanting £80m. Ronald Araujo's option is €47m. His wage is £100,000 a week.";
  const fee = (f) => parseJudgement(J({ move: true, evidence: "£60m bid for Yankuba Minteh rejected", summary_ko: "요약.", fee: f }), MINTEH, { ...NO_FIX, player: "Yankuba Minteh" }).fee;
  check("금액 — 원문에 있는 금액·통화면 성격과 함께 받는다", eq(fee({ amount: 60, currency: "GBP", kind: "bid" }), { amount: 60, currency: "GBP", kind: "bid" }));
  check("금액 — ⚠ 원문에 없는 금액은 받지 않는다(판정은 그대로)", fee({ amount: 65, currency: "GBP", kind: "bid" }) === null);
  check("금액 — ⚠ 통화가 다르면 받지 않는다", fee({ amount: 60, currency: "EUR", kind: "bid" }) === null);
  check("금액 — 모르는 성격·범위 밖 금액은 받지 않는다", fee({ amount: 60, currency: "GBP", kind: "wage" }) === null && fee({ amount: 0, currency: "GBP", kind: "fee" }) === null && fee({ amount: 900, currency: "GBP", kind: "fee" }) === null);
  check("금액 — 원문 표기 읽기(£60m · €30.57m · £500k · €500,000 · 60 million euros)", eq(moneyMentions("£60m, €30.57m, £500k, €500,000, 60 million euros").map((m) => `${m.amount}${m.currency}`), ["60GBP", "30.57EUR", "0.5GBP", "0.5EUR", "60EUR"]));
  check("금액 — 단위 없는 작은 수(주급·등번호)는 금액이 아니다", moneyMentions("£80 shirt").length === 0);
  check("금액 — 범위는 두 끝을 모두 금액으로 읽는다(€20-25m · £40m-£50m)", ["20EUR", "25EUR", "40GBP", "50GBP"].every((k) => moneyMentions("a valuation of €20-25m, or £40m-£50m").some((m) => `${m.amount}${m.currency}` === k)));
  check("금액 — 범위의 높은 값을 판정자가 적으면 받는다", eq(judgeFee({ amount: 25, currency: "EUR", kind: "valuation" }, "a valuation of €20-25m"), { amount: 25, currency: "EUR", kind: "valuation" }));

  const HAALAND = "Chelsea, Arsenal and Bayern Munich are among the teams interested in Haaland.";
  const book = { playersBySurname: (t) => (t === "haaland" ? [{ key: "erling haaland", name: "Erling Haaland" }] : t === "silva" ? [{ key: "bernardo silva", name: "Bernardo Silva" }, { key: "thiago silva", name: "Thiago Silva" }] : []) };
  check("한 토큰 이름 — 아는 선수 한 명의 성이면 전체 이름으로 받는다", parseJudgement(J({ move: true, player: "Haaland", evidence: "interested in Haaland", summary_ko: "요약." }), HAALAND, { ...NO_FIX, names: book }).player === "Erling Haaland");
  check("한 토큰 이름 — 원문에 전체 이름이 있으면 그것", fullNameFor("Alaba", "Alaba: Ex-Real Madrid defender agrees. David Alaba has reached", null) === "David Alaba");
  check("한 토큰 이름 — ⚠ 같은 성의 아는 선수가 둘이면 풀지 않는다", fullNameFor("Silva", "City want Silva.", book) === null);
  const patric = parseJudgement(J({ move: true, player: "Zitolo", evidence: "Lazio have sold Zitolo", summary_ko: "요약." }), "Official: Lazio have sold Zitolo to Al-Ettifaq.", { ...NO_FIX, names: book });
  check("한 토큰 이름 — ⚠ 못 풀면 이동 아님(선수 미특정)이고 그 이름을 남긴다(사람이 사전에 넣는다)", patric.kind === "not_move" && patric.unnamed === true && patric.mention === "Zitolo", JSON.stringify(patric));

  {
    const LIVE = "Transfer news LIVE: Arsenal target Alexander-Arnold; Man Utd triple deal\n\nFollow all the latest";
    const body = "Liverpool have appointed Julian Ward as sporting director.";
    const opt = { ...NO_FIX, player: "Trent Alexander-Arnold" };
    const j = J({ move: true, to: "Arsenal", evidence: "Arsenal target Alexander-Arnold", summary_ko: "요약." });
    check("제목뿐 — ⚠ 받은 기사 본문에 그 선수가 없으면 이동 아님(라이브 블로그·모음의 제목)", parseJudgement(j, `${LIVE}\n\n[기사 본문]\n${body}`, { ...opt, article: body }).titleOnly === true);
    check("제목뿐 — 본문에 성이 나오면 그대로 이동", parseJudgement(j, `${LIVE}\n\n[기사 본문]\nArsenal want Alexander-Arnold.`, { ...opt, article: "Arsenal want Alexander-Arnold." }).kind === "move");
    check("제목뿐 — 기사 본문을 받지 않는 글(SNS·가십 항목)은 보지 않는다", parseJudgement(j, LIVE, opt).kind === "move");
  }
  check("요약 이름 — 영문 이름과 모델의 제 표기를 사전 표기로, 영문으로 남은 구단을 한국어로", localizeSummary("맨유의 JJ Gabriel과 JJ 개브리얼을 Sporting CP가 원한다.", { player: "JJ Gabriel", playerKoByModel: "JJ 개브리얼", ko: "JJ 가브리엘", rawClubs: ["Sporting CP"], clubKo: () => "스포르팅 CP" }) === "맨유의 JJ 가브리엘과 JJ 가브리엘을 스포르팅 CP가 원한다.");
  check("요약 이름 — ⚠ 이미 한국어 이름이 적힌 구단은 다시 바꾸지 않는다(PSV 에인트호번 에인트호번)", localizeSummary("PSV 에인트호번 소속 미드필더", { player: "X Y", playerKoByModel: null, ko: null, rawClubs: ["PSV"], clubKo: () => "PSV 에인트호번" }) === "PSV 에인트호번 소속 미드필더");
  check("요약 이름 — 영문 성만 남은 자리도 사전 표기의 성으로(Gakpo는 → 각포는)", localizeSummary("리버풀이 Cody Gakpo를 원한다. Gakpo는 남는다.", { player: "Cody Gakpo", playerKoByModel: null, ko: "코디 각포" }) === "리버풀이 코디 각포를 원한다. 각포는 남는다.");
  check("요약 이름 — ⚠ 성은 라틴 낱말 경계에서만, 3자 미만 성은 바꾸지 않는다", localizeSummary("Gakposon과 Gakpo", { player: "Cody Gakpo", ko: "코디 각포" }) === "Gakposon과 각포" && localizeSummary("Sá와 Lu가", { player: "José Sá", ko: "주제 사" }) === "Sá와 Lu가");
  check("요약 이름 — 사전 표기가 없으면 그대로 둔다", localizeSummary("Dany Freire가 이적했다.", { player: "Dany Freire", playerKoByModel: null, ko: null }) === "Dany Freire가 이적했다.");
  check("요약 — ⚠ 한자가 섞이면 버린다", judgeSummary("각포는 英 언론의 관심을 받았다.", {}).reason?.includes("英"));
  check("요약 — ⚠ 아랍 문자가 섞이면 버린다", Boolean(judgeSummary("알라바가 메دي컬을 진행한다.", {}).reason));
  check("요약 — 낱말 끝의 行은 '행'으로 고쳐 받는다", judgeSummary("맨체스터 시티行 이적이 무산됐다.", {}).text === "맨체스터 시티행 이적이 무산됐다.");
  check("요약 — 용어를 괄호로 되풀이한 것을 걷는다", judgeSummary("알라바가 우디네세로 이적이 확정되었으며(이적 확정), 1년 계약을 맺는다.", {}).text === "알라바가 우디네세로 이적이 확정되었으며, 1년 계약을 맺는다.");
  check("요약 — 통화 기호·영문 고유명사·악센트는 통과한다", judgeSummary("JJ Gabriel이 €30.57m에 Pavel Šulc와 함께 이적했다.", {}).text != null);
}
check("코드 블록으로 감싸도 읽는다", parseJudgement('```json\n' + J({ move: true, evidence: "Austrian star", summary_ko: "요약." }) + "\n```", BODY, ALABA).kind === "move");
check("근거의 공백·따옴표·대소문자 차이는 접는다", parseJudgement(J({ move: true, evidence: "Udinese have  reached a VERBAL agreement", summary_ko: "요약." }), BODY, ALABA).kind === "move");
check("⚠ 이동이라면서 원문에 없는 근거 → 판정 불가(지어낸 근거로 딜을 열지 않는다)",
  eq(parseJudgement(J({ move: true, evidence: "Alaba completes his medical at Udinese", summary_ko: "요약." }), BODY, ALABA), { kind: "invalid", reason: "근거가 원문에 없다", quote: "Alaba completes his medical at Udinese" }));
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
check("한글 표기 — 라틴 대문자 머리글자(1~3자)는 받는다(JJ 가브리엘 — 거부했더니 요약마다 표기가 갈렸다)", isKoName("JJ 가브리엘") && isKoName("CJ 이건") && isKoName("에밀 스미스-로우"));
check("한글 표기 — ⚠ 머리글자만·4자 이상·소문자·다른 문자는 받지 않는다", !isKoName("JJ") && !isKoName("ABCD 가브리엘") && !isKoName("Jj 가브리엘") && !isKoName("빅토르 עיוケレス") && !isKoName("빅토르 ケレス"));
check("한글 표기 — 교정표를 적용하고 받는다(요약은 각포인데 제목은 가크포로 남았다)", koNameOf("코디 가크포", { "가크포": "각포" }) === "코디 각포" && koNameOf("Cody Gakpo", {}) === null);
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
  check("요청 — 생각 설정은 운영 설정을 따른다", eq(req.thinking, (await import("./lib/transfer/judge-prompt.mjs")).JUDGE_CONFIG.thinking));
  check("요청 — 출력을 JSON 스키마로 고정하고 effort를 낮춘다", req.output_config.effort === "low" && eq(req.output_config.format, { type: "json_schema", schema: JUDGE_SCHEMA }));
  check("요청 — 지시문에 캐시 표식이 있다(모든 호출이 같은 문자열)", req.system[0].cache_control.type === "ephemeral" && req.system[0].text === "system");
  check("요청 — 도구가 없다(웹 검색·열기 금지)", !("tools" in req) && !("tool_choice" in req));
  check("요청 — 사용자 메시지는 글자 하나(이미지 블록 없음)", req.messages.length === 1 && typeof req.messages[0].content === "string");
  check("요청 — 원문의 링크 주소를 걷는다", !/https?:\/\/|t\.co\/|pic\.twitter/.test(req.messages[0].content) && req.messages[0].content.includes("here we go!"));
  check("요청 — 선수 이름을 싣는다(없으면 빈 태그)", req.messages[0].content.includes("<선수>David Alaba</선수>") && buildJudgeRequest({ ...need, player: null, playerKey: null }, names, "s").messages[0].content.includes("<선수></선수>"));
  check("요청 — 표기는 그 보도의 구단·선수 중 표기가 있는 것만(프리셋 · 자동 캐시 · 사람 사전)",
    eq(buildGlossary(need, names), ["Real Madrid = 레알 마드리드", "Udinese = 우디네세", "Watford = 왓퍼드 FC", "David Alaba = 다비드 알라바"]), JSON.stringify(buildGlossary(need, names)));
  check("요청 — 같은 입력이면 같은 요청(변동값이 없다)", JSON.stringify(req) === JSON.stringify(buildJudgeRequest(need, names, "system")));
  check("요청 — 스키마는 모든 필드를 요구하고 다른 필드를 막는다", JUDGE_SCHEMA.additionalProperties === false && eq(JUDGE_SCHEMA.required, ["evidence_ids", "timing", "player", "why", "move", "stage", "from", "to", "suitors", "fee", "player_ko", "summary_ko"]));
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
    { id: 5, playerKey: "david alaba", player: "David Alaba", body: BODY + " Second report here.", summary_ko: "옛 요약." },
    { id: 6, playerKey: null, player: null, body: MANZAMBI, clubs: ["Aston Villa"] },
    { id: 7, playerKey: null, player: null, body: "Liverpool confirm a £47m agreement to sign a South American star." },
  ];
  const r = await runJudgements(db, needs, {
    names, corrections: {}, lookup: noLookup,
    client: fakeClient([
      ["Second report here.", J({ move: true, from: "Real Madrid", to: "Udinese", evidence: "Austrian star", summary_ko: "English only" })],
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
    eq(Object.keys(w1).sort(), ["id", "summary_ko", "verdict", "verdict_article_chars", "verdict_at", "verdict_attempts", "verdict_evidence", "verdict_fee_amount", "verdict_fee_currency", "verdict_fee_kind", "verdict_from", "verdict_input", "verdict_model", "verdict_player", "verdict_player_name", "verdict_prompt", "verdict_raw", "verdict_stage", "verdict_suitors", "verdict_to"]) && typeof w1.verdict_raw === "string" && JSON.parse(w1.verdict_raw).move === true && w1.verdict_from === "Real Madrid" && w1.verdict_to === "Udinese" && w1.verdict_stage === "agreement" && w1.verdict_player_name === "David Alaba" && w1.summary_ko === "다비드 알라바가 우디네세와 구두 합의했다.", JSON.stringify(w1));
  check("저장 — 아님은 요약을 비우고 근거를 남긴다", db.writes[1].verdict === "not_move" && db.writes[1].summary_ko === null && db.writes[1].verdict_evidence === "Alan Shearer in agreement with Thomas Tuchel" && db.writes[1].verdict_from === null);
  check("저장 — 옛 판정 없는 판정 불가는 값 없이 선수·시각·실패 횟수만, 요약은 비운다(재계약·회고 요약이 남지 않게)", db.writes[2].verdict === null && db.writes[2].verdict_player === "joao pedro" && db.writes[2].verdict_at && db.writes[2].summary_ko === null && db.writes[2].verdict_attempts === 1);
  check("저장 — 성공은 실패 횟수를 0으로, 출처(모델·지시문 지문·원문 지문)를 남긴다", w1.verdict_attempts === 0 && w1.verdict_model === JUDGE_MODEL && w1.verdict_prompt === judgeFingerprint(buildSystem()) && w1.verdict_input === sourceFingerprint(prepareJudgeInput(needs[0]).numbered.text) && w1.verdict_article_chars === null);
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
  check("흐름 — 본문을 받은 판정은 글자 수와 실패 0, 못 받은 판정은 0자·실패 1, 텔레그램은 null", db.writes[0].verdict_article_chars > 0 && db.writes[0].verdict_attempts === 0 && db.writes[1].verdict_article_chars === 0 && db.writes[1].verdict_attempts === 1 && db.writes[2].verdict_article_chars === null);
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

// ── 새 출력 형식 — 근거는 문장 번호(evidence_ids) ─────────────────────────────
const N = (o) => JSON.stringify({ evidence_ids: [], timing: "current", player: null, why: "짧은 설명", move: false, stage: null, from: null, to: null, suitors: [], fee: null, player_ko: null, summary_ko: null, ...o });
{
  const { sentText, numbered } = prepareJudgeInput({ body: BODY });
  const opt = { ...ALABA, sentences: numbered.sentences };
  const r = parseJudgement(N({ evidence_ids: [1], move: true, stage: "agreement", from: "Real Madrid", to: "Udinese", summary_ko: "다비드 알라바가 우디네세와 구두 합의했다." }), sentText, opt);
  check("번호 근거 — 번호의 문장이 근거가 된다(대조할 인용이 없다)", r.kind === "move" && r.evidence === "Udinese have reached a verbal agreement with David Alaba!" && r.to === "Udinese", JSON.stringify(r));
  check("번호 근거 — 여러 번호는 문장을 이어 붙이고 중복은 접는다", parseJudgement(N({ evidence_ids: [1, 2, 1], move: true, summary_ko: "요약." }), sentText, opt).evidence === numbered.sentences.join(" "));
  const out = parseJudgement(N({ evidence_ids: [1, 9], move: true, summary_ko: "요약." }), sentText, opt);
  check("번호 근거 — 범위 밖 번호가 있으면 이동은 판정 불가(사유에 번호)", out.kind === "invalid" && out.reason.includes("범위 밖") && out.reason.includes("9"), JSON.stringify(out));
  check("번호 근거 — 0·소수·문자도 범위 밖", ["0", 1.5, "1"].every((x) => parseJudgement(N({ evidence_ids: [x], move: true, summary_ko: "요약." }), sentText, opt).kind === "invalid"));
  check("번호 근거 — 이동인데 빈 배열이면 판정 불가", parseJudgement(N({ evidence_ids: [], move: true, summary_ko: "요약." }), sentText, opt).reason === "이동이라면서 근거가 없다");
  check("번호 근거 — 이동 아님은 빈 배열이어도 받고 근거를 비운다", eq(parseJudgement(N({}), sentText, opt), { kind: "not_move", evidence: null }));
  check("번호 근거 — 이동 아님의 범위 밖 번호는 근거만 버린다(다시 묻지 않는다)", eq(parseJudgement(N({ evidence_ids: [7] }), sentText, opt), { kind: "not_move", evidence: null }));
  check("번호 근거 — 회고(past)는 번호와 무관하게 이동 아님", parseJudgement(N({ evidence_ids: [], move: true, timing: "past" }), sentText, opt).retrospective === true);
  check("번호 근거 — 번호표 없이 번호 근거는 읽지 못한다(판정 불가)", parseJudgement(N({ evidence_ids: [1], move: true, summary_ko: "요약." }), sentText, ALABA).kind === "invalid");
  {
    const s4 = ["A.", "B.", "C.", "D."];
    check("번호 근거 — 서로 다른 번호 4개면 앞 3개만", parseJudgement(N({ evidence_ids: [1, 2, 3, 4], move: true, summary_ko: "요약." }), "x", { ...NO_FIX, player: "X Y", sentences: s4 }).evidence === "A. B. C.");
  }
  check("옛 형식 — evidence 문자열 원출력도 지금처럼 인용 대조로 읽는다(재생 호환)", parseJudgement(J({ move: true, evidence: "reached a verbal agreement with David Alaba", summary_ko: "요약." }), sentText, opt).kind === "move");
  // 금액 — 모델이 옮긴 원문 표기
  const M = "Brighton want 60 million pounds plus add-ons for Yankuba Minteh. Liverpool bid £50m.";
  const fee = (f) => parseJudgement(N({ evidence_ids: [1], move: true, summary_ko: "요약.", fee: f }), M, { ...NO_FIX, player: "Yankuba Minteh", sentences: ["Brighton want 60 million pounds plus add-ons for Yankuba Minteh.", "Liverpool bid £50m."] }).fee;
  check("금액 — 원문 표기(text)가 원문에 그대로 있으면 받는다", eq(fee({ amount: 50, currency: "GBP", kind: "bid", text: "£50m" }), { amount: 50, currency: "GBP", kind: "bid" }));
  check("금액 — ⚠ 표기가 원문에 있어도 읽히는 금액과 어긋나면 받지 않는다(£50m인데 55)", fee({ amount: 55, currency: "GBP", kind: "bid", text: "£50m" }) === null);
  check("금액 — 표기가 원문에 없으면 원문 금액 읽기로 대조한다", eq(fee({ amount: 60, currency: "GBP", kind: "asking_price", text: "£60 million" }), { amount: 60, currency: "GBP", kind: "asking_price" }) && fee({ amount: 70, currency: "GBP", kind: "bid", text: "£70m" }) === null);
}

// ── 저장 — 옛 판정 지키기 · 요약만 다시 받기 · 출력 잘림 · 출처 · 통용 표기 다수결 ─────────
{
  const db = fakeDb();
  const sys = "system";
  const prevMove = { verdict: "move", verdict_player: "david alaba", verdict_stage: "agreement", verdict_to: "Udinese", verdict_attempts: 2, verdict_raw: "{}" };
  const needs = [
    // 판정 불가 + 같은 선수의 옛 판정 → 옛 판정을 지키고 시각·실패 횟수만
    { id: 1, playerKey: "david alaba", player: "David Alaba", body: "Case one. " + BODY, prev: prevMove },
    // 판정 불가 + 다른 선수의 옛 판정 → 판정을 비운다
    { id: 2, playerKey: "david alaba", player: "David Alaba", body: "Case two. " + BODY, prev: { ...prevMove, verdict_player: "someone else" } },
    // 요약만 다시 받기 — 새 답이 단계를 다르게 읽어도 판정은 그대로, 요약만 쓴다
    { id: 3, playerKey: "david alaba", player: "David Alaba", body: "Case three. " + BODY, mode: "summary", prev: prevMove, summary_ko: null },
    // 요약만 다시 받기 실패 — 요약·판정 그대로, 실패 횟수만 +1
    { id: 4, playerKey: "david alaba", player: "David Alaba", body: "Case four. " + BODY, mode: "summary", prev: { ...prevMove, verdict_attempts: 0 }, summary_ko: null },
    // 출력 상한에 잘림 — 옛 판정이 없으면 판정 불가로 비우고 원출력은 남기지 않는다
    { id: 5, playerKey: "david alaba", player: "David Alaba", body: "Case five. " + BODY },
    // 매체 RSS인데 본문을 못 받음 — 본문 글자 수 0
    { id: 6, playerKey: "david alaba", player: "David Alaba", body: "Case six. " + BODY, source_id: "rss:bbc", url: "https://blocked.test/x" },
  ];
  const client = {
    messages: {
      create: async (req) => {
        const body = req.messages[0].content;
        const reply = (text, stop = "end_turn") => ({ stop_reason: stop, content: [{ type: "text", text }], usage: {} });
        if (body.includes("Case one") || body.includes("Case two")) return reply(N({ evidence_ids: [99], move: true, summary_ko: "요약." }));
        if (body.includes("Case three")) return reply(N({ evidence_ids: [2], move: true, stage: "official", to: "Udinese", summary_ko: "David Alaba가 우디네세로 간다." }));
        if (body.includes("Case four")) return reply(N({ evidence_ids: [2], move: false }));
        if (body.includes("Case five")) return reply('{"evidence_ids":[1],"timing":"cur', "max_tokens");
        return reply(N({ evidence_ids: [2], move: true, to: "Udinese", summary_ko: "요약." }));
      },
    },
  };
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => "" });
  const r = await runJudgements(db, needs, { names, corrections: {}, lookup: noLookup, client, fetchImpl, system: sys, config: JUDGE_CONFIGS["s55-adaptive"] });
  const w = (id) => db.writes.find((x) => x.id === id);
  check("옛 판정 지키기 — 같은 선수의 판정이 있으면 판정 불가가 지우지 않는다(시각·실패 횟수만)", eq(Object.keys(w(1)).sort(), ["id", "verdict_at", "verdict_attempts"]) && w(1).verdict_attempts === 3 && r.kept >= 1, JSON.stringify(w(1)));
  check("옛 판정 지키기 — ⚠ 다른 선수의 판정은 지킬 판정이 아니다(비운다)", w(2).verdict === null && w(2).summary_ko === null && w(2).verdict_attempts === 3);
  check("요약만 — 판정 컬럼·원출력은 건드리지 않고 요약·시각만 쓴다(요약 하나 때문에 단계가 흔들리지 않는다)", eq(Object.keys(w(3)).sort(), ["id", "summary_ko", "verdict_at", "verdict_attempts"]) && w(3).summary_ko === "다비드 알라바가 우디네세로 간다." && w(3).verdict_attempts === 0, JSON.stringify(w(3)));
  check("요약만 — 요약을 못 받으면 요약은 그대로 두고 실패 횟수만 +1", eq(Object.keys(w(4)).sort(), ["id", "verdict_at", "verdict_attempts"]) && w(4).verdict_attempts === 1 && r.warnings.some((x) => x.includes("#4 요약 재시도 실패")));
  check("출력 잘림 — 형식 깨짐이 아니라 출력 상한으로 알리고 원출력을 남기지 않는다", w(5).verdict === null && w(5).verdict_raw === null && r.truncated === 1 && r.warnings.some((x) => x.includes("#5") && x.includes("출력 상한")) && !r.warnings.some((x) => x.includes("#5") && x.includes("JSON")));
  check("출처 — 모델은 설정의 모델, 지시문 지문은 그 설정 기준", w(6).verdict_model === "claude-sonnet-5-5" && w(6).verdict_prompt === judgeFingerprint(sys, JUDGE_CONFIGS["s55-adaptive"]) && w(6).verdict_prompt !== judgeFingerprint(sys, JUDGE_CONFIGS["s5-off"]));
  check("출처 — 매체 RSS인데 본문을 못 받으면 0, 본문 소스가 아니면 null", w(6).verdict_article_chars === 0 && w(5).verdict_article_chars === null);
  check("본문 못 받음 — 판정이 성공해도 실패 횟수 +1(파생이 본문 재시도를 센다)", w(6).verdict === "move" && w(6).verdict_attempts === 1);
  check("출처 — 옛 판정을 지킨 행·요약만 받은 행은 출처 컬럼을 바꾸지 않는다", !("verdict_model" in w(1)) && !("verdict_model" in w(3)));
}
{
  // 같은 실행에서 모델이 같은 선수를 갈라 적는다 — 첫 값이 차지하지 않고 다수결로 정한 뒤, 다른 표기로 쓴 요약을 맞춘다
  const db = fakeDb();
  const book = createNameBook({});
  const body = (i) => `Report ${i}: Arsenal have agreed a deal for Joao Silva from Benfica.`;
  const kos = { 1: "조앙 시우바", 2: "주앙 실바", 3: "주앙 실바" };
  const sentBodies = [];
  const client = { messages: { create: async (req) => {
    sentBodies.push(req.messages[0].content);
    const i = Number(req.messages[0].content.match(/Report (\d)/)[1]);
    return { stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: N({ evidence_ids: [1], move: true, stage: "agreement", to: "Arsenal", player_ko: kos[i], summary_ko: `${kos[i]}가 아스날로 간다.` }) }] };
  } } };
  const r = await runJudgements(db, [1, 2, 3].map((i) => ({ id: i, playerKey: "joao silva", player: "Joao Silva", body: body(i) })), { names: book, corrections: {}, lookup: noLookup, client });
  const cached = db.upserts.flatMap((u) => u.rows).filter((x) => x.kind === "player");
  check("다수결 — 통용 표기는 실행 끝에 다수결로 한 번 쓴다(첫 값이 차지하지 않는다)", cached.length === 1 && cached[0].name_ko === "주앙 실바", JSON.stringify(cached));
  check("다수결 — 다른 표기로 쓴 이번 실행의 요약을 확정 표기로 맞춘다(DB와 updates 모두)", db.writes.some((x) => x.id === 1 && x.summary_ko === "주앙 실바가 아스날로 간다." && Object.keys(x).length === 2) && r.updates.find((u) => u.id === 1).summary_ko === "주앙 실바가 아스날로 간다." && r.summariesRenamed === 1, JSON.stringify(r.updates.map((u) => u.summary_ko)));
  check("다수결 — 새 통용 표기를 로그로 남긴다", r.warnings.some((x) => x.includes("신규 통용 표기") && x.includes("주앙 실바")));
  check("다수결 — 요청의 <표기>에 이번 실행의 첫 값을 싣지 않는다(뒤의 답이 첫 값을 따라가지 않게)", sentBodies.length === 3 && sentBodies.every((b) => !b.includes("조앙") && !b.includes("주앙")));
}
{
  // 갈린 표기는 쓰지 않는다
  const db = fakeDb();
  let k = 0;
  const kos = ["마누 코네", "마뉴 코네"];
  const client = { messages: { create: async () => ({ stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: N({ evidence_ids: [1], move: true, to: "Roma", player_ko: kos[k++ % 2], summary_ko: "요약." }) }] }) } };
  const r = await runJudgements(db, [1, 2].map((id) => ({ id, playerKey: "manu kone", player: "Manu Kone", body: `Roma want Manu Kone now ${id}.` })), { names: createNameBook({}), corrections: {}, lookup: noLookup, client });
  check("다수결 — 표기가 반반으로 갈리면 쓰지 않고 경고한다", !db.upserts.some((u) => u.rows.some((x) => x.kind === "player")) && r.warnings.some((x) => x.includes("표기가 갈려") && x.includes("manu kone")));
}
{
  // 요약의 구단은 짧은 이름 — "SK 슈투름 그라츠"가 문장에 그대로 들어가지 않게
  const db = fakeDb();
  const book = createNameBook({ cache: [{ kind: "club", key: "Sturm Graz", name_ko: "SK 슈투름 그라츠", wikidata_id: "Q1", checked_at: "2026-09-25T00:00:00Z" }] });
  const client = { messages: { create: async () => ({ stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: N({ evidence_ids: [1], move: true, from: "Sturm Graz", to: "Arsenal", summary_ko: "아스날이 Sturm Graz의 루카 바인한들을 원한다." }) }] }) } };
  await runJudgements(db, [{ id: 1, playerKey: "luca weinhandl", player: "Luca Weinhandl", body: "Arsenal want Sturm Graz midfielder Luca Weinhandl." }], { names: book, corrections: {}, lookup: noLookup, client });
  check("요약 구단 — 법인 접미를 걷은 짧은 이름으로 바꾼다", db.writes[0].summary_ko === "아스날이 슈투름 그라츠의 루카 바인한들을 원한다.", db.writes[0].summary_ko);
}

// ── 재생 — 저장된 원출력을 지금의 해석으로 다시 읽는다(API 없음) ──
{
  const db = fakeDb();
  const names = createNameBook({ players: { "david alaba": { ko: "다비드 알라바" } } });
  const raw = (o) => JSON.stringify({ move: true, timing: "current", player: "David Alaba", player_ko: null, stage: "agreement", from: "Real Madrid", to: "Udinese", suitors: [], fee: null, evidence: "reached a verbal agreement with David Alaba", summary_ko: "David Alaba가 Udinese와 구두 합의했다.", ...o });
  const stored = (id, extra) => ({ id, body: BODY, source_id: "tg:romano", external_id: `x${id}`, url: null, verdict_at: "2026-09-30T00:00:00.000Z", verdict_player: "david alaba", verdict_suitors: [], ...extra });
  const r = await replayJudgements(db, [
    // 옛 해석으로는 판정 불가였던 행(근거의 순서) — 지금의 해석으로는 이동이다
    stored(1, { verdict: null, verdict_raw: raw({ evidence: "Austrian star leaves Real Madrid ... reached a verbal agreement with David Alaba" }) }),
    // 지금의 해석으로도 같은 값이면 쓰지 않는다
    stored(2, { verdict: "move", verdict_player_name: "David Alaba", verdict_evidence: "reached a verbal agreement with David Alaba", verdict_from: "Real Madrid", verdict_to: "Udinese", verdict_stage: "agreement", summary_ko: "다비드 알라바가 우디네세와 구두 합의했다.", verdict_raw: raw({}) }),
    // 원출력이 없는 행(옛 형식)은 재생 대상이 아니다
    stored(3, { verdict: "move", verdict_raw: null }),
  ], { names, lookup: async () => ({ nameKo: null, wikidataId: null }) });
  check("재생 — 원출력이 있는 행만 다시 읽고, 달라진 행만 쓴다", r.read === 2 && r.changed === 1 && eq(db.writes.map((w) => w.id), [1]), JSON.stringify([r.read, r.changed, db.writes.map((w) => w.id)]));
  check("재생 — 판정 시각은 그대로 두고(새 시도가 아니다) 요약의 이름을 사전 표기로 맞춘다", db.writes[0]?.verdict === "move" && db.writes[0]?.verdict_at === "2026-09-30T00:00:00.000Z" && db.writes[0]?.summary_ko === "다비드 알라바가 우디네세와 구두 합의했다.", JSON.stringify(db.writes[0]));
}

{
  // 새 형식 원출력의 재생 — 원문 지문이 같아야 번호가 같은 문장을 가리킨다
  const db = fakeDb();
  const names = createNameBook({ players: { "david alaba": { ko: "다비드 알라바" } } });
  const print = sourceFingerprint(prepareJudgeInput({ body: BODY }).numbered.text);
  const raw = N({ evidence_ids: [1], move: true, player: "David Alaba", stage: "agreement", to: "Udinese", summary_ko: "David Alaba가 Udinese와 합의했다." });
  const row = (id, extra) => ({ id, body: BODY, source_id: "tg:romano", url: null, verdict_at: "2026-09-30T00:00:00.000Z", verdict_player: "david alaba", verdict_suitors: [], verdict_raw: raw, verdict: null, verdict_input: print, ...extra });
  const r = await replayJudgements(db, [
    row(1, {}),
    // 원문이 바뀌었다(기사가 고쳐졌다) — 번호가 다른 문장을 가리킬 수 있어 건드리지 않는다
    row(2, { verdict_input: "0000000000000000", verdict: "move" }),
    // 지금의 해석으로 판정 불가인데 옛 판정이 있으면 지우지 않는다
    row(3, { verdict: "move", verdict_raw: N({ evidence_ids: [42], move: true, summary_ko: "요약." }) }),
    // 판정 없는 행에 남은 요약은 판정 불가 재생에서 걷는다
    row(4, { verdict: null, summary_ko: "재계약 요약.", verdict_raw: N({ evidence_ids: [], move: true, summary_ko: "요약." }) }),
  ], { names, corrections: {}, lookup: noLookup });
  check("재생(새 형식) — 번호 근거를 같은 원문의 문장으로 읽는다", db.writes.find((w) => w.id === 1)?.verdict_evidence === "Udinese have reached a verbal agreement with David Alaba!" && db.writes.find((w) => w.id === 1)?.summary_ko === "다비드 알라바가 우디네세와 합의했다.", JSON.stringify(db.writes));
  check("재생 — 원문 지문이 다르면 건드리지 않는다", r.inputChanged === 1 && !db.writes.some((w) => w.id === 2));
  check("재생 — 판정 불가로 읽혀도 옛 판정을 지우지 않는다", r.kept === 1 && !db.writes.some((w) => w.id === 3));
  check("재생 — 판정 없는 행에 남은 요약은 걷는다", db.writes.find((w) => w.id === 4)?.summary_ko === null);
  check("재생 — 시도 횟수·출처 컬럼은 쓰지 않는다(새 시도가 아니다)", db.writes.every((w) => !("verdict_attempts" in w) && !("verdict_model" in w)));
}

// ── 일시 실패(시간 초과·연결·서버 오류)는 빠짐없이 다시 묻는다 ───────────────────────
{
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const { isTransientApiError } = await import("./lib/transfer/judge.mjs");
  const timeout = () => new Anthropic.APIConnectionTimeoutError({ message: "Request timed out." });
  const server = () => new Anthropic.InternalServerError(503, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", new Headers());
  const bad = () => new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "messages: too long" } }, "messages: too long", new Headers());
  check("일시 실패 판정 — 시간 초과·5xx는 일시 실패, 400은 아니다", isTransientApiError(timeout()) && isTransientApiError(server()) && !isTransientApiError(bad()) && !isTransientApiError(new Error("x")));
  const OK = N({ evidence_ids: [1], player: "David Alaba", move: true, stage: "agreement", from: "Real Madrid", to: "Udinese", summary_ko: "다비드 알라바가 레알 마드리드를 떠나 우디네세와 구두 합의했다. 자유계약으로 옮기는 것으로 전해졌다." });
  // failures: 보도 id → 그 행이 앞에서부터 겪을 실패 목록
  const flaky = (failures) => {
    const calls = [];
    return { calls, messages: { create: async (req) => {
      const id = Number(/#id(\d+)/u.exec(req.messages[0].content)?.[1]);
      calls.push(id);
      const queue = failures[id] ?? [];
      if (queue.length) throw queue.shift()();
      return { stop_reason: "end_turn", content: [{ type: "text", text: OK }], usage: { input_tokens: 1, output_tokens: 1 } };
    } } };
  };
  const needOf = (id, prev = {}) => ({ id, playerKey: "david alaba", player: "David Alaba", body: `${BODY} #id${id}`, prev: { verdict_attempts: 0, ...prev } });

  // 한 번 시간 초과 → 실행 끝에 다시 물어 판정받는다
  {
    const db = fakeDb();
    const client = flaky({ 1: [timeout] });
    const r = await runJudgements(db, [needOf(1), needOf(2)], { names, corrections: {}, lookup: noLookup, client });
    check("일시 실패 — 시간 초과한 행을 실행 끝에 다시 물어 판정받는다", client.calls.join(",") === "1,2,1" && r.updates.filter((u) => u.verdict === "move").map((u) => u.id).sort().join(",") === "1,2" && r.transient.length === 0 && r.failed === 0, JSON.stringify({ calls: client.calls, transient: r.transient }));
  }
  // 두 번 다 일시 실패 → 이월. 판정한 적 없는 행은 verdict_attempts만 올리고(판정 시각·판정 컬럼은 쓰지 않는다), 옛 판정이 있는 행은 건드리지 않는다
  {
    const db = fakeDb();
    const client = flaky({ 1: [timeout, server], 2: [server, timeout] });
    const r = await runJudgements(db, [needOf(1), needOf(2, { verdict: "move", verdict_player: "david alaba", verdict_at: "2026-09-20T00:00:00Z", verdict_attempts: 1 })], { names, corrections: {}, lookup: noLookup, client });
    const w1 = db.writes.filter((w) => w.id === 1);
    check("일시 실패 — 두 번 다 실패하면 이월하고, 판정 없던 행에 연속 실패 수만 남긴다", r.transient.join(",") === "1,2" && w1.length === 1 && w1[0].verdict_attempts === 1 && !("verdict" in w1[0]) && !("verdict_at" in w1[0]) && !db.writes.some((w) => w.id === 2), JSON.stringify(db.writes));
    check("일시 실패 — 이월한 행을 경고로 알린다", r.warnings.some((w) => w.includes("일시 실패") && w.includes("#1") && w.includes("#2")));
  }
  // 영구 오류(400)는 다시 묻지 않는다 — 같은 요청은 같은 거부를 받는다
  {
    const client = flaky({ 1: [bad] });
    const r = await runJudgements(fakeDb(), [needOf(1)], { names, corrections: {}, lookup: noLookup, client });
    check("영구 오류 — 실행 끝 재시도에 넣지 않는다", client.calls.join(",") === "1" && r.failed === 1 && r.transient.length === 0);
  }
  // 사용 한도로 멈추면 남은 일시 실패 행도 보내지 않고 이월한다
  {
    const limit = () => new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "You have reached your specified API usage limits." } }, "You have reached your specified API usage limits.", new Headers());
    const db = fakeDb();
    const client = flaky({ 1: [timeout], 2: [limit] });
    const r = await runJudgements(db, [needOf(1), needOf(2), needOf(3)], { names, corrections: {}, lookup: noLookup, client });
    check("사용 한도 — 멈춘 뒤에는 일시 실패 행을 다시 보내지 않고 이월한다", client.calls.join(",") === "1,2" && r.transient.join(",") === "1" && db.writes.some((w) => w.id === 1 && w.verdict_attempts === 1));
    check("사용 한도 — 실행 화면 경고용 표지를 남긴다", r.usageLimited === true);
  }
  // 장애 차단기 — 일시 실패가 연달아 나면 남은 행을 보내지 않는다(장애 중에 호출마다 시간 상한을 다 쓰지 않게)
  {
    const db = fakeDb();
    const client = flaky({ 1: [timeout], 2: [timeout], 3: [timeout] });
    const r = await runJudgements(db, [1, 2, 3, 4, 5].map((id) => needOf(id)), { names, corrections: {}, lookup: noLookup, client });
    check("차단기 — 일시 실패 3연속이면 멈추고 실패 행만 이월한다(4·5는 다음 실행이 묻는다)", client.calls.join(",") === "1,2,3" && r.transient.join(",") === "1,2,3" && !db.writes.some((w) => w.id >= 4) && r.warnings.some((w) => w.includes("연달아")), JSON.stringify({ calls: client.calls, t: r.transient }));
  }
  {
    const client = flaky({ 1: [bad], 2: [bad], 3: [bad], 4: [bad], 5: [bad] });
    const r = await runJudgements(fakeDb(), [1, 2, 3, 4, 5, 6, 7].map((id) => needOf(id)), { names, corrections: {}, lookup: noLookup, client });
    check("차단기 — 영구 실패 5연속이면 멈춘다(모델 id·요청 형식 오류)", client.calls.length === 5 && r.failStreakStopped === true);
  }
  // 시간 예산 — 다 쓰면 남은 행을 묻지 않는다
  {
    let t = 0;
    const client = flaky({});
    const r = await runJudgements(fakeDb(), [1, 2, 3].map((id) => needOf(id)), { names, corrections: {}, lookup: noLookup, client, timeBudgetMs: 1000, now: () => (t += 600) });
    check("시간 예산 — 예산을 넘기면 남은 행은 다음 실행으로", client.calls.join(",") === "1" && r.warnings.some((w) => w.includes("시간 예산")), client.calls.join(","));
  }
  // 저장 실패 — 판정 시각·실패 횟수만이라도 남겨 매시 다시 물리지 않게 한다
  {
    const writes = [];
    let first = true;
    const db = { writes, from: () => ({
      update: (v) => ({ eq: async (_c, id) => { if (first && "verdict" in v) { first = false; return { error: { message: "violates check constraint" } }; } writes.push({ id, ...v }); return { error: null }; } }),
      upsert: async () => ({ error: null }),
    }) };
    const r = await runJudgements(db, [needOf(1)], { names, corrections: {}, lookup: noLookup, client: flaky({}) });
    check("저장 실패 — 시각·실패 횟수만 남긴다", r.failed === 1 && writes.length === 1 && writes[0].verdict_attempts === 1 && typeof writes[0].verdict_at === "string" && !("verdict" in writes[0]), JSON.stringify(writes));
  }
  // 본문 재시도 — 또 못 받으면 묻지 않고 시각·횟수만 올린다(옛 판정을 지킨다)
  {
    const db = fakeDb();
    const client = flaky({});
    const need = { ...needOf(1, { verdict: "move", verdict_player: "david alaba", verdict_at: "2026-09-20T00:00:00Z", verdict_attempts: 1, verdict_article_chars: 0 }), mode: "article", source_id: "rss:fl-arsenal", url: "https://www.football.london/a" };
    const r = await runJudgements(db, [need], { names, corrections: {}, lookup: noLookup, client, fetchImpl: async () => ({ ok: false, status: 403, text: async () => "" }) });
    check("본문 재시도 — 본문을 또 못 받으면 API를 부르지 않는다", client.calls.length === 0 && db.writes.length === 1 && db.writes[0].verdict_attempts === 2 && !("verdict" in db.writes[0]) && r.articleSkipped === 1, JSON.stringify(db.writes));
  }
  // 기사 본문 — 일시 실패(시간 초과·5xx·429)는 한 번 더 받고, 403·404는 다시 받지 않는다
  {
    const html = '<html><script type="application/ld+json">{"articleBody":"Arsenal agree fee for John Doe."}</script></html>';
    const seq = (...steps) => { let i = 0; const f = async () => { const s = steps[Math.min(i, steps.length - 1)]; i += 1; if (s === "throw") throw new Error("timeout"); return { ok: s === 200, status: s, text: async () => html }; }; f.count = () => i; return f; };
    const t1 = seq("throw", 200);
    check("본문 — 시간 초과 뒤 한 번 더 받는다", (await fetchArticleText("https://x.test/a", t1, { retryDelayMs: 0 })) === "Arsenal agree fee for John Doe." && t1.count() === 2);
    const t2 = seq(503, 200);
    check("본문 — 5xx 뒤 한 번 더 받는다", (await fetchArticleText("https://x.test/a", t2, { retryDelayMs: 0 })) !== "" && t2.count() === 2);
    const t3 = seq(404, 200);
    check("본문 — 404는 다시 받지 않는다", (await fetchArticleText("https://x.test/a", t3, { retryDelayMs: 0 })) === "" && t3.count() === 1);
    const t4 = seq("throw", "throw", 200);
    check("본문 — 다시 받기는 한 번뿐이다(그다음은 발췌로 판정하고 파생이 본문 재시도를 맡는다)", (await fetchArticleText("https://x.test/a", t4, { retryDelayMs: 0 })) === "" && t4.count() === 2);
  }
}

check("요약 — 문장 끝 뒤의 JSON 꼬리를 걷는다", judgeSummary("첼시는 내년 여름 재도전을 고려하고 있다.”}, ", {}).text === "첼시는 내년 여름 재도전을 고려하고 있다.", JSON.stringify(judgeSummary("첼시는 내년 여름 재도전을 고려하고 있다.”}, ", {})));
check("요약 — 본문에 괄호가 섞이면 버린다(다시 묻는다)", Boolean(judgeSummary('첼시가 {"move": true} 영입을 노린다.', {}).reason));
check("요약 — 괄호 없는 정상 요약은 그대로", judgeSummary("아스날이 £60m 제안을 했다. 협상은 이어지고 있다.", {}).text === "아스날이 £60m 제안을 했다. 협상은 이어지고 있다.");

check("요약 — 금액 단위 낱말을 기호로 접는다(€45million·£64 million → €45m·£64m)", judgeSummary("평가액은 €45million, 제안은 £64 million이었다. 요구액은 €1.2billion이다.", {}).text === "평가액은 €45m, 제안은 £64m이었다. 요구액은 €1.2bn이다.", judgeSummary("평가액은 €45million, 제안은 £64 million이었다. 요구액은 €1.2billion이다.", {}).text);
{
  const { detectClubs } = await import("./lib/transfer/clubs.mjs");
  const clubKo = (raw) => ({ "Sporting CP": "스포르팅 CP", "West Bromwich Albion": "웨스트 브로미치" })[detectClubs(raw)[0]] ?? null;
  const out = localizeSummary("Sporting CP 소속 곤살루 이나시우를 두고 €40m 제안을 Sporting이 수락했다. David Alaba와 City는 그대로.", { clubKo });
  check("요약 — 원출력 구단 칸 밖의 영문 구단명도 사전으로 풀리면 한국어로", out === "스포르팅 CP 소속 곤살루 이나시우를 두고 €40m 제안을 스포르팅 CP이 수락했다. David Alaba와 City는 그대로.", out);
}

{
  const { stripMetaSentences } = await import("./lib/transfer/judge.mjs");
  check("요약 — 원문을 두고 하는 문장(\"원문에는 … 나와 있지 않다\")을 걷는다", stripMetaSentences("알라바가 우디네세와 합의했다. 원문 제목에는 이적료나 계약 기간은 나와 있지 않다.") === "알라바가 우디네세와 합의했다.");
  check("요약 — 쉼표 뒤 메타 절은 걷고 앞 절을 맺는다", stripMetaSentences("맨유로 돌아가지 않을 수 있다는 분석이 나왔고, 금액은 언급되지 않았다.") === "맨유로 돌아가지 않을 수 있다는 분석이 나왔다.");
  check("요약 — 비공개 이적료·다른 정보가 섞인 절은 남긴다", stripMetaSentences("이적료는 공개되지 않았다. 특정 구단은 언급되지 않았고, 레알은 제외한다고 밝혔다.") === "이적료는 공개되지 않았다. 특정 구단은 언급되지 않았고, 레알은 제외한다고 밝혔다.");
  check("요약 — 전부 메타 문장이면 원래 글을 둔다(검증이 판단한다)", stripMetaSentences("원문에는 정보가 없다.") === "원문에는 정보가 없다.");
  check("요약 — \"기사에 따르면\"으로 시작하는 본문 문장은 남긴다", stripMetaSentences("BBC 기사에 따르면 첼시가 제안을 했다. 금액은 £40m이다.") === "BBC 기사에 따르면 첼시가 제안을 했다. 금액은 £40m이다.");
  check("요약 — 보도된 사실(\"공식 발표는 아직 나오지 않았다\")은 남긴다", stripMetaSentences("첼시가 합의에 이르렀다. 공식 발표는 아직 나오지 않았다.") === "첼시가 합의에 이르렀다. 공식 발표는 아직 나오지 않았다.");
  check("요약 — 사실 절(\"…합의했고, 공식 발표는 아직 나오지 않았다\")도 남긴다", stripMetaSentences("첼시가 합의했고, 공식 발표는 아직 나오지 않았다.") === "첼시가 합의했고, 공식 발표는 아직 나오지 않았다.");
  check("요약 — 주어가 기사인 \"나오지 않았다\"는 걷는다", stripMetaSentences("첼시가 합의했다. 기사에는 금액이 나오지 않았다.") === "첼시가 합의했다.");
}
{
  const { detectClubs } = await import("./lib/transfer/clubs.mjs");
  const clubKo = (raw) => ({ Everton: "에버턴", Bologna: "볼로냐" })[detectClubs(raw)[0]] ?? null;
  const out = localizeSummary("첼시가 Everton Soares 영입에 나섰다. Bologna Rangers와 Everton도 관심.", { clubKo });
  check("요약 — 구단 이름을 품은 다른 구절(선수 이름)은 바꾸지 않는다", out === "첼시가 Everton Soares 영입에 나섰다. Bologna Rangers와 에버턴도 관심.", out);
}
{
  const r = parseJudgement(N({ evidence_ids: [1], player: "Сергей Иванов", move: true, stage: "rumour", to: "Chelsea", summary_ko: "첼시가 관심을 보였다." }), "Chelsea are interested in Сергей Иванов of Zenit.", { corrections: {}, player: null, names: createNameBook({}), sentences: ["Chelsea are interested in Сергей Иванов of Zenit."] });
  check("판정 — 딜 키를 만들 수 없는 이름(키릴 문자)은 선수 미특정으로 접는다", r.kind === "not_move" && r.unnamed === true, JSON.stringify(r));
}
{
  const { resolveClubs } = await import("./lib/transfer/judge.mjs");
  let lookups = 0;
  const lookup = async () => { lookups += 1; return { wikidataId: "Q1", nameKo: "가짜 FC" }; };
  const cacheRows = [];
  const book = createNameBook({});
  await resolveClubs({ from: "Fakeclub United", to: null, suitors: [] }, book, { lookup, cacheRows });
  await resolveClubs({ from: null, to: "Fakeclub United", suitors: [] }, book, { lookup, cacheRows });
  check("구단 확인 — 같은 실행에서 같은 이름은 한 번만 찾고 한 행만 쌓는다", lookups === 1 && cacheRows.length === 1, JSON.stringify({ lookups, n: cacheRows.length }));
}

console.log(`\nLLM 판정 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);

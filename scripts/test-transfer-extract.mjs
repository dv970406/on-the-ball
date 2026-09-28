/**
 * 추출 규칙 회귀 테스트 — 실제 수집 문장에서 발견한 오분류를 못박는다.
 *
 *   node scripts/test-transfer-extract.mjs
 *
 * ⚠ 규칙(`scripts/lib/transfer/extract.mjs`)을 고쳤으면 이걸 먼저 돌리고, 통과하면
 *   `node scripts/sync-transfer-news.mjs --reprocess`로 저장분을 다시 추출한다.
 * ⚠ 예: 로마노의 확정 트윗은 "never in doubt and now done"으로 끝나는데 `/in doubt/`로
 *   단순 매칭하면 HERE WE GO 확정 건이 '무산'으로 뒤집힌다(크롤러에서 실제로 났다).
 */
import { extractTransfer } from "./lib/transfer/extract.mjs";
import { existsSync, readFileSync } from "node:fs";
import { detectClubs, isKnownClub } from "./lib/transfer/clubs.mjs";
import { clubDisplay, presetClubs } from "./lib/transfer/club-display.mjs";
import { normalizePlayer } from "./lib/transfer/derive-deals.mjs";
import { SOURCES } from "./lib/transfer/registry.mjs";

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

const CASES = [
  { expect: "agreement",      text: "🚨 EXCLUSIVE: Aston Villa reach agreement in principle to sign Ibrahim Mbaye from Paris Saint-Germain. #AVFC move for 18yo #PSG winger in process of being finalised: €55m. Nasser Al-Khelaifi & Nassef Sawiris relationship key to closing deal" },
  { expect: "medical",        text: "🚨 Liverpool complete agreement with Paris Saint-Germain to sign Bradley Barcola. Deal for 23yo #PSG winger worth £106m + up to £17m add-ons (€125m + €20m package). France int'l poised to do medical in next 24hr & join #LFC on 5yr contract" },
  { expect: "collapsed",      text: "Crystal Palace’s move for Joel Ordonez is in serious doubt due to an injury sustained by the Club Brugge centre-back." },
  { expect: "official",       text: "Manchester City have announced the signing of Ayyoub Bouaddi from Lille." },
  { expect: "talks",          text: "Nottingham Forest are in advanced talks with Spanish club Celta Vigo over a deal for winger Jhon Duran." },
  { expect: "offer",          text: "🚨 EXCL: Nottingham Forest submit offer to sign Daniel Munoz from Crystal Palace. Proposal for 30yo right wing-back" },
  { expect: "agreement",      text: "🚨 AC Milan accept €45m bid from Galatasaray for Rafael Leao; 27yo attacker offered €10-12m net salary" },
  { expect: "official",       text: "🚨 Ezri Konsa completes move from Aston Villa to Arsenal. Fee £42m" },
  { expect: "agreement",      text: "🚨 BREAKING: Chelsea reach agreement with Aston Villa to sign Emi Martinez. Permanent deal for 33yo #AVFC goalkeeper" },
  { expect: "rumour",         text: "Manchester City are interested in a move for Everton forward Iliman Ndiaye." },
  // "in agreement with"은 의견 동의 · "not interested in"은 관심이 아니다(운영에서 딜이 됐다)
  { expect: "unknown",        text: "Alan Shearer in agreement with Thomas Tuchel after brutal Cole Palmer blast" },
  // 지난 이적설의 회고는 단계가 아니다(운영 — 코치가 "여름에 관심이 있었다"고 인정한 기사가 루머 딜이 됐다)
  { expect: "unknown",        text: "Vinicius Jr to Arsenal truth emerges after Mikel Arteta secrecy as assistant coach speaks out\n\nArsenal's silence regarding their interest in Vinicius Junior has finally broken after Mikel Arteta's assistant admits the Brazilian was a target in the summer" },
  { expect: "unknown",        text: "Manchester United miss transfer chance as £86m decision made\n\nManchester United were linked with a move for Roma star Manu Kone during the summer transfer window" },
  { expect: "unknown",        text: "Liverpool came close to signing the midfielder last season before talks collapsed over the fee." },
  // 회고가 곁들여져도 지금의 움직임은 그대로 잡는다 — 회고 절만 뺀다
  { expect: "offer",          text: "Arsenal, who were linked with him last summer, have now made an offer for Alexander Isak." },
  { expect: "talks",          text: "Chelsea nearly signed him two years ago but are now in talks again with Bayern." },
  { expect: "rumour",         text: "Arsenal are interested in the striker, who could move in the summer." },
  { expect: "official",       text: "Chelsea have announced the signing of Jamie Gittens, who impressed on loan last season." },
  // 가십 칼럼 항목 문형 — 금액이 낀 입찰 의향은 루머, 지난 창의 거절은 회고다(지금 이야기는 남는다)
  { expect: "rumour",         text: "Bayern Munich are prepared to make a £69m bid for Barcelona and Spain forward Dani Olmo, 28. (Sport)" },
  { expect: "rumour",         text: "AS Roma are expected to double their asking price for Chelsea target Manu Kone, 25, to £86m in January after the Blues reportedly rejected a chance to sign the France midfielder for £43m in the summer. (Gazzetta)" },
  { expect: "collapsed",      text: "Real Madrid rejected a £90m bid from Chelsea for the midfielder on Monday." },
  // 가십 칼럼의 어휘 — 주시·추적·문의·배제·판매 거부
  { expect: "rumour",         text: "Aston Villa attacking midfielder John Doe is being monitored by clubs in La Liga. (AS)" },
  { expect: "rumour",         text: "Arsenal and Chelsea are chasing Feyenoord midfielder Jack Roe, 22. (Caught Offside)" },
  { expect: "rumour",         text: "Liverpool and Aston Villa are among the clubs tracking Fiorentina's Italy midfielder Tom Poe, 22. (Caught Offside)" },
  { expect: "rumour",         text: "Brazil winger John Doe is frustrated at Chelsea, and Barcelona are keeping tabs on the 19-year-old's situation. (Sport)" },
  { expect: "offer",          text: "Real Madrid and Barcelona have made fresh enquiries about American teenager John Doe, 16. (Athletic)" },
  { expect: "talks",          text: "John Doe's agent has held talks with multiple Premier League clubs over a potential move. (Football Insider)" },
  { expect: "collapsed",      text: "Barcelona have ruled out signing Argentina forward John Doe from Atletico Madrid in January. (Sport)" },
  { expect: "collapsed",      text: "Arsenal have no intention of selling 27-year-old Spanish midfielder John Doe in January. (Football Insider)" },
  { expect: "collapsed",      text: "Tottenham will not pursue a move to sign 33-year-old striker John Doe, who is a free agent. (Football Insider)" },
  // 입단 테스트는 이적 완료가 아니다(운영 — 전지훈련 합류가 오피셜 딜이 됐다). 계약까지 했으면 오피셜이다
  { expect: "rumour",         text: "Former Rangers winger John Doe has joined Hibernian at their training camp in La Manga as the 26-year-old looks to win a contract after his release. (Record)" },
  { expect: "official",       text: "Hibernian have confirmed John Doe has joined on a contract until the end of the season after a trial." },
  // 넓힌 어휘가 이적이 아닌 문장을 잡지 않는다
  { expect: "unknown",        text: "Harry Kane has been ruled out for six weeks with an ankle injury." },
  { expect: "unknown",        text: "‘I love football; I’m not interested in politics’ – Rayan Cherki on dreaming to win the Ballon d’Or" },
  { expect: "agreement",      text: "German club RB Leipzig are close to reaching an agreement in principle with Chelsea for the transfer of striker Marc Guiu." },
  { expect: "unknown",        text: "🚨 James Maddison suffered slight fracture to shoulder after landing awkwardly. Out for around four weeks." },
  // ── 실제 수집 데이터에서 발견한 오분류 회귀 테스트 ──
  { expect: "here_we_go",     text: "RT @FabrizioRomano: 🚨💣 BREAKING: Liverpool reach verbal agreement to sign Bradley Barcola, HERE WE GO! 🔴 Initial fee worth £100m plus add-ons — up to €140m possible total package for PSG. #LFC get their top target: never in doubt and now done." },
  { expect: "collapsed",      text: "Ordonez's move to Palace in doubt after medical. Club Brugge defender Joel Ordonez's move to Crystal Palace runs into complications after his medical." },
  { expect: "collapsed",      text: "🚨 BREAKING : Atletico Madrid statement: the club will not negotiate Julian Alvarez's transfer to Barcelona. No talks, no consideration of a deal" },
  { expect: "collapsed",      text: "Tottenham reject Danso loan move to Sunderland. Tottenham Hotspur reject a season-long loan offer from Sunderland." },
  { expect: "talks",          text: "🚨 EXCL: Nottingham Forest working on deal to sign Harrison Armstrong from Everton." },
  { expect: "agreement",      text: "Liverpool agree £123m deal for PSG's Barcola. Liverpool agree a deal worth up to £123m for Paris St-Germain forward." },
  { expect: "personal_terms", text: "🚨🇦🇷 Enzo Fernández has a verbal agreement with Manchester City on personal terms. Deal depends on club to club talks." },
  { expect: "official",       text: "❤️🖤👋🏽 Rafa Leão confirms his move to Galatasaray: \u201cI am leaving tomorrow, I will always look at Milan.\u201d" },
  { expect: "agreement",      text: "🚨🔴⚪️ AS Monaco have reached verbal agreement for Mexican midfielder Gilberto Mora." },
  // "확정 전"을 말하는 here we go — 문구만 보면 확정으로 뒤집힌다(온더볼 수집 글에서 발견)
  { expect: "agreement",      text: "🚨⚪️⚫️ EXCLUSIVE: Udinese have reached a verbal agreement with David Alaba! Austrian star, a dream signing for the Italian club with a verbal agreement in place with former Real Madrid defender. Formal steps needed ahead of the here we go." },
  { expect: "agreement",      text: "Deal agreed between clubs, here we go expected soon once documents are signed." },
  { expect: "here_we_go",     text: "🚨⚪️⚫️ David Alaba to Udinese, exclusive story confirmed and here we go! One year deal until June 2027." },
  // 글머리 "Official," — 로마노의 공식 발표 형식(온더볼 수집 글에서 unknown으로 빠졌다)
  { expect: "official",       text: "⚪️⚫️🇦🇹 Official, exclusive story confirmed. David Alaba joins Udinese on one year deal after leaving Real Madrid as free agent." },
  { expect: "talks",          text: "Chelsea are in advanced talks with Benfica over Enzo Fernandez; nothing is official yet." },
  // here we go 부정 문맥 — 따옴표·줄바꿈이 끼거나 "곧/예정"이 뒤따르면 확정이 아니다
  { expect: "agreement",      text: "Chelsea agreement done. Formal steps needed ahead of the “here we go”." },
  { expect: "agreement",      text: "Chelsea agreement done. Formal steps needed ahead of\nthe here we go." },
  { expect: "agreement",      text: "Agreement done, here we go could come very soon for Chelsea." },
  { expect: "here_we_go",     text: "Liverpool and Barcola, here we go yet again!" },
  // 공식 발표지만 이적이 아니다
  { expect: "unknown",        text: "Official: Cole Palmer signs new contract extension until 2033." },
  { expect: "unknown",        text: "🚨Official: Aggie Beever-Jones has signed a new deal at Chelsea." },
  { expect: "unknown",        text: "OFFICIAL: Chelsea v Arsenal postponed." },
  { expect: "official",       text: "RT @FabrizioRomano: Official, Nico Jackson joins Aston Villa from Chelsea." },
];

// ── 이적료 오탐 회귀 테스트 (실제 수집 데이터에서 발견) ──
const FEE_CASES = [
  { expectFee: null, why: "구단 지분 매각 기업가치", text: "🚨 Todd Boehly and Mark Walter in talks to sell #CFC shares to Clearlake. Pair's enterprise value is £5bn." },
  { expectFee: null, why: "여름 총지출",             text: "Liverpool's season started with the death of Diogo Jota. They spent £449m on new signings but went backwards." },
  { expectFee: null, why: "스쿼드 총액",             text: "Aston Villa's squad is crumbling while Spurs splash out. Their combined squad cost is £322m. Are the financial rules fair?" },
  { expectFee: null, why: "주급(단위 없음)",         text: "The 27yo attacker was offered €250,000 per week to move." },
  { expectFee: 125,  why: "총 패키지 = 최대값 채택", text: "Deal worth £106m + up to £17m add-ons (€125m + €20m package)." },
  { expectFee: 55,   why: "단일 이적료",             text: "Aston Villa reach agreement in principle to sign Ibrahim Mbaye: €55m." },
  // 주급·옵션이 이적료로 세어지지 않는다 — 추출 규칙(WAGE_RE·ADD_ON_RE)과 같은 소스를 쓴다
  { expectFee: null, why: "주급(m 단위여도 -a-week)", text: "Wolves offered him £1m-a-week." },
  { expectFee: 60,   why: "주급 문장 옆의 이적료는 산다", text: "Alexander Isak has agreed a £250,000-a-week contract. Newcastle accept £60m." },
  { expectFee: null, why: "옵션만 있는 문장",          text: "Chelsea agree deal for the winger plus €5m in add-ons." },
  { expectFee: 40,   why: "이적료 + 옵션",            text: "Chelsea agree £40m plus £8m in add-ons for the winger." },
];

// ── 주급·옵션 추출 (실제 수집 문장 + 로마노 문형) ──
// ⚠ 정밀도 우선 — 오탐 케이스(단위 없음·연봉·금액 없는 옵션 언급)가 null이어야 한다
const WAGE_CASES = [
  { wage: "€250k", text: "The 27yo attacker was offered €250,000 per week to move." },
  { wage: "£250k", text: "Alexander Isak has agreed a £250,000-a-week contract with Liverpool." },
  { wage: "£300k", text: "Salah's new deal is worth £300k-a-week." },
  { wage: "£150k", text: "Personal terms agreed: £150k a week over five years." },
  { wage: "€200k", text: "He will earn €200k weekly in Riyadh." },
  { wage: "£250k", text: "£250k-a-week offer, up from £180k-a-week — the first one is the new proposal." },
  { wage: null, text: "The 27yo attacker offered €10-12m net salary." },
  { wage: null, text: "He earns £20m per season at Al Hilal." },
  { wage: null, text: "Youth deal worth £250 a week." },
  { wage: null, text: "Chelsea's wage bill is £400m." },
];
const ADD_ON_CASES = [
  { addOn: 17, cur: "GBP", text: "Deal worth £106m + up to £17m add-ons (€125m + €20m package)." },
  { addOn: 5, cur: "EUR", text: "€55m plus €5m in bonuses." },
  { addOn: 10, cur: "EUR", text: "Fee €50m + €10m add-ons." },
  { addOn: 8, cur: "GBP", text: "£60m plus £8m in variables." },
  { addOn: 2.5, cur: "EUR", text: "€30m plus €2.5m in add-ons." },
  { addOn: null, cur: null, text: "Initial fee worth £100m plus add-ons — up to €140m possible total package." },
  { addOn: null, cur: null, text: "€125m + €20m package." },
];
let extraPass = 0;
console.log("── 주급·옵션 추출 테스트");
for (const c of WAGE_CASES) {
  const got = extractTransfer(c.text).wageText;
  const ok = got === c.wage;
  if (ok) extraPass++;
  else console.log(`❌ 주급 기대 ${c.wage} 실제 ${got} — ${c.text}`);
}
for (const c of ADD_ON_CASES) {
  const r = extractTransfer(c.text);
  const ok = r.addOnAmount === c.addOn && r.addOnCurrency === c.cur;
  if (ok) extraPass++;
  else console.log(`❌ 옵션 기대 ${c.addOn} ${c.cur} 실제 ${r.addOnAmount} ${r.addOnCurrency} — ${c.text}`);
}
const extraTotal = WAGE_CASES.length + ADD_ON_CASES.length;
console.log(`주급·옵션 ${extraPass}/${extraTotal} 통과\n`);

// ── 선수 앵커 (확장분 + 오탐) ──
// 잡힌 선수는 딜 키가 된다 — 오탐이 곧 보드의 거짓 딜이다. 대문자 매체명·구단명·요일·행사명은 선수가 아니다.
const PLAYER_CASES = [
  { players: ["David Alaba"], text: "🚨⚪️⚫️ David Alaba to Udinese, exclusive story confirmed and here we go!" },
  { players: ["Nico Jackson"], text: "Nico Jackson to Aston Villa from Chelsea, here we go" },
  { players: ["Morgan Gibbs-White", "Nico Williams"], text: "Spurs target Morgan Gibbs-White in January. Arsenal's top target Nico Williams." },
  { players: ["Marc Guiu"], text: "Marc Guiu's move to Sunderland is done." },
  { players: ["Marc Guiu"], text: "Waiting for Marc Guiu's signing." },
  { players: ["David Alaba"], text: "David Alaba arrives for medical tests and contract signing next at Udinese." },
  { players: ["Michail Antonio"], text: "Watford confirm Michail Antonio has joined." },
  // BBC의 비분리 하이픈(U+2011) — 이름이 "Morgan Gibbs"에서 잘리지 않는다
  { players: ["Morgan Gibbs‑White"], text: "Spurs could move for Morgan Gibbs‑White, JJ Gabriel's next step remains unresolved" },
  // 오탐
  { players: [], text: "Fabrizio Romano confirms Liverpool’s £47m agreement to sign South American star" },
  { players: [], text: "Liverpool to Anfield on Monday to Friday." },
  { players: [], text: "Everything you need to know ahead of Transfer Deadline Day." },
  { players: [], text: "Sky Sports to Chelsea: no comment. Monday's gossip to Arsenal." },
  { players: [], text: "Real Madrid to Barcelona: nothing." },
  { players: [], text: "Manchester United target Premier League title." },
  { players: [], text: "Arsenal confirm Champions League fixture." },
  { players: [], text: "The Athletic to Liverpool: sources say no." },
  { players: [], text: "Wednesday's gossip to Tottenham Hotspur." },
  { players: [], text: "Yahoo Sports's move to Chelsea." },
  // ── 유명 선수 999명 시뮬레이션·운영 데이터 대조에서 나온 사례 ──
  // 악센트 대문자로 시작하는 토큰([A-Z]로는 통째로 빠졌다)
  { players: ["Ángel Di María"], text: "Juventus complete the signing of Ángel Di María from Benfica." },
  { players: ["Martin Ødegaard"], text: "Arsenal have submitted an opening bid for Martin Ødegaard." },
  // 소문자 조사(van·de·dos)
  { players: ["Virgil van Dijk"], text: "Virgil van Dijk joins Real Madrid on a five-year deal." },
  { players: ["Giovani dos Santos"], text: "Chelsea are in advanced talks to sign Giovani dos Santos." },
  // 악센트 없이 쓴 이름이 국적 형용사와 같은 철자다(German Pezzella)
  { players: ["German Pezzella"], text: "Chelsea complete the signing of German Pezzella from Arsenal." },
  // 이름에 구단명 토큰이 있다(Milan)
  { players: ["Milan Škriniar"], text: "Paris Saint-Germain agree personal terms with Milan Škriniar." },
  // 타이틀 케이스 헤드라인
  { players: ["Kylian Mbappé"], text: "Real Madrid Agree £50m Deal To Sign Kylian Mbappé" },
  { players: ["Kylian Mbappé"], text: "Kylian Mbappé Completes Move To Real Madrid" },
  { players: ["Jadon Sancho"], text: "Man United Winger Jadon Sancho Completes Move To Chelsea" },
  // 새 문형: terms with · medical
  { players: ["Dani Olmo"], text: "Barcelona have agreed personal terms with Dani Olmo." },
  { players: ["Dani Olmo"], text: "Dani Olmo is undergoing a medical at Barcelona ahead of his £40m move." },
  // 소유격 소속("Bournemouth's Alex Scott")은 걷는다
  { players: ["Alex Scott"], text: "Chelsea target Bournemouth's Alex Scott." },
  // "as free agent"는 역할(에이전트)이 아니다
  { players: ["David Alaba"], text: "David Alaba joins Udinese on one year deal after leaving Real Madrid as free agent." },
  // 뒤의 역할어가 다른 사람(아르테타)의 것이다
  { players: ["Vinicius Jr"], text: "Vinicius Jr to Arsenal truth emerges after Mikel Arteta secrecy as assistant coach speaks out" },
  // 오탐 — 수식어("… star/striker/winner")
  { players: [], text: "Liverpool reach agreement to sign Eastern European striker for £40m." },
  { players: [], text: "Tottenham complete signing of World Cup winner." },
  { players: [], text: "Chelsea Agree Deal To Sign Star Striker" },
  { players: [], text: "Arsenal Agree Deal To Sign Free Agent" },
  { players: [], text: "Juventus Agree Deal To Sign North American Midfielder" },
  // 오탐 — 선수가 아닌 사람(감독·단장·구단주·정치인·바이라인)
  { players: [], text: "Real Madrid target Jürgen Klopp to replace the sacked boss." },
  { players: [], text: "Richard Hughes joins Bayern Munich as sporting director." },
  { players: [], text: "Mikel Arteta agrees new contract to extend stay as Arsenal manager" },
  { players: [], text: "Canadian PM Mark Carney arrives at Hill Dickinson Stadium for tonight's game" },
  { players: [], text: "SempreMilan Podcast By: Oliver Fisher Join Oli, Anthony and Bdair as they rant" },
  // 오탐 — 한 토큰(흔한 이름)은 사람 사전에 없으면 특정하지 않는다
  { players: [], text: "Chelsea complete signing of Joao from Benfica." },
  // 오탐 — 타이틀 케이스 덩어리의 경계를 알 수 없다 / 장소 / 본문의 대문자 버튼 문구
  { players: [], text: "Medical At Old Trafford As Chelsea Agree Deal" },
  { players: [], text: "Madrid, Mourinho and the fight for neutrality in row with Javier Tebas Sign up now! Sign up now?" },
  // 오탐 — 구단 표기(사전 밖 하부 리그 구단·2군·약칭 포함)
  { players: [], text: "Man United complete deal for prospect from Liverpool - Yahoo Sports Man United complete deal for prospect" },
  // 헤드라인·본문이 붙은 원문 — 앞 덩어리("Ings Wycombe Wanderers")는 버리고 본문의 선수를 잡는다
  { players: ["Danny Ings"], text: "Wycombe sign ex-England striker Ings Wycombe Wanderers sign former Burnley striker Danny Ings." },
  { players: [], text: "Official: Tommaso Mancioppi extends contract with Milan Futuro By: Oliver Fisher" },
  { players: [], text: "Harry Kane confirms new deal talks with FC Bayern are advancing." },
  // 오탐 — "in agreement with"은 의견 동의다(대표팀 소집 논평이 투헬의 합의 딜이 됐다)
  { players: [], text: "Alan Shearer in agreement with Thomas Tuchel after brutal Cole Palmer blast" },
  // 가십 항목 끝의 출처 신문 괄호는 선수가 아니다
  { players: ["Tomas Araujo"], text: "Bayern Munich are keen on Benfica's 24-year-old Portugal defender Tomas Araujo. (Bild)" },
  { players: ["Ibrahim Maza"], text: "Arsenal and Tottenham are monitoring Bayer Leverkusen's Algeria midfielder Ibrahim Maza, 20. (Teamtalk)" },
  // 가십 칼럼의 소개 문형 — 나이·국적 수식 뒤 이름, 이름 뒤 나이 동격
  { players: ["Mauro Coronel"], text: "Brighton and Aston Villa are both interested in signing Nacional's 18-year-old Paraguay Under-20 defender Mauro Coronel. (Teamtalk)" },
  { players: ["Paul Wanner"], text: "Liverpool, Bayern Munich and Real Madrid are all interested in PSV Eindhoven's 20-year-old Austrian international Paul Wanner. (Caught Offside)" },
  { players: ["Alex Scott", "Adam Wharton"], text: "Bournemouth's Alex Scott, 23, and Crystal Palace and England's Adam Wharton, 22, are Chelsea's primary midfield targets. (Telegraph)" },
  // 동격 나이 앞이 구단·연도면 사람이 아니다
  { players: [], text: "Real Madrid, 1902, is the oldest club in the league and Chelsea, 20 points clear, lead the table." },
  // 오탐 — 부정("not interested in")은 관심 표현이 아니다
  { players: [], text: "‘I love football; I’m not interested in politics’ – Rayan Cherki on dreaming to win the Ballon d’Or" },
  // 오탐 — "to" 뒤 구단은 바로 뒤여야 한다(뒤쪽의 Roma를 잡았다)
  { players: [], text: "Spence Returns to Group Training but Misses Roma Trip" },
  // 루머 동사 뒤 이름
  { players: ["Rayan Cherki"], text: "Arsenal are interested in Rayan Cherki." },
];
let playerPass = 0;
for (const c of PLAYER_CASES) {
  const got = extractTransfer(c.text).players;
  const ok = got.length === c.players.length && c.players.every((p) => got.includes(p));
  if (ok) playerPass++;
  else console.log(`❌ 선수 ${JSON.stringify(got)} (기대 ${JSON.stringify(c.players)}) — ${c.text}`);
}
console.log(`선수 앵커 ${playerPass}/${PLAYER_CASES.length} 통과\n`);

let feePass = 0;
console.log("── 이적료 오탐 테스트");
for (const c of FEE_CASES) {
  const got = extractTransfer(c.text).feeAmount;
  const ok = got === c.expectFee;
  if (ok) feePass++;
  console.log(`${ok ? "✅" : "❌"} 기대 ${String(c.expectFee).padEnd(5)} 실제 ${String(got).padEnd(5)} (${c.why})`);
}
console.log(`이적료 ${feePass}/${FEE_CASES.length} 통과\n`);

let pass = 0;
for (const c of CASES) {
  const r = extractTransfer(c.text);
  const ok = r.stage === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} stage=${r.stage.padEnd(15)} (기대 ${c.expect.padEnd(15)}) rel=${r.relevance.toFixed(2)}`);
  console.log(`     선수=${JSON.stringify(r.players)} 구단=${JSON.stringify(r.clubs)} 이적료=${r.feeText ?? "-"}${r.feeAmount ? ` (${r.feeAmount}m ${r.feeCurrency})` : ""}`);
}
console.log(`\n단계 판정 ${pass}/${CASES.length} 통과`);
if (pass !== CASES.length || feePass !== FEE_CASES.length || extraPass !== extraTotal || playerPass !== PLAYER_CASES.length) process.exit(1);

// ── 운영 JSON 형식 ───────────────────────────────────────────────────────
// 파생기·화면이 같은 파일을 읽는다 — 형식이 틀리면 화면이 CHECK에 걸린 값을 그리거나 사전이 조용히 안 맞는다.
let jsonBad = 0;
const bad = (m) => { jsonBad++; console.log(`❌ ${m}`); };

// players-ko.json — 키는 normalizePlayer 결과, 값은 DB CHECK 범위(position ≤20 · birthYear 1950~2015 · nationality ^[A-Z]{3}$)
const players = readJson("./lib/transfer/players-ko.json");
for (const [key, v] of Object.entries(players)) {
  if (key.startsWith("_")) continue;
  if (normalizePlayer(key) !== key) bad(`players-ko.json 키 "${key}"가 정규형이 아니다(→ "${normalizePlayer(key)}")`);
  if (typeof v?.ko !== "string" || !v.ko.trim() || [...v.ko].length > 120) bad(`players-ko.json "${key}": ko가 없거나 120자를 넘는다`);
  if (v.position != null && (typeof v.position !== "string" || !v.position.trim() || [...v.position].length > 20)) bad(`players-ko.json "${key}": position 형식`);
  if (v.birthYear != null && !(Number.isInteger(v.birthYear) && v.birthYear >= 1950 && v.birthYear <= 2015)) bad(`players-ko.json "${key}": birthYear 범위`);
  if (v.nationality != null && !/^[A-Z]{3}$/.test(v.nationality)) bad(`players-ko.json "${key}": nationality 형식`);
  const extra = Object.keys(v).filter((k) => !["ko", "position", "birthYear", "nationality"].includes(k));
  if (extra.length) bad(`players-ko.json "${key}": 모르는 필드 ${extra.join(", ")}`);
}

// windows.json — 창마다 5대 리그 전부 · 리그마다 opensAt < closesAt(ISO) · 창은 시간순(합친 기간 기준)
// ⚠ 리그 키는 프리셋의 리그 이름과 같아야 한다 — 화면의 리그 필터·구단 리그가 같은 글자를 쓴다
const LEAGUES = [...new Set(presetClubs().map((name) => clubDisplay(name).league))].sort();
const windows = readJson("./lib/transfer/windows.json").windows;
if (!Array.isArray(windows) || !windows.length) bad("windows.json: windows 배열이 비었다");
let prevOpen = -Infinity;
for (const [i, w] of (windows ?? []).entries()) {
  if (!w.key || !w.label || typeof w.leagues !== "object") { bad(`windows.json[${i}]: key·label·leagues 형식`); continue; }
  const keys = Object.keys(w.leagues).sort();
  if (JSON.stringify(keys) !== JSON.stringify(LEAGUES)) bad(`windows.json[${i}] ${w.key}: 리그가 프리셋과 다르다 — ${keys.join(",")} ≠ ${LEAGUES.join(",")}`);
  for (const [lg, lw] of Object.entries(w.leagues)) {
    const o = Date.parse(lw.opensAt), c = Date.parse(lw.closesAt);
    if (Number.isNaN(o) || Number.isNaN(c) || !/Z$/.test(lw.opensAt) || !/Z$/.test(lw.closesAt)) bad(`windows.json ${w.key}/${lg}: UTC ISO(Z) 형식`);
    else if (o >= c) bad(`windows.json ${w.key}/${lg}: opensAt가 closesAt보다 늦다`);
  }
  const open = Math.min(...Object.values(w.leagues).map((lw) => Date.parse(lw.opensAt)));
  if (open <= prevOpen) bad(`windows.json[${i}] ${w.key}: 시간순이 아니다`);
  prevOpen = open;
}

// glossary-ko.json — 사람이 고친 표기·용어. 값은 한글을 담아야 하고, 구단 키는 구단 사전의 정규명이어야 한다
// (모르는 키는 아무 데서도 쓰이지 않는다). 5대 리그 구단은 프리셋이 갖으므로 여기 적지 않는다(적어도 프리셋이 이긴다).
const glossary = readJson("./lib/transfer/glossary-ko.json");
for (const [en, ko] of Object.entries(glossary.clubs ?? {})) {
  if (typeof ko !== "string" || !/[가-힣]/.test(ko)) bad(`glossary-ko.json clubs["${en}"]: 한글 표기가 아니다`);
  if (!isKnownClub(en)) bad(`glossary-ko.json clubs["${en}"]: 구단 사전(clubs.mjs)의 정규명이 아니다`);
  if (clubDisplay(en).league) bad(`glossary-ko.json clubs["${en}"]: 5대 리그 구단은 club-presets.json이 갖는다`);
}
for (const [en, ko] of Object.entries(glossary.terms ?? {})) {
  if (!/[a-z]/i.test(en) || /[가-힣]/.test(en)) bad(`glossary-ko.json terms["${en}"]: 키는 영문 용어`);
  if (typeof ko !== "string" || !/[가-힣]/.test(ko)) bad(`glossary-ko.json terms["${en}"]: 한글 표기가 아니다`);
}
for (const [wrong, right] of Object.entries(glossary.corrections ?? {})) {
  if (wrong.startsWith("_")) continue;
  if (!/[가-힣]/.test(wrong) || typeof right !== "string" || !/[가-힣]/.test(right) || right.includes(wrong)) {
    bad(`glossary-ko.json corrections["${wrong}"]: 한국어 → 한국어이고 바른 말이 틀린 말을 품지 않아야 한다(교정이 되풀이된다)`);
  }
}

// reporters.json credibility — 매체는 소스 id(registry)로, 기자는 보도 주체 표기로 매긴다. 값은 "medal" 또는 1~5
{
  const rep = readJson("./lib/transfer/reporters.json");
  const cred = rep.credibility ?? {};
  const names = new Set([...Object.values(rep.journalists), ...Object.values(rep.sources), ...Object.values(rep.bylines ?? {})]);
  for (const [id, v] of Object.entries(cred.outlets ?? {})) {
    if (!SOURCES.some((s) => s.id === id)) bad(`reporters.json credibility.outlets["${id}"]는 registry에 없는 소스다`);
    if (v !== "medal" && !(Number.isInteger(v) && v >= 1 && v <= 5)) bad(`reporters.json credibility.outlets["${id}"]: "medal" 또는 1~5`);
  }
  for (const [name, v] of Object.entries(cred.journalists ?? {})) {
    if (!names.has(name)) bad(`reporters.json credibility.journalists["${name}"]: journalists·sources에 없는 보도 주체 표기다(아무 보도에도 붙지 않는다)`);
    if (!(Number.isInteger(v) && v >= 1 && v <= 5)) bad(`reporters.json credibility.journalists["${name}"]: 1~5`);
  }
}

// reporters.json — outlets는 registry.mjs의 label과 양방향으로 같아야 한다(소스를 더하거나 빼면 여기도 고친다)
const reporters = readJson("./lib/transfer/reporters.json");
for (const s of SOURCES) if (reporters.outlets[s.id] !== s.label) bad(`reporters.json outlets["${s.id}"]가 registry label("${s.label}")과 다르다`);
for (const id of Object.keys(reporters.outlets)) if (!SOURCES.some((s) => s.id === id)) bad(`reporters.json outlets["${id}"]는 registry에 없는 소스다`);
for (const id of Object.keys(reporters.sources)) if (!SOURCES.some((s) => s.id === id)) bad(`reporters.json sources["${id}"]는 registry에 없는 소스다`);
for (const [k, v] of [...Object.entries(reporters.journalists), ...Object.entries(reporters.sources)]) {
  if (typeof v !== "string" || !v.trim()) bad(`reporters.json "${k}": 표기가 비었다`);
}
console.log(`운영 JSON(players-ko·windows·reporters) ${jsonBad ? `${jsonBad}건 문제` : "정합"}`);
if (jsonBad) process.exit(1);

// ── 구단 프리셋 정합성 ──────────────────────────────────────────────────
// 프리셋(club-presets.json) · 구단 사전(clubs.mjs) · 엠블럼 파일(public/crests) 셋이 맞아야 한다.
// ⚠ 사전에 없는 이름은 원문에서 **절대 잡히지 않아** 프리셋이 죽은 값이 된다.
let presetBad = 0;
for (const name of presetClubs()) {
  const d = clubDisplay(name);
  const problems = [];
  if (!isKnownClub(name)) problems.push("구단 사전(clubs.mjs)에 없음");
  if (!d.crest || !existsSync(new URL(`../public${d.crest}`, import.meta.url))) problems.push(`엠블럼 없음(${d.crest})`);
  if (d.name === name) problems.push("한국어 표기 없음");
  if (problems.length) {
    presetBad++;
    console.log(`❌ 프리셋 ${name}: ${problems.join(", ")}`);
  }
}
console.log(`구단 프리셋 ${presetClubs().length - presetBad}/${presetClubs().length} 정합`);
if (presetBad) process.exit(1);

// ── 구단 오탐 ───────────────────────────────────────────────────────────
// 잡힌 구단은 글에서 한국어명·엠블럼으로 표시된다 — 오탐이 곧 사용자에게 보이는 거짓 표기다.
const CLUB_CASES = [
  { text: "Messi extends with Inter Miami until 2028.", expect: ["Inter Miami"] },
  { text: "Queens Park Rangers loan Kim from Celtic.", expect: ["Queens Park Rangers", "Celtic"] },
  { text: "Atletico Mineiro sign striker from Santos.", expect: ["Atletico Mineiro"] },
  { text: "Deportivo Alaves reach agreement with Real Madrid.", expect: ["Alaves", "Real Madrid"] },
  { text: "Deportivo Cali sign winger.", expect: ["Deportivo Cali"] },
  { text: "El director deportivo del club habló.", expect: [] },
  { text: "Real Madrid, como siempre, spurs no one.", expect: ["Real Madrid"] },
  { text: "Chelsea loan Rio Ngumoha to #FCBayern.", expect: ["Chelsea"] },
  { text: "Chelsea Women sign Kim from Arsenal Women.", expect: [] },
  { text: "Olympique Lyonnais and Stade Rennais agree deal.", expect: ["Lyon", "Rennes"] },
];
let clubPass = 0;
for (const c of CLUB_CASES) {
  const got = detectClubs(c.text);
  const ok = got.length === c.expect.length && c.expect.every((n) => got.includes(n));
  if (ok) clubPass++;
  else console.log(`❌ 구단 ${JSON.stringify(got)} (기대 ${JSON.stringify(c.expect)}) — ${c.text}`);
}
console.log(`구단 판정 ${clubPass}/${CLUB_CASES.length} 통과`);
if (clubPass !== CLUB_CASES.length) process.exit(1);

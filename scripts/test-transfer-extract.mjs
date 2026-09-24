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
import { existsSync } from "node:fs";
import { detectClubs, isKnownClub } from "./lib/transfer/clubs.mjs";
import { clubDisplay, presetClubs } from "./lib/transfer/club-display.mjs";

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
];

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
if (pass !== CASES.length || feePass !== FEE_CASES.length) process.exit(1);

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

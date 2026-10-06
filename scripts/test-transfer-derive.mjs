/**
 * 딜 파생(`scripts/lib/transfer/derive-deals.mjs`) 회귀 테스트 — DB 없이 합성 행으로 돈다.
 *
 *   node scripts/test-transfer-derive.mjs
 *
 * 픽스처 행 배열 → 파생 결과를 **정확 일치**로 본다. 규칙(계획서 §2-2)을 고치면 이걸 먼저 돌린다.
 */
import { createNameBook } from "./lib/transfer/names-ko.mjs";
import { isRoundup } from "./lib/transfer/story.mjs";
import { boardScopeStartMs, clubRecord, createExtractMemo, dealKey, dedupeRows, deriveDeals, derivationStartMs, normalizePlayer, windowSpan } from "./lib/transfer/derive-deals.mjs";

const NOW = Date.parse("2026-09-25T00:00:00Z");
const WINDOWS = [
  { key: "2026-summer", label: "2026 여름", opensAt: "2026-06-01T00:00:00Z", closesAt: "2026-09-01T18:00:00Z" },
  { key: "2027-winter", label: "2027 겨울", opensAt: "2027-01-01T00:00:00Z", closesAt: "2027-02-01T19:00:00Z" },
];
const DICT = { "john doe": { ko: "존 도", position: "ST", birthYear: 2001, nationality: "ENG" }, doe: { ko: "도" } };

let n = 0;
const row = (body, extra = {}) => ({
  id: ++n,
  source_id: "tg:romano",
  stage: "agreement",
  players: ["John Doe"],
  relevance: 0.8,
  // 행마다 하루씩 뒤 — 케이스를 가로질러 n이 커지므로 날짜 산술로 만든다("2026-08-32"가 되면 NaN이라 전부 범위 밖이 된다)
  published_at: new Date(Date.UTC(2026, 6, 1) + n * 86_400_000).toISOString(),
  body,
  ...extra,
});
const derive = (rows) => deriveDeals(rows, { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT }) });
const pick = (d, keys) => Object.fromEntries(keys.map((k) => [k, d[k]]));

const CASES = [
  {
    name: "방향 투표 — from(소속)·joins(행선지), 최신 행 2배 가중",
    rows: [
      row("Chelsea in talks for John Doe from Benfica.", { stage: "talks" }),
      row("John Doe joins Chelsea from Benfica. Deal agreed.", { stage: "agreement" }),
    ],
    expect: (r) => pick(r.deals[0], ["from_club_code", "to_club_code", "stage", "report_count"]),
    want: { from_club_code: "benfica", to_club_code: "chelsea", stage: "agreement", report_count: 2 },
  },
  {
    name: "문장 주어 + 확정 동사(confirm)가 행선지다",
    rows: [row("Arsenal confirm John Doe has joined from Real Madrid.", { stage: "official" })],
    expect: (r) => pick(r.deals[0], ["from_club_code", "to_club_code", "stage"]),
    want: { from_club_code: "real-madrid", to_club_code: "arsenal", stage: "official" },
  },
  {
    name: "자유계약 — 그 선수 문장에 free agent가 있으면 FA",
    rows: [row("John Doe joins Chelsea as a free agent after leaving Benfica.", { stage: "official" })],
    expect: (r) => pick(r.deals[0], ["is_free_agent", "fee_amount"]),
    want: { is_free_agent: true, fee_amount: null },
  },
  {
    name: "자유계약 — on a free / free transfer도 확인 표현이다",
    rows: [row("Chelsea sign John Doe on a free.", { stage: "official" }), row("John Doe completes free transfer to Chelsea.", { stage: "official" })],
    expect: (r) => r.deals[0].is_free_agent,
    want: true,
  },
  {
    name: "이적료가 비었다고 FA가 아니다 — 금액이 보도되지 않은 루머(행선지는 LLM이 읽었다)",
    rows: [row("Chelsea interested in John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_to: "Chelsea" })],
    expect: (r) => pick(r.deals[0], ["is_free_agent", "fee_amount"]),
    want: { is_free_agent: false, fee_amount: null },
  },
  {
    name: "이적료가 확인되면 FA가 아니다(DB CHECK) — free agent 언급이 섞여도",
    rows: [row("John Doe joins Chelsea for €30m. He had been linked as a free agent option earlier.", { stage: "official" })],
    expect: (r) => r.deals[0].is_free_agent,
    want: false,
  },
  {
    name: "다른 선수의 자유계약은 세지 않는다 — 그 선수가 나오는 문장만 본다",
    rows: [row("Official: Chelsea confirm John Doe has joined from Benfica. Separately, Richard Roe leaves Porto as a free agent.", { stage: "official", players: ["John Doe", "Richard Roe"] })],
    expect: (r) => r.deals.find((d) => d.player === "John Doe")?.is_free_agent,
    want: false,
  },
  {
    name: "첫 프로 계약은 이적이 아니다 — 소속·행선지가 없고 재계약 표현이면 딜을 만들지 않는다",
    rows: [row("Official: John Doe signs first professional contract with the club.", { stage: "official" })],
    expect: (r) => r.deals.length,
    want: 0,
  },
  {
    name: "무산 보도가 진전 보도보다 나중이면 무산",
    rows: [
      row("Chelsea agree deal for John Doe.", { stage: "agreement" }),
      row("John Doe deal with Chelsea has collapsed.", { stage: "collapsed" }),
    ],
    expect: (r) => r.deals[0].stage,
    want: "collapsed",
  },
  {
    name: "무산 뒤에 다시 진전이 오면 그 진전이 대표 단계다",
    rows: [
      row("John Doe deal with Chelsea has collapsed.", { stage: "collapsed" }),
      row("Chelsea reach agreement for John Doe after all.", { stage: "agreement" }),
    ],
    expect: (r) => r.deals[0].stage,
    want: "agreement",
  },
  (() => {
    // 결과 시각(settled_at) — 합의 완료 → 결렬 → 다시 합의 완료면 **되살아난 뒤의** 합의 완료 시각이다
    const rows = [
      row("John Doe to Chelsea, here we go.", { stage: "here_we_go" }),
      row("John Doe deal with Chelsea has collapsed.", { stage: "collapsed" }),
      row("John Doe to Chelsea, here we go again.", { stage: "here_we_go" }),
      row("Official: John Doe joins Chelsea.", { stage: "official" }),
    ];
    return {
      name: "settled_at — 결렬 뒤 되살아난 딜은 되살아난 뒤 첫 합의 완료 보도의 시각",
      rows,
      expect: (r) => pick(r.deals[0], ["stage", "settled_at"]),
      want: { stage: "official", settled_at: rows[2].published_at },
    };
  })(),
  (() => {
    const rows = [
      row("Official: John Doe joins Chelsea.", { stage: "official" }),
      row("John Doe move to Chelsea in doubt.", { stage: "collapsed" }),
    ];
    return {
      name: "settled_at — 오피셜 뒤의 결렬 보도는 단계도 결과 시각도 바꾸지 못한다",
      rows,
      expect: (r) => pick(r.deals[0], ["stage", "settled_at"]),
      want: { stage: "official", settled_at: rows[0].published_at },
    };
  })(),
  {
    name: "settled_at — 결과가 정해지지 않은 딜(루머·협상)은 null",
    rows: [row("Chelsea agree deal for John Doe from Benfica.", { stage: "agreement" })],
    expect: (r) => r.deals[0].settled_at,
    want: null,
  },
  {
    name: "부인 — 루머만 있다가 부인 보도가 오면 부인(denied)",
    rows: [
      row("Chelsea agree deal for John Doe.", { stage: "rumour" }),
      row("Chelsea have no plans to sell John Doe despite the links.", { stage: "denied" }),
    ],
    expect: (r) => r.deals[0].stage,
    want: "denied",
  },
  {
    name: "결렬 — 협상 이상까지 갔다가 부인 문형이 오면 결렬(이력이 문형을 이긴다)",
    rows: [
      row("Chelsea agree deal for John Doe.", { stage: "talks" }),
      row("Chelsea will not pursue John Doe any further.", { stage: "denied" }),
    ],
    expect: (r) => r.deals[0].stage,
    want: "collapsed",
  },
  {
    name: "부인 보도 하나뿐이면 부인, 결렬 보도 하나뿐이면 결렬",
    rows: [row("Chelsea agree deal for John Doe. Chelsea have no intention of selling.", { stage: "denied" })],
    expect: (r) => [r.deals[0].stage, derive([row("John Doe deal with Chelsea has collapsed. Chelsea agree deal for John Doe.", { stage: "collapsed" })]).deals[0].stage],
    want: ["denied", "collapsed"],
  },
  {
    name: "루머 뒤 결렬 문형(collapsed)은 결렬로 남는다 — 우리가 못 본 협상이 있었다는 말이다",
    rows: [
      row("Chelsea agree deal for John Doe.", { stage: "rumour" }),
      row("John Doe deal with Chelsea has collapsed.", { stage: "collapsed" }),
    ],
    expect: (r) => r.deals[0].stage,
    want: "collapsed",
  },
  {
    name: "규칙이 결렬로 읽은 완료 문장(rejected offers … to join)은 LLM 단계가 official이면 오피셜이다",
    rows: [row("John Doe rejected offers from Italy and Germany to join Chelsea for £60m.", { stage: "collapsed", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_stage: "official", verdict_to: "Chelsea", summary_ko: "요약" })],
    expect: (r) => r.deals[0].stage,
    want: "official",
  },
  {
    name: "단계 — 그 선수에 대한 LLM 판정이 있으면 규칙 단계(결렬)가 아니라 판정의 단계(협상)다(판정자는 전문을, 규칙은 발췌를 읽는다)",
    rows: [row("John Doe deal with Chelsea has collapsed. Chelsea agree deal for John Doe.", { stage: "collapsed", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_stage: "talks", summary_ko: "요약" })],
    expect: (r) => r.deals[0].stage,
    want: "talks",
  },
  {
    name: "단계 — 재계약 합의 제목을 규칙이 agreement로 읽어도 판정이 부인이면 부인이다(운영: 케인 '합의 임박')",
    rows: [row("John Doe makes feelings clear on Chelsea return as agreement 'close'. John Doe moved to Bayern from Chelsea three years ago.", { stage: "agreement", players: [], verdict: "move", verdict_player: "john doe", verdict_player_name: "John Doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Bayern Munich", verdict_stage: "denied", summary_ko: "요약" })],
    expect: (r) => [r.deals[0]?.stage, r.deals[0]?.from_club_code, r.deals[0]?.to_club_code],
    want: ["denied", "bayern-munchen", null],
  },
  {
    name: "방향 — 같은 구단이 양쪽에 오면 표가 많은 쪽만 믿는다(LLM 출발 8표 vs 규칙의 약한 행선지 문형 'at X' 1표 → 출발)",
    rows: [row("John Doe is settled at Bayern and has no plans to leave.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Bayern Munich", verdict_stage: "denied", summary_ko: "요약" })],
    expect: (r) => [r.deals[0]?.from_club_code, r.deals[0]?.to_club_code],
    want: ["bayern-munchen", null],
  },
  {
    name: "방향 — 동률이면 둘 다 버린다(전과 같다)",
    rows: [row("John Doe signs for Chelsea. John Doe's parent club Chelsea want him back.", { stage: "rumour" })],
    expect: (r) => r.deals[0] ? [r.deals[0].from_club_code, r.deals[0].to_club_code] : r.skipped,
    want: { "구단 미확인": 1 },
  },
  {
    name: "단계 — 판정이 아직 없는 행은 규칙 단계다(판정이 오면 다음 파생이 바꾼다)",
    rows: [row("Chelsea agree deal for John Doe from Benfica.", { stage: "agreement" })],
    expect: (r) => r.deals[0].stage,
    want: "agreement",
  },
  {
    name: "공식 발표는 그 뒤 어떤 보도도 뒤집지 않는다",
    rows: [
      row("Official: John Doe joins Chelsea.", { stage: "official" }),
      row("John Doe move to Chelsea in doubt.", { stage: "collapsed" }),
    ],
    expect: (r) => r.deals[0].stage,
    want: "official",
  },
  {
    name: "이적료 — 최신값·직전 다른 값(prev)·범위(low/high). 같은 금액 반복은 prev가 아니다",
    rows: [
      row("Chelsea bid €40m for John Doe.", { stage: "offer" }),
      row("Chelsea raise bid to €50m for John Doe.", { stage: "offer" }),
      row("Chelsea agree €55m fee for John Doe.", { stage: "agreement" }),
      row("Chelsea agree €55m fee for John Doe, confirmed.", { stage: "agreement" }),
    ],
    expect: (r) => pick(r.deals[0], ["fee_amount", "fee_currency", "fee_text", "prev_fee_amount", "fee_low_amount", "fee_high_amount"]),
    want: { fee_amount: 55, fee_currency: "EUR", fee_text: "€55m", prev_fee_amount: 50, fee_low_amount: 40, fee_high_amount: 55 },
  },
  {
    name: "통화가 섞이면 최신 통화만 센다(prev·범위 모두)",
    rows: [
      row("Chelsea bid £30m for John Doe.", { stage: "offer" }),
      row("Chelsea bid €45m for John Doe.", { stage: "offer" }),
      row("Chelsea agree €50m fee for John Doe.", { stage: "agreement" }),
    ],
    expect: (r) => pick(r.deals[0], ["fee_amount", "fee_currency", "prev_fee_amount", "fee_low_amount", "fee_high_amount"]),
    want: { fee_amount: 50, fee_currency: "EUR", prev_fee_amount: 45, fee_low_amount: 45, fee_high_amount: 50 },
  },
  {
    name: "이적료가 없으면 파생 칸(prev·범위·옵션)도 전부 null이다(DB CHECK)",
    rows: [row("Chelsea agree deal for John Doe plus €5m in add-ons.", { stage: "agreement" })],
    expect: (r) => pick(r.deals[0], ["fee_amount", "prev_fee_amount", "fee_low_amount", "fee_high_amount", "add_on_amount"]),
    want: { fee_amount: null, prev_fee_amount: null, fee_low_amount: null, fee_high_amount: null, add_on_amount: null },
  },
  {
    name: "옵션·주급·계약 — 최신 행부터 거슬러 처음 잡히는 값. 옵션은 이적료와 같은 통화일 때만",
    rows: [
      row("Chelsea agree £40m plus £8m in add-ons for John Doe on a £150,000-a-week deal.", { stage: "agreement" }),
      row("John Doe joins Chelsea for €50m + up to €10m add-ons. Five-year contract until June 2031.", { stage: "official" }),
    ],
    expect: (r) => pick(r.deals[0], ["fee_amount", "fee_currency", "add_on_amount", "wage_text", "contract_text"]),
    want: { fee_amount: 50, fee_currency: "EUR", add_on_amount: 10, wage_text: "£150k", contract_text: "2031.06" },
  },
  {
    name: "계약 — 만료가 없으면 기간(년)",
    rows: [row("John Doe joins Chelsea on a three-year deal.", { stage: "official" })],
    expect: (r) => r.deals[0].contract_text,
    want: "3년",
  },
  {
    name: "한 토큰 이름은 같은 범위의 두 토큰 이름(마지막 토큰 일치)으로 합친다",
    rows: [
      row("Chelsea in talks for John Doe.", { stage: "talks", players: ["John Doe"] }),
      row("Doe joins Chelsea, here we go.", { stage: "here_we_go", players: ["Doe"] }),
    ],
    expect: (r) => ({ deals: r.deals.length, ...pick(r.deals[0], ["player", "stage", "report_count"]), key: r.deals[0].deal_key === dealKey("john doe") }),
    want: { deals: 1, player: "John Doe", stage: "here_we_go", report_count: 2, key: true },
  },
  {
    name: "사람 사전의 한 토큰 이름은 첫 토큰이 같은 두 토큰 이름과도 합친다(Doe ↔ Doe Willian — 브라질식 한 이름)",
    rows: [
      row("Chelsea agree deal for Doe Willian.", { stage: "agreement", players: ["Doe Willian"] }),
      row("Doe joins Chelsea, here we go.", { stage: "here_we_go", players: ["Doe"] }),
    ],
    expect: (r) => ({ deals: r.deals.length, player: r.deals[0]?.player, reports: r.deals[0]?.report_count }),
    want: { deals: 1, player: "Doe Willian", reports: 2 },
  },
  {
    name: "사전에 없는 한 토큰 이름은 첫 토큰이 같아도 합치지 않는다",
    rows: [
      row("Chelsea agree deal for Roe Willian.", { stage: "agreement", players: ["Roe Willian"] }),
      row("Roe joins Chelsea, here we go.", { stage: "here_we_go", players: ["Roe"] }),
    ],
    expect: (r) => r.deals.map((d) => d.player).sort(),
    want: ["Roe", "Roe Willian"],
  },
  {
    name: "두 토큰 이름끼리는 합치지 않는다(동성이인) — 그리고 성이 같은 두 토큰 이름이 여럿이면 한 토큰 이름도 합치지 않는다",
    rows: [
      row("Chelsea agree deal for John Doe.", { stage: "talks", players: ["John Doe"] }),
      row("Arsenal agree deal for Jane Doe.", { stage: "talks", players: ["Jane Doe"] }),
      row("Doe joins Chelsea.", { stage: "official", players: ["Doe"] }),
    ],
    expect: (r) => r.deals.map((d) => d.player).sort(),
    want: ["Doe", "Jane Doe", "John Doe"],
  },
  {
    name: "가십 모음(bbc-gossip · 첫 줄 gossip)은 후보가 아니다",
    rows: [
      row("Chelsea eye John Doe - Monday's gossip", { stage: "rumour", source_id: "rss:bbc-gossip" }),
      row("Chelsea eye John Doe - Tuesday's gossip\nmore", { stage: "rumour", source_id: "rss:bbc-football" }),
    ],
    expect: (r) => ({ deals: r.deals.length, skipped: r.skipped["가십 모음"] }),
    want: { deals: 0, skipped: 2 },
  },
  {
    name: "관련성 미달(< 0.3)·단계 없음·선수 없음은 후보가 아니다",
    rows: [
      row("Chelsea eye John Doe.", { stage: "rumour", relevance: 0.25 }),
      row("John Doe scored twice.", { stage: "unknown" }),
      row("Chelsea sign someone.", { players: [] }),
    ],
    expect: (r) => ({ deals: r.deals.length, ...r.skipped }),
    want: { deals: 0, "관련성 미달": 1, "단계 없음": 1, "선수 없음": 1 },
  },
  {
    name: "범위 시작(마지막 개장 창 opensAt − 14일) 이전 보도는 후보가 아니다",
    rows: [
      row("Chelsea agree deal for John Doe.", { stage: "rumour", published_at: "2026-05-17T23:59:59Z" }),
      row("Chelsea agree deal for John Doe again.", { stage: "rumour", published_at: "2026-05-18T00:00:00Z" }),
    ],
    expect: (r) => ({ deals: r.deals.length, reports: r.deals[0]?.report_count, skipped: r.skipped["범위 밖"], start: new Date(r.startMs).toISOString() }),
    want: { deals: 1, reports: 1, skipped: 1, start: "2026-05-18T00:00:00.000Z" },
  },
  {
    name: "다선수 기사는 그 선수가 나오는 문장으로만 단계·구단을 다시 판정한다(기사 단계 medical은 곁들여 나온 선수의 것) — 딜은 players[0]만 만든다",
    rows: [row("John Doe in talks over a move to Udinese. Juventus complete medical for Jane Roe from Benfica.", { stage: "medical", players: ["John Doe", "Jane Roe"] })],
    expect: (r) => r.deals.map((d) => pick(d, ["player", "stage", "from_club_code", "to_club_code"])),
    want: [{ player: "John Doe", stage: "talks", from_club_code: null, to_club_code: "udinese" }],
  },
  {
    name: "사전에 있으면 한국어·포지션·생년·국적, 없으면 null + 경고",
    rows: [row("Chelsea sign John Doe.", { stage: "official" }), row("Arsenal sign Jane Roe.", { stage: "official", players: ["Jane Roe"] })],
    expect: (r) => ({
      doe: pick(r.deals.find((d) => d.player === "John Doe"), ["player_ko", "position", "birth_year", "nationality"]),
      roe: pick(r.deals.find((d) => d.player === "Jane Roe"), ["player_ko", "position", "birth_year", "nationality"]),
      warned: r.warnings.some((w) => w.includes("Jane Roe")) && !r.warnings.some((w) => w.includes("John Doe")),
    }),
    want: { doe: { player_ko: "존 도", position: "ST", birth_year: 2001, nationality: "ENG" }, roe: { player_ko: null, position: null, birth_year: null, nationality: null }, warned: true },
  },
  {
    name: "자유 계약 — 'leaving X as free agent'가 소속(from)이 된다",
    rows: [row("Official: John Doe joins Udinese after leaving Real Madrid as free agent.", { stage: "official" })],
    expect: (r) => pick(r.deals[0], ["from_club_code", "to_club_code"]),
    want: { from_club_code: "real-madrid", to_club_code: "udinese" },
  },
  {
    name: "구단을 하나도 못 읽으면 딜을 만들지 않는다 — 어디서 어디로 가는지 모르는 이적설은 보드에 싣지 않는다",
    rows: [row("John Doe agrees terms. Deal done. Chelsea watching.", { stage: "agreement" })],
    expect: (r) => ({ deals: r.deals.length, skipped: r.skipped["구단 미확인"] }),
    want: { deals: 0, skipped: 1 },
  },
  {
    name: "LLM이 읽은 출발·행선지(verdict_from·verdict_to)로 방향을 채운다 — 규칙이 못 읽은 문장",
    rows: [row("John Doe agrees terms with the club. Deal done.", { stage: "agreement", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Benfica", verdict_to: "Chelsea" })],
    expect: (r) => pick(r.deals[0], ["from_club_code", "to_club_code"]),
    want: { from_club_code: "benfica", to_club_code: "chelsea" },
  },
  {
    name: "LLM의 표가 규칙의 확실한 문형보다 크다 — 같은 행에서 규칙은 Benfica, LLM은 Porto",
    rows: [row("Chelsea in talks for John Doe from Benfica.", { stage: "talks", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Porto", verdict_to: "Chelsea" })],
    expect: (r) => pick(r.deals[0], ["from_club_code", "to_club_code"]),
    want: { from_club_code: "porto", to_club_code: "chelsea" },
  },
  {
    name: "다른 선수에 대한 LLM 판정의 구단은 세지 않는다 — 구단이 하나도 남지 않아 5대 리그 관문에서 빠진다",
    rows: [row("John Doe agrees terms with the club.", { stage: "agreement", verdict: "move", verdict_player: "jane roe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Benfica", verdict_to: "Chelsea" })],
    expect: (r) => ({ deals: r.deals.length, skipped: r.skipped["5대 리그 밖"] }),
    want: { deals: 0, skipped: 1 },
  },
  {
    name: "5대 리그 밖 → 5대 리그 밖은 딜이 아니다(알힐랄 ← 갈라타사라이)",
    rows: [row("John Doe joins Al Hilal from Galatasaray.", { stage: "official" })],
    expect: (r) => ({ deals: r.deals.length, skipped: r.skipped["5대 리그 밖"] }),
    want: { deals: 0, skipped: 1 },
  },
  {
    name: "5대 리그 → 5대 리그 밖은 딜이다(아스날 → 알힐랄) — 프리셋 밖 구단은 slugify 코드",
    rows: [row("John Doe joins Al Hilal from Arsenal.", { stage: "official" })],
    expect: (r) => pick(r.deals[0], ["from_club_code", "to_club_code"]),
    want: { from_club_code: "arsenal", to_club_code: "al-hilal" },
  },
  {
    name: "5대 리그 밖 → 5대 리그도 딜이다(갈라타사라이 → 아스날)",
    rows: [row("John Doe joins Arsenal from Galatasaray.", { stage: "official" })],
    expect: (r) => pick(r.deals[0], ["from_club_code", "to_club_code"]),
    want: { from_club_code: "galatasaray", to_club_code: "arsenal" },
  },
  {
    name: "5대 리그 구단이 스쳐도 방향에 없으면 딜이 아니다(첼시가 언급됐지만 알힐랄 ← 갈라타사라이)",
    rows: [row("Chelsea-linked John Doe joins Al Hilal from Galatasaray.", { stage: "official" })],
    expect: (r) => ({ deals: r.deals.length, skipped: r.skipped["5대 리그 밖"] }),
    want: { deals: 0, skipped: 1 },
  },
  {
    name: "구단 행 — 프리셋 구단은 그 코드·한국어, 프리셋 밖은 slugify(정규 영문명)·영문 그대로·리그 null",
    rows: [row("John Doe joins Watford from Real Madrid.", { stage: "official" })],
    expect: (r) => r.clubs.sort((a, b) => a.code.localeCompare(b.code)),
    want: [
      { code: "real-madrid", canonical: "Real Madrid", name: "레알 마드리드", short_name: "레알", league: "라리가" },
      { code: "watford", canonical: "Watford", name: "Watford", short_name: "Watford", league: null },
    ],
  },
  {
    name: "행 배정 — 딜에 속한 행 id가 그 딜 키로 실린다",
    rows: [row("Chelsea sign John Doe.", { stage: "official" }), row("John Doe scored twice.", { stage: "unknown" })],
    expect: (r) => [...r.assignments.entries()].map(([id, k]) => [id === r.deals[0].rowIds[0], k === r.deals[0].deal_key]),
    want: [[true, true]],
  },
  {
    name: "first/latest/report_count — 시간순과 무관하게 min/max",
    rows: [
      row("Chelsea sign John Doe.", { stage: "official", published_at: "2026-08-20T00:00:00Z" }),
      row("Chelsea in talks for John Doe.", { stage: "talks", published_at: "2026-08-01T00:00:00Z" }),
    ],
    expect: (r) => pick(r.deals[0], ["first_reported_at", "latest_reported_at", "report_count", "stage"]),
    want: { first_reported_at: "2026-08-01T00:00:00.000Z", latest_reported_at: "2026-08-20T00:00:00.000Z", report_count: 2, stage: "official" },
  },
];

// ── 출발 구단 폴백 — 보도가 소속을 말하지 않으면 현 소속 캐시(player_club)를 쓴다 ──
const clubCache = (club) => [{ kind: "player_club", key: "john doe", name_en: club, name_ko: null, wikidata_id: "Q9", checked_at: "2026-09-24T00:00:00Z" }];
const withClub = (rows, cache) => deriveDeals(rows, { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT, cache }) });
const FALLBACK = {
  used: withClub([row("Chelsea want John Doe and he could join Chelsea in January.", { stage: "rumour" })], clubCache("Bayern Munich")),
  sameAsTo: withClub([row("Chelsea want John Doe and he could join Chelsea in January.", { stage: "rumour" })], clubCache("Chelsea")),
  free: withClub([row("Chelsea are keen on free agent John Doe.", { stage: "rumour" })], clubCache("Bayern Munich")),
  notFound: withClub([row("Chelsea are keen on John Doe and could make a bid in January.", { stage: "rumour" })], [{ kind: "player_club", key: "john doe", name_en: "John Doe", name_ko: null, wikidata_id: null, checked_at: "2026-09-24T00:00:00Z" }]),
  stale: withClub([row("Chelsea are keen on John Doe and could make a bid in January.", { stage: "rumour" })], [{ kind: "player_club", key: "john doe", name_en: "John Doe", name_ko: null, wikidata_id: null, checked_at: "2026-08-01T00:00:00Z" }]),
  reported: withClub([row("John Doe could join Chelsea from Bayern in January.", { stage: "rumour" })], clubCache("Benfica")),
};

// ── 판정이 있는 딜에서는 규칙의 약한 행선지 문형만으로 행선지를 정하지 않는다 ──
const FIRM = {
  weakOnly: derive([row("Newcastle United striker John Doe, on loan at Juventus this season, is attracting interest from Bayern Munich.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Newcastle United", verdict_to: null, verdict_suitors: ["Bayern Munich"], verdict_stage: "rumour", summary_ko: "요약" })]),
  strongRule: derive([row("John Doe signs for Juventus.", { stage: "official", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Newcastle United", verdict_to: null, verdict_suitors: [], verdict_stage: "official", summary_ko: "요약" })]),
  unjudged: derive([row("Newcastle United striker John Doe, on loan at Juventus this season, is attracting interest from Bayern Munich.", { stage: "rumour" })]),
};
// ── 한 토큰 이름 병합 — 구단이 겹칠 때만 ──
const MERGE = {
  disjoint: derive([
    row("Goncalo Inacio could join AC Milan from Sporting in January.", { players: ["Goncalo Inacio"], stage: "rumour", clubs: ["Sporting CP", "AC Milan"] }),
    row("Inacio could join Juventus from Borussia Dortmund.", { players: ["Inacio"], stage: "talks", clubs: ["Juventus", "Borussia Dortmund"] }),
  ]),
  overlapping: derive([
    row("Alexander Isak could join Liverpool from Newcastle.", { players: ["Alexander Isak"], stage: "rumour", clubs: ["Newcastle United", "Liverpool"] }),
    row("Liverpool make a £120m bid for Isak.", { players: ["Isak"], stage: "offer", clubs: ["Liverpool"] }),
  ]),
};

// ── 검증 게이트 — 확인된 선수의 딜만 만든다 ──
const gated = (rows, cache = []) =>
  deriveDeals(rows, { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT, cache }), requireVerified: true });
const GATE = {
  unknown: gated([row("Chelsea agree deal for Jane Roe from Benfica.", { players: ["Jane Roe"] })]),
  cached: gated([row("Chelsea agree deal for Jane Roe from Benfica.", { players: ["Jane Roe"] })], [
    { kind: "player", key: "jane roe", name_ko: null, wikidata_id: "Q1", checked_at: "2026-09-20T00:00:00Z" },
  ]),
  notFound: gated([row("Chelsea agree deal for Jane Roe from Benfica.", { players: ["Jane Roe"] })], [
    { kind: "player", key: "jane roe", name_ko: null, wikidata_id: null, checked_at: "2026-09-20T00:00:00Z" },
  ]),
  human: gated([row("Chelsea agree deal for John Doe from Benfica.")]),
};
// ── 이동 판정(LLM) 관문 — 거부권만, 새 딜은 "이동" 판정이 있어야, 있던 딜은 판정이 없어도 남는다 ──
const judged = (rows, existing = []) =>
  deriveDeals(rows, { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT }), requireVerified: true, requireVerdict: true, existingKeys: new Set(existing) });
const JOHN = dealKey(normalizePlayer("John Doe"));
// 이미 판정·요약된 행 — 요약을 함께 둔다(없으면 최근 보도는 24시간 뒤 요약을 다시 묻는 대상이 되어 픽스처 순서에 따라 흔들린다)
const V = (verdict, extra = {}) => ({ verdict, verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: verdict === "move" ? "요약" : null, ...extra });
const VERDICT = {
  unjudgedNew: judged([row("Chelsea agree deal for John Doe from Benfica.")]),
  movedNew: judged([row("Chelsea agree deal for John Doe from Benfica.", V("move"))]),
  unjudgedExisting: judged([row("Chelsea agree deal for John Doe from Benfica.")], [JOHN]),
  allVetoedExisting: judged([row("Alan Shearer in agreement with John Doe after the blast.", V("not_move")), row("John Doe agreement reached after verdict.", V("not_move"))], [JOHN]),
  mixed: judged([
    row("Chelsea in talks for John Doe from Benfica.", { stage: "talks", ...V("move", { verdict_to: "Chelsea" }) }),
    row("John Doe joins Chelsea from Benfica. Deal agreed.", { stage: "official", ...V("not_move") }),
    row("Chelsea agree deal for John Doe from Benfica.", { stage: "agreement" }),
  ]),
  otherPlayer: judged([row("Chelsea agree deal for John Doe from Benfica.", { verdict: "move", verdict_player: "jane roe", verdict_at: "2026-09-24T00:00:00Z" })]),
  invalidRecent: judged([row("Chelsea agree deal for John Doe from Benfica.", { verdict: null, verdict_player: "john doe", verdict_at: new Date(NOW - 3_600_000).toISOString() })]),
  invalidOld: judged([row("Chelsea agree deal for John Doe from Benfica.", { verdict: null, verdict_player: "john doe", verdict_at: new Date(NOW - 25 * 3_600_000).toISOString() })]),
  off: deriveDeals([row("Chelsea agree deal for John Doe from Benfica.", V("not_move"))], { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT }) }),
  // 요약 실패 — 최근 보도만 24시간 뒤 다시 묻는다
  noSummaryRecent: judged([row("Chelsea agree deal for John Doe from Benfica.", V("move", { verdict_at: new Date(NOW - 25 * 3_600_000).toISOString(), published_at: new Date(NOW - 2 * 86_400_000).toISOString(), summary_ko: null }))]),
  noSummaryFresh: judged([row("Chelsea agree deal for John Doe from Benfica.", V("move", { verdict_at: new Date(NOW - 3_600_000).toISOString(), published_at: new Date(NOW - 2 * 86_400_000).toISOString(), summary_ko: null }))]),
  noSummaryOld: judged([row("Chelsea agree deal for John Doe from Benfica.", V("move", { verdict_at: new Date(NOW - 25 * 3_600_000).toISOString(), published_at: new Date(NOW - 20 * 86_400_000).toISOString(), summary_ko: null }))]),
  summarized: judged([row("Chelsea agree deal for John Doe from Benfica.", V("move", { verdict_at: new Date(NOW - 25 * 3_600_000).toISOString(), published_at: new Date(NOW - 2 * 86_400_000).toISOString(), summary_ko: "첼시가 존 도 영입에 합의했다." }))]),
  rejudge: deriveDeals([row("Chelsea agree deal for John Doe from Benfica.", V("move", { summary_ko: "요약" }))], { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT }), requireVerified: true, requireVerdict: true, rejudge: true, existingKeys: new Set() }),
  // 5대 리그 구단이 걸리지 않은 후보는 LLM에 묻지 않는다
  outsideTopLeagues: judged([row("John Doe joins Al Hilal from Galatasaray.", { stage: "official" })]),
  // 규칙이 선수를 못 뽑은 보도 — 5대 리그 구단이 언급됐으면 선수까지 LLM에 묻는다
  unnamed: judged([row("Johan Manzambi addresses rumours after €70m Aston Villa transfer from Freiburg.", { stage: "rumour", players: [] })]),
  unnamedOutside: judged([row("Galatasaray agree deal to sign a striker from Al Hilal.", { stage: "agreement", players: [] })]),
  unnamedJudged: judged([row("Johan Manzambi addresses rumours after €70m Aston Villa transfer from Freiburg.", { stage: "rumour", players: [], verdict: "move", verdict_player: "john doe", verdict_player_name: "John Doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "SC Freiburg", verdict_to: "Aston Villa", verdict_stage: "official" })]),
  unnamedNotMove: judged([row("Aston Villa announce record revenues.", { stage: "official", players: [], verdict: "not_move", verdict_player: null, verdict_at: "2026-09-24T00:00:00Z" })]),
  // 판정이 있는 행은 LLM 단계다(다선수 기사에서 규칙이 그 선수의 단계를 못 읽는 경우가 대표적)
  llmStage: judged([row("Chelsea have been told the price for John Doe by Benfica, with Jane Roe also mentioned.", { stage: "offer", players: ["John Doe", "Jane Roe"], verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_to: "Chelsea", verdict_stage: "talks" })]),
  // 관심 구단이 여럿 — 행선지 밖 구단이 suitor_codes로 모인다
  suitorsOnly: judged([row("Arsenal and Brighton are monitoring Sturm Graz midfielder John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "Sturm Graz", verdict_to: null, verdict_suitors: ["Arsenal", "Brighton"] })]),
  // 옛 판정이 사전 밖 이름("Hull")으로 저장돼 있어도 지금의 사전으로 맞춘다 — 같은 구단("Hull City")이 두 코드로 갈리지 않는다
  suitorsAlias: judged([
    row("Arsenal and Hull are monitoring Sturm Graz midfielder John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "Sturm Graz", verdict_to: null, verdict_suitors: ["Arsenal", "Hull"] }),
    row("Hull City and Arsenal keep tabs on John Doe of Sturm Graz.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "Sturm Graz", verdict_to: null, verdict_suitors: ["Hull City", "Arsenal", "Hull"] }),
  ]),
  suitors: judged([
    row("Arsenal, Brighton and Aston Villa are monitoring Sturm Graz midfielder John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Sturm Graz", verdict_to: "Arsenal", verdict_suitors: ["Brighton", "Aston Villa"] }),
    row("Brighton keep tabs on John Doe of Sturm Graz.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Sturm Graz", verdict_to: "Brighton", verdict_suitors: ["Arsenal"] }),
  ]),
};
// ── 넓힌 후보 · 확인되지 않은 선수의 예외 · 판정자의 금액 · 옛 형식 판정 ──
const MOVE = (extra = {}) => ({ verdict: "move", verdict_player: "john doe", verdict_player_name: "John Doe", verdict_at: "2026-09-24T00:00:00Z", verdict_raw: "{}", summary_ko: "요약", ...extra });
const YOUTH = (extra = {}) => ({ players: ["Kid Unknown"], verdict: "move", verdict_player: "kid unknown", verdict_player_name: "Kid Unknown", verdict_at: "2026-09-24T00:00:00Z", verdict_raw: "{}", summary_ko: "요약", verdict_from: "Liverpool", verdict_to: "Manchester United", ...extra });
const WIDE = {
  // 단계 없음 + 선수 있음 + 이적 낱말 + 5대 리그 구단 → 선수를 비워 판정자에게 묻는다
  soft: judged([row("Bayern Munich would move for John Doe if he becomes available at Chelsea.", { stage: "unknown", relevance: 0.2 })]),
  softNoVocab: judged([row("John Doe scored twice as Chelsea beat Bayern Munich.", { stage: "unknown", relevance: 0.2 })]),
  softNoPlayer: judged([row("Bayern Munich would move for the Chelsea winger.", { stage: "unknown", relevance: 0.2, players: [] })]),
  softOutside: judged([row("Al Hilal would move for John Doe of Galatasaray.", { stage: "unknown", relevance: 0.2 })]),
  softNotMove: judged([row("Bayern Munich would move for John Doe if he becomes available at Chelsea.", { stage: "unknown", relevance: 0.2, verdict: "not_move", verdict_player: null, verdict_at: "2026-09-24T00:00:00Z" })]),
  // 판정이 오면 판정자가 읽은 선수·단계로 딜이 된다(규칙의 이름이 아니라)
  softMoved: judged([row("Bayern Munich would move for John Doe if he becomes available at Chelsea.", { stage: "unknown", relevance: 0.2, players: ["Somebody Else"], ...MOVE({ verdict_stage: "rumour", verdict_from: "Chelsea", verdict_to: "Bayern Munich" }) })]),
  // 확인되지 않은 선수 — 판정은 받고, 완료·확정이거나 출처 두 곳이면 연다
  youthUnjudged: judged([row("Manchester United sign Kid Unknown from Liverpool.", { stage: "official", players: ["Kid Unknown"] })]),
  youthOfficial: judged([row("Manchester United sign Kid Unknown from Liverpool.", { stage: "official", ...YOUTH({ verdict_stage: "official" }) })]),
  youthRumourOne: judged([row("Manchester United want Kid Unknown from Liverpool.", { stage: "rumour", ...YOUTH({ verdict_stage: "rumour" }) })]),
  youthRumourTwo: judged([
    row("Manchester United want Kid Unknown from Liverpool.", { stage: "rumour", ...YOUTH({ verdict_stage: "rumour" }) }),
    row("Kid Unknown is a target for Manchester United, Liverpool fear.", { stage: "rumour", source_id: "rss:bbc-football", ...YOUTH({ verdict_stage: "rumour" }) }),
  ]),
  youthMononym: judged([row("Manchester United sign Kid from Liverpool.", { stage: "official", players: ["Kid"], verdict: "move", verdict_player: "kid", verdict_player_name: "Kid", verdict_at: "2026-09-24T00:00:00Z", verdict_raw: "{}", verdict_stage: "official", verdict_to: "Manchester United" })]),
  // 금액 — 금액까지 읽는 형식의 판정은 판정자의 값이 전부다
  feeJudged: judged([row("Liverpool consider £47m deal. Chelsea want John Doe from Benfica, who value him at €45m.", { stage: "rumour", ...MOVE({ verdict_to: "Chelsea", verdict_fee_amount: 45, verdict_fee_currency: "EUR", verdict_fee_kind: "valuation" }) })]),
  feeJudgedNone: judged([row("Liverpool consider £47m deal. Chelsea want John Doe from Benfica.", { stage: "rumour", ...MOVE({ verdict_to: "Chelsea" }) })]),
  feeOldFormat: judged([row("Chelsea agree £47m deal for John Doe from Benfica.", { stage: "agreement", ...MOVE({ verdict_to: "Chelsea", verdict_raw: null }) })]),
  // 옛 형식의 "이동" 판정은 운영 실행(upgradeVerdicts)에서 한 번 다시 묻는다 — 딜은 그대로 둔다
  upgrade: deriveDeals([row("Chelsea agree deal for John Doe from Benfica.", V("move"))], { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT }), requireVerified: true, requireVerdict: true, upgradeVerdicts: true, existingKeys: new Set() }),
  upgraded: deriveDeals([row("Chelsea agree deal for John Doe from Benfica.", MOVE())], { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT }), requireVerified: true, requireVerdict: true, upgradeVerdicts: true, existingKeys: new Set() }),
};
const ST = (stage, extra = {}) => ({ stage, ...MOVE({ verdict_stage: stage, verdict_from: "Benfica", verdict_to: "Chelsea", ...extra }) });
const SAGA = {
  // 부인 뒤에 루머가 다시 이어지면 되살아난 이적설이다 — 중간의 부인이 딜을 죽이지 않는다
  revived: judged([row("Chelsea in talks for John Doe from Benfica.", ST("talks")), row("Chelsea deny interest in John Doe of Benfica.", ST("denied")), row("Chelsea are keen on John Doe of Benfica again.", ST("rumour")), row("Chelsea still want John Doe of Benfica.", ST("rumour"))]),
  // 가장 나중 보도가 부인이면 죽은 딜이다 — 협상까지 갔었으면 결렬, 루머까지였으면 부인
  deadLast: judged([row("Chelsea in talks for John Doe from Benfica.", ST("talks")), row("Chelsea are keen on John Doe of Benfica.", ST("rumour")), row("Chelsea deny interest in John Doe of Benfica.", ST("denied"))]),
  deniedLast: judged([row("Chelsea are keen on John Doe of Benfica.", ST("rumour")), row("Chelsea deny interest in John Doe of Benfica.", ST("denied"))]),
  // 줄여 쓴 이름("Van Doe")은 긴 이름("John van Doe")의 딜로 합친다 — 구단이 겹칠 때만
  suffix: deriveDeals([
    row("Chelsea want John van Doe from Benfica.", { stage: "rumour", players: ["John van Doe"], verdict: "move", verdict_player: "john van doe", verdict_player_name: "John van Doe", verdict_at: "2026-09-24T00:00:00Z", verdict_raw: "{}", verdict_stage: "rumour", verdict_from: "Benfica", verdict_to: "Chelsea", summary_ko: "요약" }),
    row("Chelsea keen on Van Doe of Benfica.", { stage: "rumour", players: ["Van Doe"], verdict: "move", verdict_player: "van doe", verdict_player_name: "Van Doe", verdict_at: "2026-09-24T00:00:00Z", verdict_raw: "{}", verdict_stage: "rumour", verdict_from: "Benfica", verdict_to: "Chelsea", summary_ko: "요약" }),
  ], { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: { "john van doe": { ko: "존 판 도" } } }), requireVerified: true, requireVerdict: true, existingKeys: new Set() }),
};
// ── 중복 보도 — 같은 URL(쿼리·조각 제외)이나 같은 본문은 한 보도다 ──
const BBC = "https://www.bbc.co.uk/sport/football/articles/cmx2zv4e320do?at_medium=RSS&amp;at_campaign=rss";
const DUP = {
  revisions: dedupeRows([
    { id: 1, url: BBC, body: "Chelsea agree deal for John Doe from Benfica.", published_at: "2026-07-10T00:00:00Z" },
    { id: 2, url: BBC, body: "Chelsea agree deal for John Doe from Benfica. Medical booked.", published_at: "2026-07-10T00:00:00Z" },
    { id: 3, url: "https://bbc.co.uk/sport/football/articles/cmx2zv4e320do/", body: "다른 수집", published_at: "2026-07-10T00:00:00Z" },
  ]),
  retweet: dedupeRows([
    { id: 10, url: "https://t.me/romano/1", body: "🚨 David Alaba to Udinese, exclusive story confirmed and here we go! https://t.co/abc", published_at: "2026-07-10T10:00:00Z" },
    { id: 11, url: "https://bsky.app/x/2", body: "RT @FabrizioRomano: 🚨 David Alaba to Udinese, exclusive story confirmed and here we go! https://t.co/xyz", published_at: "2026-07-10T11:00:00Z" },
  ]),
  short: dedupeRows([
    { id: 20, url: "https://a.test/1", body: "Official!", published_at: "2026-07-10T00:00:00Z" },
    { id: 21, url: "https://a.test/2", body: "Official!", published_at: "2026-07-10T00:00:00Z" },
  ]),
  // 가십 칼럼의 항목 행 — 칼럼 URL을 물려받지만 서로 다른 보도다. 두 피드에 실린 같은 항목은 본문으로 합친다
  items: dedupeRows([
    { id: 30, external_id: "aaaa#item-1", url: BBC, body: "Arsenal are monitoring Bayer Leverkusen midfielder John Doe, 20. (Teamtalk)", published_at: "2026-07-10T00:00:00Z" },
    { id: 31, external_id: "aaaa#item-2", url: BBC, body: "Newcastle are keeping an eye on Rennes defender Jack Roe, 21. (Football Insider)", published_at: "2026-07-10T00:00:00Z" },
    { id: 32, external_id: "bbbb#item-1", url: BBC, body: "Arsenal are monitoring Bayer Leverkusen midfielder John Doe, 20. (Teamtalk)", published_at: "2026-07-10T00:00:00Z" },
  ]),
  counted: derive([
    row("Chelsea agree deal for John Doe from Benfica.", { url: BBC }),
    row("Chelsea agree deal for John Doe from Benfica. Updated.", { url: BBC.replace("rss", "x") }),
    row("John Doe joins Chelsea from Benfica. Deal agreed.", { url: "https://www.skysports.com/a" }),
  ]),
};
// 가십 문형 — "competition from X"·"interest from X"의 X는 데려가려는 구단이다
const SUITOR = {
  competition: derive([row("Newcastle are keeping an eye on Rennes defender John Doe, 20, but face competition from Everton and Brentford.")]),
  competitionJudged: derive([row("Newcastle are keeping an eye on Rennes defender John Doe, 20, but face competition from Everton and Brentford.", { verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", verdict_from: "Rennes", verdict_to: "Newcastle United" })]),
  renewal: derive([row("Brentford are in discussions with John Doe about a new long-term contract amid increasing interest from Liverpool.")]),
};
const UNIT = [
  { name: "단계 — 부인 뒤에 루머가 다시 이어지면 되살아난 것이다(중간의 부인이 딜을 죽이지 않는다)", got: SAGA.revived.deals[0]?.stage, want: "rumour" },
  { name: "단계 — 가장 나중 보도가 부인이고 협상까지 갔었으면 결렬", got: SAGA.deadLast.deals[0]?.stage, want: "collapsed" },
  { name: "단계 — 가장 나중 보도가 부인이고 루머까지였으면 부인", got: SAGA.deniedLast.deals[0]?.stage, want: "denied" },
  { name: "이름 — 줄여 쓴 이름은 긴 이름의 딜로 합친다(딜이 둘로 갈리지 않고, 줄인 이름의 보도는 긴 이름으로 다시 묻는다)", got: [SAGA.suffix.deals.map((d) => [d.player, d.report_count]), SAGA.suffix.judgeNeeds.map((x) => x.player)], want: [[["John van Doe", 1]], ["John van Doe"]] },
  { name: "넓힌 후보 — 단계 없음 + 선수 + 이적 낱말 + 5대 리그 구단이면 선수를 비워 판정자에게 묻는다", got: WIDE.soft.judgeNeeds.map((x) => [x.player, x.playerKey]), want: [[null, null]] },
  { name: "넓힌 후보 — 이적 낱말이 없으면 묻지 않는다(경기 기사)", got: WIDE.softNoVocab.judgeNeeds.length, want: 0 },
  { name: "넓힌 후보 — 규칙이 선수를 못 잡았으면 묻지 않는다", got: WIDE.softNoPlayer.judgeNeeds.length, want: 0 },
  { name: "넓힌 후보 — 5대 리그 구단이 없으면 묻지 않는다", got: WIDE.softOutside.judgeNeeds.length, want: 0 },
  { name: "넓힌 후보 — 이동 아님 판정을 받았으면 다시 묻지 않고 딜도 없다", got: [WIDE.softNotMove.judgeNeeds.length, WIDE.softNotMove.deals.length], want: [0, 0] },
  { name: "넓힌 후보 — 이동 판정이 오면 판정자가 읽은 선수·단계·구단으로 딜이 된다(규칙의 이름을 쓰지 않는다)", got: pick(WIDE.softMoved.deals[0] ?? {}, ["player", "stage", "from_club_code", "to_club_code"]), want: { player: "John Doe", stage: "rumour", from_club_code: "chelsea", to_club_code: "bayern-munchen" } },
  { name: "미확인 선수 — 판정 전에는 딜이 아니지만 판정은 받는다", got: [WIDE.youthUnjudged.deals.length, WIDE.youthUnjudged.judgeNeeds.map((x) => x.player)], want: [0, ["Kid Unknown"]] },
  { name: "미확인 선수 — 완료·확정 판정이면 연다(유스 오피셜)", got: pick(WIDE.youthOfficial.deals[0] ?? {}, ["player", "stage", "to_club_code"]), want: { player: "Kid Unknown", stage: "official", to_club_code: "man-united" } },
  { name: "미확인 선수 — ⚠ 한 출처의 루머로는 열지 않는다", got: WIDE.youthRumourOne.deals.length, want: 0 },
  { name: "미확인 선수 — 서로 다른 출처 두 곳이 이동이라 하면 연다", got: WIDE.youthRumourTwo.deals.map((d) => [d.player, d.report_count]), want: [["Kid Unknown", 2]] },
  { name: "미확인 선수 — ⚠ 한 토큰 이름은 완료 판정이어도 열지 않는다", got: WIDE.youthMononym.deals.length, want: 0 },
  { name: "금액 — 판정자의 금액과 성격을 쓴다(같은 글의 남의 금액 £47m이 아니라)", got: pick(WIDE.feeJudged.deals[0] ?? {}, ["fee_amount", "fee_currency", "fee_text", "fee_kind"]), want: { fee_amount: 45, fee_currency: "EUR", fee_text: "€45m", fee_kind: "valuation" } },
  { name: "금액 — 판정자가 금액이 없다고 했으면 규칙의 금액을 쓰지 않는다", got: pick(WIDE.feeJudgedNone.deals[0] ?? {}, ["fee_amount", "fee_kind"]), want: { fee_amount: null, fee_kind: null } },
  { name: "금액 — 옛 형식의 판정(원출력 없음)은 규칙의 금액이고 성격은 모른다", got: pick(WIDE.feeOldFormat.deals[0] ?? {}, ["fee_amount", "fee_kind"]), want: { fee_amount: 47, fee_kind: null } },
  { name: "옛 형식 판정 — 운영 실행은 한 번 다시 묻고 딜은 그대로 둔다", got: [WIDE.upgrade.judgeNeeds.length, WIDE.upgrade.deals.length], want: [1, 1] },
  { name: "옛 형식 판정 — 새 형식으로 판정된 행은 다시 묻지 않는다", got: WIDE.upgraded.judgeNeeds.length, want: 0 },
  { name: "중복 — BBC 개정판(같은 URL·쿼리·끝 슬래시 차이)은 한 보도이고 대표는 나중에 수집된 개정판", got: [DUP.revisions.reps.length, DUP.revisions.duplicates, DUP.revisions.reps[0].id], want: [1, 2, 3] },
  { name: "중복 — 리트윗은 원문과 같은 보도이고 대표는 먼저 게시된 원문", got: [DUP.retweet.reps.length, DUP.retweet.reps[0].id], want: [1, 10] },
  { name: "중복 — 짧은 문구(40자 미만)가 같다고 합치지 않는다", got: DUP.short.reps.length, want: 2 },
  { name: "중복 — 가십 항목은 같은 칼럼 URL이어도 따로 세고, 두 피드의 같은 항목은 합친다", got: DUP.items.reps.map((r) => r.id).sort(), want: [31, 32] },
  { name: "가십 — 지난 창의 영입 정리 기사(Ten of the best-value deals …)는 가십 모음처럼 후보가 아니다", got: [isRoundup({ source_id: "rss:guardian-football", body: "Ten of the best-value deals from this summer’s transfer window\nFrom veteran strikers…" }), isRoundup({ source_id: "rss:guardian-football", body: "Chelsea agree deal to sign John Doe\n…" })], want: [true, false] },
  { name: "가십 — BBC 가십·스카이 신문 요약은 가십 모음이고, 거기서 나눈 항목은 아니다", got: [isRoundup({ source_id: "rss:bbc-gossip", body: "Chelsea lead race for Scott" }), isRoundup({ source_id: "rss:sky-transfers", body: "Papers: Man Utd line up Conte" }), isRoundup({ source_id: "rss:bbc-gossip", external_id: "aaaa#item-1", body: "Chelsea target Bournemouth's Alex Scott. (Mail)" }), isRoundup({ source_id: "rss:sky-transfers", body: "Arsenal complete signing of John Doe" })], want: [true, true, false, false] },
  { name: "방향 — 경쟁 구단(competition from X)은 출발 구단이 아니다 → 규칙만으로는 구단을 못 읽어 딜이 없다", got: [SUITOR.competition.deals.length, SUITOR.competition.skipped["구단 미확인"]], want: [0, 1] },
  { name: "방향 — 같은 문장을 LLM이 읽으면 렌 → 뉴캐슬", got: pick(SUITOR.competitionJudged.deals[0] ?? {}, ["from_club_code", "to_club_code"]), want: { from_club_code: "rennes", to_club_code: "newcastle" } },
  { name: "재계약 — \"new long-term contract\"는 재계약이고 interest from X는 옮긴다는 표현이 아니다", got: [SUITOR.renewal.deals.length, SUITOR.renewal.skipped["재계약·첫 프로 계약"]], want: [0, 1] },
  { name: "중복 — 딜의 보도 수는 서로 다른 보도만 센다", got: [DUP.counted.deals[0]?.report_count, DUP.counted.skipped["중복 보도"]], want: [2, 1] },
  { name: "판정 — 판정 없는 새 딜은 열지 않고 물을 대상으로 넘긴다", got: [VERDICT.unjudgedNew.deals.length, VERDICT.unjudgedNew.judgeNeeds.map((n) => n.playerKey), VERDICT.unjudgedNew.skipped["판정 대기(LLM)"], VERDICT.unjudgedNew.clubs.length], want: [0, ["john doe"], 1, 0] },
  { name: "판정 — 이동 판정이 있는 새 딜은 연다(다시 묻지 않는다)", got: [VERDICT.movedNew.deals.length, VERDICT.movedNew.judgeNeeds.length], want: [1, 0] },
  { name: "판정 — 이미 있는 딜은 판정이 없어도 남긴다(판정이 멎어도 보드가 비지 않게)", got: [VERDICT.unjudgedExisting.deals.length, VERDICT.unjudgedExisting.judgeNeeds.length], want: [1, 1] },
  { name: "판정 — 이미 있는 딜도 보도가 전부 '이동 아님'이면 사라진다", got: [VERDICT.allVetoedExisting.deals.length, VERDICT.allVetoedExisting.skipped["이동 아님(LLM 판정)"], VERDICT.allVetoedExisting.assignments.size], want: [0, 2, 0] },
  { name: "판정 — '이동 아님' 보도는 딜에서 빠지고, 판정 전 보도는 묻기만 하고 딜에 들지 않는다(판정받은 협상 보도만 남는다)", got: [VERDICT.mixed.deals[0]?.report_count, VERDICT.mixed.deals[0]?.stage, VERDICT.mixed.judgeNeeds.length, VERDICT.mixed.assignments.size], want: [1, "talks", 1, 1] },
  { name: "판정 — 다른 선수로 내린 판정은 없는 것이다(다시 묻는다)", got: [VERDICT.otherPlayer.deals.length, VERDICT.otherPlayer.judgeNeeds.length], want: [0, 1] },
  { name: "판정 — 판정 불가는 24시간 동안 다시 묻지 않는다", got: [VERDICT.invalidRecent.deals.length, VERDICT.invalidRecent.judgeNeeds.length], want: [0, 0] },
  { name: "판정 — 판정 불가가 24시간 지나면 다시 묻는다", got: VERDICT.invalidOld.judgeNeeds.length, want: 1 },
  { name: "판정 — 관문을 켜지 않으면 판정을 보지 않는다(기존 동작)", got: VERDICT.off.deals.length, want: 1 },
  { name: "판정 — 이동인데 요약이 없으면 24시간 뒤 다시 묻는다(최근 보도)", got: [VERDICT.noSummaryRecent.judgeNeeds.length, VERDICT.noSummaryRecent.deals.length], want: [1, 1] },
  { name: "판정 — 요약이 없어도 24시간 안에는 다시 묻지 않는다", got: VERDICT.noSummaryFresh.judgeNeeds.length, want: 0 },
  { name: "판정 — 오래된 보도(14일 밖)의 요약 실패는 다시 묻지 않는다(영문 발췌로 둔다)", got: VERDICT.noSummaryOld.judgeNeeds.length, want: 0 },
  { name: "판정 — 요약까지 있으면 다시 묻지 않는다", got: VERDICT.summarized.judgeNeeds.length, want: 0 },
  { name: "판정 — rejudge는 저장된 판정이 있어도 다시 묻고, 딜은 그대로 둔다", got: [VERDICT.rejudge.judgeNeeds.length, VERDICT.rejudge.deals.length], want: [1, 1] },
  { name: "판정 — 물을 대상에 그 보도의 구단·옛 요약을 함께 싣는다(표기 사전·요약 보존용)", got: [VERDICT.unjudgedNew.judgeNeeds[0].clubs.sort(), VERDICT.summarized.judgeNeeds.length, "summary_ko" in VERDICT.unjudgedNew.judgeNeeds[0]], want: [["Benfica", "Chelsea"], 0, true] },
  { name: "판정 — 5대 리그 구단이 걸리지 않은 후보는 LLM에 묻지 않는다(비용을 쓰지 않는다)", got: [VERDICT.outsideTopLeagues.judgeNeeds.length, VERDICT.outsideTopLeagues.skipped["5대 리그 밖"]], want: [0, 1] },
  { name: "선수 없음 — 5대 리그 구단이 언급된 보도는 선수까지 LLM에 묻는다(playerKey null · 언급 구단 동봉)", got: [VERDICT.unnamed.judgeNeeds.length, VERDICT.unnamed.judgeNeeds[0]?.playerKey, VERDICT.unnamed.judgeNeeds[0]?.clubs.sort(), VERDICT.unnamed.skipped["선수 없음(판정 대기)"]], want: [1, null, ["Aston Villa", "SC Freiburg"], 1] },
  { name: "선수 없음 — 5대 리그 구단이 없으면 묻지 않는다", got: [VERDICT.unnamedOutside.judgeNeeds.length, VERDICT.unnamedOutside.skipped["선수 없음"]], want: [0, 1] },
  { name: "선수 없음 — 관문을 켜지 않으면 그냥 건너뛴다(기존 동작)", got: derive([row("Chelsea sign someone from Benfica.", { players: [] })]).skipped["선수 없음"], want: 1 },
  { name: "선수 없음 — LLM이 읽은 선수(verdict_player_name)로 딜이 묶이고 LLM 단계·구단을 쓴다", got: pick(VERDICT.unnamedJudged.deals[0] ?? {}, ["player", "from_club_code", "to_club_code", "stage"]), want: { player: "John Doe", from_club_code: "sc-freiburg", to_club_code: "aston-villa", stage: "official" } },
  { name: "선수 없음 — 이동 아님으로 판정된 보도는 다시 묻지 않는다", got: [VERDICT.unnamedNotMove.judgeNeeds.length, VERDICT.unnamedNotMove.deals.length], want: [0, 0] },
  { name: "단계 — 다선수 기사에서 규칙이 그 선수의 단계를 못 읽으면 LLM 단계(talks)를 쓴다", got: [VERDICT.llmStage.deals[0]?.stage, VERDICT.llmStage.skipped["그 선수의 단계 없음"] ?? 0], want: ["talks", 0] },
  { name: "관심 구단 — 행선지는 최신 보도(2배)의 브라이턴, 나머지가 표 순으로 suitorCodes에 모이고 구단 행도 만든다", got: [VERDICT.suitors.deals[0]?.to_club_code, VERDICT.suitors.deals[0]?.suitorCodes, VERDICT.suitors.clubs.map((c) => c.code).sort()], want: ["brighton-hove", ["aston-villa", "arsenal"], ["arsenal", "aston-villa", "brighton-hove", "sturm-graz"]] },
  { name: "관심 구단 — 저장된 판정의 별칭(\"Hull\")을 지금의 사전으로 맞춰 헐 시티가 한 코드로만 실린다", got: [VERDICT.suitorsAlias.deals[0]?.suitorCodes, VERDICT.suitorsAlias.clubs.map((c) => c.code).sort()], want: [["arsenal", "hull-city"], ["arsenal", "hull-city", "sturm-graz"]] },
  { name: "관심 구단 — 행선지 없이 관심 구단만 있는 루머(비5대 리그 소속, 5대 리그 구단들이 관심)도 딜이고 이름 조회 대상에 관심 구단이 든다", got: [VERDICT.suitorsOnly.deals[0]?.to_club_code ?? null, VERDICT.suitorsOnly.deals[0]?.suitorCodes, VERDICT.suitorsOnly.nameNeeds[0]?.suitorCanonicals], want: [null, ["arsenal", "brighton-hove"], ["Arsenal", "Brighton"]] },
  { name: "폴백 — 보도에 소속이 없으면 현 소속 캐시가 출발 구단이다(행선지는 그대로)", got: [FALLBACK.used.deals[0]?.from_club_code, FALLBACK.used.deals[0]?.to_club_code, FALLBACK.used.fromFallback, FALLBACK.used.clubNeeds.length], want: ["bayern-munchen", "chelsea", 1, 0] },
  { name: "폴백 — 현 소속이 행선지와 같으면(이미 옮긴 뒤의 기록) 쓰지 않는다", got: [FALLBACK.sameAsTo.deals[0]?.from_club_code ?? null, FALLBACK.sameAsTo.deals[0]?.to_club_code, FALLBACK.sameAsTo.fromFallback], want: [null, "chelsea", 0] },
  { name: "폴백 — 자유계약이면 소속이 없으니 쓰지 않는다", got: [FALLBACK.free.deals[0]?.from_club_code ?? null, FALLBACK.free.fromFallback, FALLBACK.free.clubNeeds.length], want: [null, 0, 0] },
  { name: "폴백 — 캐시가 없거나 못 찾은 채 오래됐으면 조회 대상이고, 최근에 못 찾았으면 다시 묻지 않는다", got: [FALLBACK.notFound.clubNeeds.length, FALLBACK.stale.clubNeeds.map((n) => n.playerKey)], want: [0, ["john doe"]] },
  { name: "폴백 — 보도가 소속을 말하면 그쪽이 먼저다(캐시의 벤피카가 아니라 보도의 바이에른)", got: [FALLBACK.reported.deals[0]?.from_club_code, FALLBACK.reported.fromFallback], want: ["bayern-munchen", 0] },
  { name: "행선지 보호 — 판정이 '행선지 없음'인 딜에 규칙의 약한 문형(on loan at Juventus)만 있으면 행선지를 비운다", got: [FIRM.weakOnly.deals[0]?.to_club_code ?? null, FIRM.weakOnly.deals[0]?.suitorCodes], want: [null, ["bayern-munchen"]] },
  { name: "행선지 보호 — 규칙의 강한 문형(signs for)은 판정이 있어도 행선지다", got: FIRM.strongRule.deals[0]?.to_club_code, want: "juventus" },
  { name: "행선지 보호 — 판정이 없는 딜은 전처럼 약한 문형도 센다", got: FIRM.unjudged.deals[0]?.to_club_code, want: "juventus" },
  { name: "병합 — 구단이 하나도 안 겹치는 한 토큰 이름은 다른 사람이다(도르트문트의 Inacio ≠ 스포르팅의 Goncalo Inacio)", got: MERGE.disjoint.deals.map((d) => [d.player, d.report_count]).sort(), want: [["Goncalo Inacio", 1], ["Inacio", 1]] }, // 한 토큰 딜은 운영에서 확인 관문(위키데이터는 한 토큰을 찾지 않는다)이 막는다
  { name: "병합 — 구단이 겹치면 전처럼 합친다(Isak → Alexander Isak)", got: MERGE.overlapping.deals.map((d) => [d.player, d.report_count]), want: [["Alexander Isak", 2]] },
  { name: "게이트 — 사전에도 캐시에도 없는 선수는 딜을 만들지 않고 이름 조회 대상으로 넘긴다", got: [GATE.unknown.deals.length, GATE.unknown.nameNeeds.map((x) => x.playerKey), GATE.unknown.skipped["미확인 선수"], GATE.unknown.clubs.length], want: [0, ["jane roe"], 1, 0] },
  { name: "게이트 — 위키데이터에서 찾은 선수(한국어 표기 없음)는 연다", got: GATE.cached.deals.length, want: 1 },
  { name: "게이트 — 찾아봤지만 없던 이름은 막는다", got: GATE.notFound.deals.length, want: 0 },
  { name: "게이트 — 사람 사전의 선수는 연다", got: GATE.human.deals.length, want: 1 },
  { name: "게이트 — 막은 선수는 경고로 남긴다(사람이 검토한다)", got: GATE.unknown.warnings.some((w) => w.includes("확인되지 않은 선수") && w.includes("Jane Roe")), want: true },
  { name: "재계약 — 구단을 읽었어도 옮긴다는 표현이 없으면 딜이 아니다", got: derive([row("Napoli reach agreement to extend John Doe contract until 2029. Napoli have agreed terms with John Doe over a new deal.")]).deals.length, want: 0 },
  { name: "재계약 표현이 있어도 옮기면 딜이다", got: derive([row("John Doe joins Napoli from Benfica and signs a new contract until 2029.")]).deals.length, want: 1 },
  { name: "normalizePlayer — 악센트·하이픈·대소문자·공백", got: normalizePlayer("  Rafael  LEÃO "), want: "rafael leao" },
  { name: "normalizePlayer — 비분리 하이픈(U+2011)과 보통 하이픈이 같은 키", got: normalizePlayer("Morgan Gibbs‑White") === normalizePlayer("Morgan Gibbs-White"), want: true },
  { name: "dealKey — 16자리 소문자 hex(DB CHECK)", got: /^[0-9a-f]{16}$/.test(dealKey("john doe")), want: true },
  { name: "boardScopeStartMs — 창 안(2026-08)이면 그 창의 개장", got: new Date(boardScopeStartMs(Date.parse("2026-08-15T00:00:00Z"), WINDOWS)).toISOString(), want: "2026-06-01T00:00:00.000Z" },
  { name: "boardScopeStartMs — 창 사이(2026-11)면 직전 창의 개장", got: new Date(boardScopeStartMs(Date.parse("2026-11-15T00:00:00Z"), WINDOWS)).toISOString(), want: "2026-06-01T00:00:00.000Z" },
  { name: "boardScopeStartMs — 다음 창이 열리면 그 창", got: new Date(boardScopeStartMs(Date.parse("2027-01-10T00:00:00Z"), WINDOWS)).toISOString(), want: "2027-01-01T00:00:00.000Z" },
  { name: "boardScopeStartMs — 아직 아무 창도 안 열렸으면 첫 창", got: new Date(boardScopeStartMs(Date.parse("2026-01-10T00:00:00Z"), WINDOWS)).toISOString(), want: "2026-06-01T00:00:00.000Z" },
  {
    name: "windowSpan — 개장은 가장 먼저 여는 리그, 마감은 가장 늦게 닫는 리그",
    got: windowSpan({ key: "k", label: "l", leagues: {
      A: { opensAt: "2026-07-01T00:00:00Z", closesAt: "2026-09-01T18:00:00Z" },
      B: { opensAt: "2026-06-15T00:00:00Z", closesAt: "2026-09-01T22:00:00Z" },
      C: { opensAt: "2026-06-29T00:00:00Z", closesAt: "2026-09-01T19:00:00Z" },
    } }),
    want: { key: "k", label: "l", opensAt: "2026-06-15T00:00:00Z", closesAt: "2026-09-01T22:00:00Z" },
  },
  { name: "derivationStartMs — 범위 시작 − 14일", got: new Date(derivationStartMs(NOW, WINDOWS)).toISOString(), want: "2026-05-18T00:00:00.000Z" },
  { name: "clubRecord — 사전 밖 구절도 CHECK 길이 안(short_name ≤40)", got: clubRecord("A".repeat(80) + " United").short_name.length <= 40, want: true },  {
    // 추출 메모는 결과를 바꾸지 않는다 — 이름을 찾은 뒤 다시 파생할 때 같은 메모를 넘기는 경로(runDerivation)까지
    name: "추출 메모 — 두 번의 파생이 메모를 나눠 써도 메모 없는 파생과 결과가 같다",
    got: (() => {
      const rows = CASES.flatMap((c) => c.rows);
      const opts = { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT }) };
      const flat = (d) => JSON.stringify({ ...d, assignments: [...d.assignments] });
      const memo = createExtractMemo();
      const first = deriveDeals(rows, { ...opts, memo });
      const second = deriveDeals(rows, { ...opts, memo });
      return flat(first) === flat(deriveDeals(rows, opts)) && flat(second) === flat(first);
    })(),
    want: true,
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let pass = 0;
for (const c of CASES) {
  let got;
  try {
    got = c.expect(derive(c.rows));
  } catch (e) {
    got = `throw: ${e.message}`;
  }
  const ok = same(got, c.want);
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}`);
  if (!ok) console.log(`   기대 ${JSON.stringify(c.want)}\n   실제 ${JSON.stringify(got)}`);
}
for (const u of UNIT) {
  const ok = same(u.got, u.want);
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${u.name}`);
  if (!ok) console.log(`   기대 ${JSON.stringify(u.want)}\n   실제 ${JSON.stringify(u.got)}`);
}
const total = CASES.length + UNIT.length;
console.log(`\n딜 파생 ${pass}/${total} 통과`);
if (pass !== total) process.exit(1);

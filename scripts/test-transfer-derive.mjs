/**
 * 딜 파생(`scripts/lib/transfer/derive-deals.mjs`) 회귀 테스트 — DB 없이 합성 행으로 돈다.
 *
 *   node scripts/test-transfer-derive.mjs
 *
 * 픽스처 행 배열 → 파생 결과를 **정확 일치**로 본다. 규칙(계획서 §2-2)을 고치면 이걸 먼저 돌린다.
 */
import { createNameBook } from "./lib/transfer/names-ko.mjs";
import { isRoundup } from "./lib/transfer/story.mjs";
import { CARRIED_DAILY_ATTEMPTS, JUDGE_TIER, boardScopeStartMs, clubRecord, createExtractMemo, dealKey, dedupeRows, deriveDeals, derivationStartMs, hasRawVerdict, holdStage, judgeMode, normalizePlayer, orderJudgeNeeds, retryDelayMs, windowSpan } from "./lib/transfer/derive-deals.mjs";

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
  // 유력한 순 — 서로 다른 세 보도(본문이 같으면 한 보도로 합쳐진다)가 같은 구단들을 나열해 표가 전부 같으면 보도 안에서 먼저 적힌 구단이 앞이다(누사 딜의 형태)
  suitorsTie: judged(
    [
      ["Aston Villa", "Tottenham Hotspur", "Newcastle United"],
      ["Tottenham Hotspur", "Newcastle United", "Aston Villa"],
      ["Tottenham Hotspur", "Aston Villa", "Newcastle United"],
    ].map((suitors, i) => row(`Report ${i + 1}: Arsenal lead Tottenham, Aston Villa and Newcastle in the race for Leipzig winger John Doe.`, { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "RB Leipzig", verdict_to: "Arsenal", verdict_suitors: suitors })),
  ),
  // 유력한 순 — 최신 보도(2배)에 든 구단이 옛 보도 한 건에만 든 구단보다 앞이다
  suitorsRecent: judged([
    row("Arsenal and Tottenham watch Leipzig winger John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "RB Leipzig", verdict_to: "Arsenal", verdict_suitors: ["Tottenham Hotspur"] }),
    row("Arsenal lead Newcastle for Leipzig winger John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "RB Leipzig", verdict_to: "Arsenal", verdict_suitors: ["Newcastle United"] }),
  ]),
  // 유력한 순 — 부인 보도의 행선지(첼시)는 표가 아니다. 표가 같은 뉴캐슬·첼시는 먼저 적힌 뉴캐슬이 앞이다
  suitorsDead: judged([
    row("Chelsea deny interest in Leipzig winger John Doe.", { stage: "denied", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "RB Leipzig", verdict_to: "Chelsea", verdict_suitors: [], verdict_stage: "denied" }),
    row("Arsenal are keen on Leipzig winger John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "RB Leipzig", verdict_to: "Arsenal", verdict_suitors: [], verdict_stage: "rumour" }),
    row("Arsenal lead Newcastle and Chelsea for Leipzig winger John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "RB Leipzig", verdict_to: "Arsenal", verdict_suitors: ["Newcastle United", "Chelsea"], verdict_stage: "rumour" }),
  ]),
  // 유력한 순은 순서만 정한다 — 행선지로만 적히고 투표에서 진 구단(첼시)을 관심 구단에 새로 넣지 않는다
  suitorsNoNew: judged([
    row("Chelsea want Leipzig winger John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "RB Leipzig", verdict_to: "Chelsea", verdict_suitors: [] }),
    row("Arsenal lead Newcastle for Leipzig winger John Doe.", { stage: "rumour", verdict: "move", verdict_player: "john doe", verdict_at: "2026-09-24T00:00:00Z", summary_ko: "요약", verdict_from: "RB Leipzig", verdict_to: "Arsenal", verdict_suitors: ["Newcastle United"] }),
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
// ── 딜 금액 후보 — 지난 금액·남의 금액은 딜 금액이 아니다(dealFee) ──
const BID = (amount, extra = {}) => MOVE({ verdict_stage: "rumour", verdict_fee_amount: amount, verdict_fee_currency: "GBP", verdict_fee_kind: "bid", ...extra });
const FEE = {
  // 스콧(운영 딜 580) — 근거 구절이 "7월에 거절된 £64m 제안"이다. 관심은 지금 것이어도 금액은 지난 것이다
  pastBid: judged([row("Chelsea target set for audition with talks continuing after £64m offer for John Doe.", { stage: "rumour", ...BID(64, {
    verdict_from: "Bournemouth", verdict_to: "Chelsea",
    verdict_evidence: "The Blues had a £64million offer knocked back by the Cherries in July but their interest in John Doe remains serious",
    summary_ko: "첼시가 지난 7월 본머스 소속 존 도에게 £64m 제안을 넣었지만 거절당했고, 여전히 관심을 유지하고 있다.",
  }) })]),
  // 영문에는 시점이 없고 한국어 요약 절만 지난 때를 말한다
  pastBidKo: judged([row("Chelsea remain keen on John Doe after £64m offer for the Bournemouth man.", { stage: "rumour", ...BID(64, {
    verdict_from: "Bournemouth", verdict_to: "Chelsea",
    summary_ko: "첼시가 지난여름 본머스의 존 도에게 낸 £64m 제안이 거절됐지만, 여전히 영입을 노린다.",
  }) })]),
  // 콴사(운영 딜 587) — 행선지가 없고 관심 구단 맨 앞은 첼시인데 £55.5m은 아스날의 제안이다
  otherClubBid: judged([
    row("Xabi Alonso 'leading transfer charge' for £55.5m star John Doe who agreed to join Arsenal. Chelsea will reportedly face competition from Arsenal to sign the defender.", { stage: "rumour", ...BID(55.5, {
    verdict_from: "Bayer Leverkusen", verdict_to: null, verdict_suitors: ["Chelsea", "Arsenal", "Real Madrid", "Liverpool"],
    }) }),
    // 그 뒤 보도 — 첼시가 영입전을 이끈다(딜의 상대는 첼시다)
    row("Chelsea lead the race for Bayer Leverkusen defender John Doe.", { stage: "rumour", ...MOVE({ verdict_stage: "rumour", verdict_from: "Bayer Leverkusen", verdict_to: "Chelsea" }) }),
  ]),
  // 대조 — 지금 딜의 상대(행선지)가 낸 지금의 제안은 쓴다("had … rejected"만으로는 지난 일이 아니다)
  currentBid: judged([row("Chelsea have had a £50m bid for John Doe rejected by Benfica.", { stage: "rumour", ...BID(50, { verdict_from: "Benfica", verdict_to: "Chelsea" }) })]),
  // 대조 — 요구액은 파는 쪽의 값이라 행선지가 없어도(관심 구단 여럿) 쓴다
  askingPrice: judged([row("Benfica want €80m for John Doe, with Chelsea and Arsenal keen.", { stage: "rumour", ...MOVE({ verdict_stage: "rumour", verdict_from: "Benfica", verdict_suitors: ["Chelsea", "Arsenal"], verdict_fee_amount: 80, verdict_fee_currency: "EUR", verdict_fee_kind: "asking_price" }) })]),
  // 무하레모비치(운영 딜 304) — 지금 구단이 데려올 때 낸 지난 이적료
  pastFee: judged([row("Leeds paid Sassuolo £34m for John Doe last summer, and Juventus are now keen.", { stage: "rumour", ...MOVE({ verdict_stage: "rumour", verdict_from: "Leeds United", verdict_to: "Juventus", verdict_fee_amount: 34, verdict_fee_currency: "GBP", verdict_fee_kind: "fee" }) })]),
  // 대조 — 완료 보도의 이적료는 달 이름·과거 동사가 있어도 그 딜의 값이다
  officialFee: judged([row("Chelsea completed the signing of John Doe from Benfica for £50m in August, having paid the fee upfront.", { stage: "official", ...MOVE({ verdict_stage: "official", verdict_from: "Benfica", verdict_to: "Chelsea", verdict_fee_amount: 50, verdict_fee_currency: "GBP", verdict_fee_kind: "fee" }) })]),
  // 지난 제안을 걸러도 지금의 제안이 남으면 그것이 딜 금액이고, 직전·범위도 남은 후보로만 센다
  pastThenCurrent: judged([
    row("Chelsea saw a £64m offer for John Doe rejected by Benfica last summer.", { stage: "rumour", published_at: "2026-09-20T00:00:00Z", ...BID(64, { verdict_from: "Benfica", verdict_to: "Chelsea", summary_ko: "첼시의 지난여름 £64m 제안이 거절됐다는 회고와 함께 관심이 이어진다고 전했다." }) }),
    row("Chelsea prepare £70m bid for John Doe of Benfica.", { stage: "rumour", published_at: "2026-09-22T00:00:00Z", ...BID(70, { verdict_from: "Benfica", verdict_to: "Chelsea" }) }),
  ]),
  // 판정이 없는 딜(규칙만으로 열린 옛 딜)은 지금처럼 규칙 금액을 쓴다
  unjudgedRule: derive([row("Chelsea agree £47m deal for John Doe from Benfica.", { stage: "agreement" })]),
};
// ── 같은 보도를 옮긴 두 매체 — 판정 뒤에 접는다(foldEchoes) ──
const QS = "레알 마드리드가 바이어 레버쿠젠 소속 존 도 영입에 관심을 보이고 있다.";
const CITED = (id, source_id, published_at, body, extra = {}) =>
  // 가십 칼럼의 항목 행 — external_id가 칼럼의 자식 표지(`#item-`)를 단다(없으면 칼럼째 가십 모음으로 빠진다)
  row(body, { id, source_id, external_id: `col-${id}#item-${id}`, published_at, stage: "rumour", attribution: "cited", attributed_to: "Bild", ...MOVE({ verdict_stage: "rumour", verdict_from: "Bayer Leverkusen", verdict_to: "Real Madrid", summary_ko: QS, ...extra }) });
const fold = (rows) => { const r = judged(rows); return pick(r.deals[0] ?? {}, ["report_count", "rowIds"]); };
const ECHO = {
  // 콴사(운영 딜 188 — 보도 20391·20418): 두 칼럼이 같은 빌트 보도를 다른 문장으로 옮겼다. 판정 요약까지 같다
  bild: fold([
    CITED(9001, "rss:bbc-gossip", "2026-10-01T19:45:16Z", "Real Madrid are showing an interest in Bayer Leverkusen's 23-year-old England defender John Doe, who Arsenal made a bid for in the summer. (Bild)"),
    CITED(9002, "rss:sky-transfers", "2026-10-01T21:41:00Z", "Real Madrid are keen on signing former Liverpool defender John Doe from Bayer Leverkusen (Bild)"),
  ]),
  // 같은 신문 인용 + 판정 필드가 같으면 요약이 달라도 접는다
  bildFields: fold([
    CITED(9011, "rss:bbc-gossip", "2026-10-01T19:45:16Z", "Real Madrid are showing an interest in Bayer Leverkusen defender John Doe. (Bild)", { summary_ko: "레알 마드리드가 레버쿠젠 수비수 존 도에게 관심을 보인다고 빌트가 전했다." }),
    CITED(9012, "rss:sky-transfers", "2026-10-01T21:41:00Z", "Real Madrid are keen on signing John Doe from Bayer Leverkusen (Bild)"),
  ]),
  // 48시간을 넘으면 같은 요약이어도 따로 센다(같은 관심이 다시 보도된 것이다)
  apart: fold([
    CITED(9021, "rss:bbc-gossip", "2026-09-26T19:45:16Z", "Real Madrid are showing an interest in Bayer Leverkusen defender John Doe. (Bild)"),
    CITED(9022, "rss:sky-transfers", "2026-10-01T21:41:00Z", "Real Madrid are keen on signing John Doe from Bayer Leverkusen (Bild)"),
  ]),
  // 다른 신문 · 다른 요약이면 다른 보도다(판정 필드가 같아도)
  distinct: fold([
    CITED(9031, "rss:bbc-gossip", "2026-10-01T19:45:16Z", "Real Madrid are showing an interest in Bayer Leverkusen defender John Doe. (Bild)"),
    CITED(9032, "rss:sky-transfers", "2026-10-01T21:41:00Z", "Real Madrid are keen on signing John Doe from Bayer Leverkusen (Marca)", { attributed_to: "Marca", summary_ko: "마르카는 레알 마드리드가 레버쿠젠의 존 도 영입을 검토한다고 보도했다." }),
  ]),
  // 대표는 원보도(인용이 아닌 행)다 — 나중에 게시됐어도
  original: fold([
    CITED(9041, "rss:bbc-gossip", "2026-10-01T19:45:16Z", "Real Madrid are showing an interest in Bayer Leverkusen defender John Doe. (Bild)"),
    row("Real Madrid are keen on Bayer Leverkusen defender John Doe, Bild reports.", { id: 9042, source_id: "rss:standard-football", published_at: "2026-10-01T22:00:00Z", stage: "rumour", ...MOVE({ verdict_stage: "rumour", verdict_from: "Bayer Leverkusen", verdict_to: "Real Madrid", summary_ko: QS }) }),
  ]),
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
// ── 판정 흔들림이 보드로 번지지 않게 — 우선순위 · 재시도 간격 · 본문 재시도 · 부분 판정 · 단계 히스테리시스 ──
const HOUR = 3_600_000;
const ago = (ms) => new Date(NOW - ms).toISOString();
const RSS = { source_id: "rss:bbc-football", url: "https://www.bbc.co.uk/sport/football/articles/x1" };
const need = (id, playerKey, priority) => ({ id, playerKey, priority });
// 우선순위 정렬 — 탐색용(playerKey null)은 상한 안에서 exploreMax건까지만 앞에 둔다
const ORDER = {
  tiers: orderJudgeNeeds([need(1, null, 4e13), need(2, "a", 3e13), need(3, "b", 2e13), need(4, "c", 1e13)]).map((x) => x.id),
  capped: orderJudgeNeeds([need(1, null, 4e13 + 1), need(2, null, 4e13 + 2), need(3, null, 4e13 + 3), need(4, "a", 3e13 + 9), need(5, "b", 3e13 + 8)], { limit: 3, exploreMax: 1 }).map((x) => x.id),
  ties: orderJudgeNeeds([need(9, "a", 5), need(3, "b", 5)]).map((x) => x.id),
};
// 파생이 매기는 층 — 규칙 완료·확정 > 새 딜 > 기존 딜 > 탐색, 같은 층은 최신이 먼저
const PRIO_ROWS = () => [
  row("Chelsea agree deal for John Doe from Benfica.", { id: 901, stage: "agreement", published_at: ago(5 * 86_400_000) }),
  row("Chelsea agree deal for John Doe from Benfica, medical next.", { id: 902, stage: "agreement", published_at: ago(1 * 86_400_000) }),
  row("Arsenal want Jack Roe from Porto.", { id: 903, stage: "rumour", players: ["Jack Roe"], published_at: ago(2 * 86_400_000) }),
  row("Official: Arsenal sign Jack Roe from Porto.", { id: 904, stage: "official", players: ["Jack Roe"], published_at: ago(3 * 86_400_000) }),
  row("Bayern Munich would move for the Chelsea winger.", { id: 905, stage: "rumour", players: [], published_at: ago(HOUR) }),
];
// 이월 — 앞 실행에서 일시 실패로 판정을 못 받은 행(판정 시각 없이 verdict_attempts만 있다)은 같은 층에서 먼저 묻는다(층은 넘지 않는다)
const CARRIED = deriveDeals(PRIO_ROWS().map((r) => (r.id === 901 ? { ...r, verdict_attempts: 1 } : r)), { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: { ...DICT, "jack roe": { ko: "잭 로" } } }), requireVerified: true, requireVerdict: true, existingKeys: new Set([JOHN]) });
const PRIO = deriveDeals(PRIO_ROWS(), { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: { ...DICT, "jack roe": { ko: "잭 로" } } }), requireVerified: true, requireVerdict: true, existingKeys: new Set([JOHN]) });
// 재시도 간격 · 요약만 · 본문 재시도 · 지문 · 옛 형식 승격의 반복 방지
const MODE = {
  backoffWait: judgeMode({ verdict: null, verdict_player: "john doe", verdict_at: ago(30 * HOUR), verdict_attempts: 2 }, "john doe", NOW),
  backoffDue: judgeMode({ verdict: null, verdict_player: "john doe", verdict_at: ago(49 * HOUR), verdict_attempts: 2 }, "john doe", NOW),
  backoffCap: judgeMode({ verdict: null, verdict_player: "john doe", verdict_at: ago(169 * HOUR), verdict_attempts: 9 }, "john doe", NOW),
  articleRetry: judgeMode({ ...RSS, verdict: "move", verdict_player: "john doe", verdict_raw: "{}", summary_ko: "요약", verdict_at: ago(25 * HOUR), verdict_attempts: 1, verdict_article_chars: 0, published_at: ago(2 * 86_400_000) }, "john doe", NOW),
  articleSpent: judgeMode({ ...RSS, verdict: "move", verdict_player: "john doe", verdict_raw: "{}", summary_ko: "요약", verdict_at: ago(200 * HOUR), verdict_attempts: 3, verdict_article_chars: 0, published_at: ago(2 * 86_400_000) }, "john doe", NOW),
  articleOld: judgeMode({ ...RSS, verdict: "move", verdict_player: "john doe", verdict_raw: "{}", summary_ko: "요약", verdict_at: ago(25 * HOUR), verdict_attempts: 0, verdict_article_chars: 0, published_at: ago(5 * 86_400_000) }, "john doe", NOW),
  articleGot: judgeMode({ ...RSS, verdict: "move", verdict_player: "john doe", verdict_raw: "{}", summary_ko: "요약", verdict_at: ago(25 * HOUR), verdict_attempts: 0, verdict_article_chars: 2400, published_at: ago(2 * 86_400_000) }, "john doe", NOW),
  articleTelegram: judgeMode({ source_id: "tg:romano", url: "https://t.me/x/1", verdict: "move", verdict_player: "john doe", verdict_raw: "{}", summary_ko: "요약", verdict_at: ago(25 * HOUR), verdict_attempts: 0, verdict_article_chars: 0, published_at: ago(2 * 86_400_000) }, "john doe", NOW),
  stale: judgeMode({ verdict: "move", verdict_player: "john doe", verdict_raw: "{}", summary_ko: "요약", verdict_at: ago(HOUR), verdict_prompt: "aaaaaaaaaaaa" }, "john doe", NOW, { stalePrompt: "bbbbbbbbbbbb" }),
  fresh: judgeMode({ verdict: "move", verdict_player: "john doe", verdict_raw: "{}", summary_ko: "요약", verdict_at: ago(HOUR), verdict_prompt: "bbbbbbbbbbbb" }, "john doe", NOW, { stalePrompt: "bbbbbbbbbbbb" }),
  upgradeFailedRecent: judgeMode({ verdict: "move", verdict_player: "john doe", verdict_raw: null, summary_ko: "요약", verdict_at: ago(HOUR), verdict_attempts: 1 }, "john doe", NOW, { upgrade: true }),
  upgradeFirst: judgeMode({ verdict: "move", verdict_player: "john doe", verdict_raw: null, summary_ko: "요약", verdict_at: ago(HOUR), verdict_attempts: 0 }, "john doe", NOW, { upgrade: true }),
};
// 본문 없이 난 "이동 아님"도 본문을 받으러 다시 묻는다(딜에는 들지 않는다)
const NOTMOVE_ARTICLE = judged([
  row("Chelsea agree deal for John Doe from Benfica.", { ...RSS, ...V("not_move", { verdict_at: ago(25 * HOUR), verdict_attempts: 1, verdict_article_chars: 0 }), published_at: ago(2 * 86_400_000) }),
  row("Chelsea in talks for John Doe from Benfica.", { stage: "talks", ...V("move", { verdict_raw: "{}", verdict_stage: "talks", verdict_to: "Chelsea" }) }),
]);
// 판정 커버리지가 다 차지 않은 딜 — 보도 수는 전 보도, 단계는 판정받은 보도. 후퇴는 저장된 단계를 지킨다
const stored = (stage, settled_at = null) => new Map([[JOHN, { stage, settled_at }]]);
const withStored = (rows, map) => deriveDeals(rows, { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: DICT }), requireVerified: true, requireVerdict: true, existingKeys: map });
const RUMOURS = () => Array.from({ length: 4 }, (_, i) => row(`Chelsea keen on John Doe of Benfica (${i}).`, { stage: "rumour" }));
const HYST = {
  // 루머 4건(판정 전) + 맨 나중 부인 1건만 먼저 판정 — 저장된 루머를 지킨다(알림이 나가지 않는다)
  heldDenied: withStored([...RUMOURS(), row("Chelsea deny interest in John Doe of Benfica.", ST("denied"))], stored("rumour")),
  // 같은 상황인데 저장된 딜 단계를 모르면(Set) 판정대로 간다 — 지키는 근거는 저장된 단계뿐이다
  noStored: withStored([...RUMOURS(), row("Chelsea deny interest in John Doe of Benfica.", ST("denied"))], new Set([JOHN])),
  // 진전은 곧바로 — 저장된 루머, 합의 판정이 먼저 오면 합의
  progress: withStored([...RUMOURS(), row("Chelsea agree deal for John Doe from Benfica.", ST("agreement"))], stored("rumour")),
  // 커버리지가 차면 판정대로 간다(마지막이 부인 · 협상 이력 없음 → 부인)
  covered: withStored([row("Chelsea keen on John Doe of Benfica.", ST("rumour")), row("Chelsea deny interest in John Doe of Benfica.", ST("denied"))], stored("rumour")),
  // 반복 실패로 포기한 보도는 커버리지를 막지 않는다
  givenUp: withStored([row("Chelsea keen on John Doe of Benfica.", { stage: "rumour", verdict: null, verdict_player: "john doe", verdict_at: ago(HOUR), verdict_attempts: 3 }), row("Chelsea deny interest in John Doe of Benfica.", ST("denied"))], stored("rumour")),
  // 결과 시각 — 커버리지가 덜 찼으면 저장된 값을 지키고, 차면 보도로 다시 정한다
  settledKept: withStored([row("Here we go: John Doe to Chelsea from Benfica.", ST("here_we_go")), row("Chelsea keen on John Doe of Benfica.", { stage: "rumour" })], stored("here_we_go", "2026-07-02T00:00:00+00:00")),
  settledCovered: withStored([row("Here we go: John Doe to Chelsea from Benfica.", { ...ST("here_we_go"), published_at: "2026-07-05T00:00:00.000Z" })], stored("here_we_go", "2026-07-02T00:00:00+00:00")),
};
/*
 * 순서 민감도 — 같은 보도 묶음에 판정이 도착하는 **순서만** 바꿔 매 단계 저장된 딜(단계·결과 시각)을 다음 파생에 넘긴다.
 * 판정이 다 도착한 뒤의 딜(단계·보도 수·결과 시각·최근 보도 시각)은 순서와 무관해야 하고, 도중에 단계가 후퇴해서도 안 된다.
 */
function permutations(arr) {
  return arr.length <= 1 ? [arr] : arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}
function arrivalRuns(specs) {
  const base = specs.map(([body, stage], i) => ({ id: 700 + i, body, stage, published_at: new Date(Date.UTC(2026, 6, 1 + i)).toISOString() }));
  const make = (judgedIds) => base.map((b) => row(b.body, { id: b.id, published_at: b.published_at, ...(judgedIds.has(b.id) ? ST(b.stage) : { stage: b.stage }) }));
  const outcomes = new Set();
  let regressed = 0;
  for (const order of permutations(base.map((b) => b.id))) {
    let map = new Map();
    let prev = null;
    let finalDeal = null;
    for (let k = 1; k <= order.length; k++) {
      const d = withStored(make(new Set(order.slice(0, k))), map).deals[0];
      if (!d) continue;
      // 도중 후퇴 = 저장된 단계와 다른데 holdStage가 바꾸지 말았어야 할 방향(마지막 단계는 커버리지가 차 판정대로 간다)
      if (k < order.length && prev && holdStage(d.stage, prev) !== d.stage) regressed += 1;
      prev = d.stage;
      map = new Map([[JOHN, { stage: d.stage, settled_at: d.settled_at }]]);
      finalDeal = d;
    }
    outcomes.add(JSON.stringify(pick(finalDeal, ["stage", "report_count", "settled_at", "latest_reported_at"])));
  }
  return { outcomes: [...outcomes].map((o) => JSON.parse(o)), regressed };
}
const ORDERS = {
  // 협상 → 루머 → 부인 → 루머: 다 도착하면 되살아난 루머
  saga: arrivalRuns([["Chelsea in talks for John Doe from Benfica.", "talks"], ["Chelsea keen on John Doe of Benfica.", "rumour"], ["Chelsea deny interest in John Doe of Benfica.", "denied"], ["Chelsea still want John Doe of Benfica.", "rumour"]]),
  // 합의 완료 → 루머 → 오피셜: 결과 시각은 처음 나온 합의 완료 보도의 시각
  settled: arrivalRuns([["Here we go: John Doe to Chelsea from Benfica.", "here_we_go"], ["Chelsea keen on John Doe of Benfica.", "rumour"], ["Official: Chelsea sign John Doe from Benfica.", "official"]]),
};
// 대표 행 — 같은 보도의 개정판 중 판정 있는 행이 대표다(판정 없는 새 개정판이 판정을 빼앗지 않는다)
const REP = dedupeRows([
  { id: 1, url: BBC, body: "Chelsea agree deal for John Doe from Benfica.", published_at: "2026-07-10T00:00:00Z", verdict: "move" },
  { id: 2, url: BBC, body: "Chelsea agree deal for John Doe from Benfica. Medical booked.", published_at: "2026-07-10T00:00:00Z" },
]);

// ── 검토 재현 사례 — 금액 시점 오탐 · 접기 연쇄 · 접기와 단계 · 미확인 기존 딜 · 본문 재시도 · 이월 · 결과 시각 ──
const PAST = {
  // 앞으로의 일 — "in the January transfer window"·"over the summer"는 과거 동사 없이 지난 때가 아니다
  futureWindow: judged([row("Chelsea are planning a £60m bid for Benfica's John Doe in the January transfer window.", { stage: "rumour", ...BID(60, { verdict_from: "Benfica", verdict_to: "Chelsea" }) })]),
  futureSummer: judged([row("Chelsea will table a £60m bid for John Doe of Benfica over the summer.", { stage: "rumour", ...BID(60, { verdict_from: "Benfica", verdict_to: "Chelsea" }) })]),
  // 대조 — 과거 동사와 함께면 지난 때다
  pastSummerVerb: judged([row("Chelsea had a £60m bid for John Doe rejected by Benfica over the summer.", { stage: "rumour", ...BID(60, { verdict_from: "Benfica", verdict_to: "Chelsea" }) })]),
  // "previous"는 가장 가까운 금액(£60m)의 것이다 — 같은 절의 지금 제안(£70m)을 거르지 않는다
  previousOther: judged([row("Chelsea submitted a £70m bid for John Doe after a previous £60m offer was rejected by Benfica.", { stage: "rumour", ...BID(70, { verdict_from: "Benfica", verdict_to: "Chelsea" }) })]),
  previousSame: judged([row("Chelsea submitted a £70m bid for John Doe after a previous £60m offer was rejected by Benfica.", { stage: "rumour", ...BID(60, { verdict_from: "Benfica", verdict_to: "Chelsea" }) })]),
  // 한국어 "지난 시즌"이 선수의 활약을 꾸민다 — 금액의 때가 아니다
  koPerformance: judged([row("Chelsea make £60m bid for Benfica star John Doe.", { stage: "rumour", ...BID(60, { verdict_from: "Benfica", verdict_to: "Chelsea", summary_ko: "첼시가 지난 시즌 20골을 넣은 벤피카의 존 도에게 6000만 파운드 제안을 넣었다." }) })]),
  // 대조 — "지난여름 거절된 6000만 파운드 제안"은 금액을 꾸민다
  koModifies: judged([row("Chelsea revive £60m bid for Benfica star John Doe.", { stage: "rumour", ...BID(60, { verdict_from: "Benfica", verdict_to: "Chelsea", summary_ko: "첼시가 지난여름 거절된 6000만 파운드 제안을 다시 꺼냈다." }) })]),
  koThen: judged([row("Chelsea revive £60m bid for Benfica star John Doe.", { stage: "rumour", ...BID(60, { verdict_from: "Benfica", verdict_to: "Chelsea", summary_ko: "첼시는 당시 £60m을 제시했고 벤피카가 거절했다." }) })]),
  // 한 자리 금액(£1m)이 같은 절의 다른 숫자(£12m)의 앞자리에 맞지 않는다
  koDigit: judged([row("Chelsea improve their offer for John Doe by £1m.", { stage: "rumour", ...BID(1, { verdict_from: "Benfica", verdict_to: "Chelsea", summary_ko: "첼시가 지난여름 거절된 £12m 제안 뒤 존 도에게 £1m 인상안을 냈다." }) })]),
};
const ES = "레알 마드리드가 바이어 레버쿠젠 소속 존 도 영입에 관심을 보이고 있다.";
const ECHO_ROW = (id, hours, extra = {}) => row(`Real Madrid keen on John Doe of Bayer Leverkusen ${id}.`, { id, stage: "rumour", source_id: `rss:s${id}`, published_at: new Date(Date.UTC(2026, 8, 10) + hours * HOUR).toISOString(), ...MOVE({ verdict_stage: "rumour", verdict_from: "Bayer Leverkusen", verdict_to: "Real Madrid", summary_ko: ES, ...extra }) });
const CHAIN_ROWS = () => [ECHO_ROW(9101, 0), ECHO_ROW(9102, 40), ECHO_ROW(9103, 80), ECHO_ROW(9104, 120)];
const ECHO2 = {
  chain: judged(CHAIN_ROWS()),
  chainReversed: judged(CHAIN_ROWS().reverse()),
  // 요약이 같아도 단계가 다르면 접지 않는다 — 더 진전된 판정(합의)이 사라지지 않게
  stage: judged([ECHO_ROW(9111, 5, { verdict_stage: "agreement" }), { ...ECHO_ROW(9112, 1), stage: "rumour" }].map((r) => (r.id === 9111 ? { ...r, stage: "agreement", attribution: "cited", attributed_to: "Bild" } : r))),
};
// 미확인 선수 — 두 출처가 같은 요약이면 접혀 출처가 하나가 된다. 새 딜은 열지 않지만 이미 저장된 딜은 남긴다
const KID_SUMMARY = "맨체스터 유나이티드가 리버풀의 유망주 키드 언노운 영입을 추진하고 있다.";
const KID_ROWS = () => [
  row("Manchester United want Kid Unknown from Liverpool.", { stage: "rumour", published_at: "2026-09-20T00:00:00Z", ...YOUTH({ verdict_stage: "rumour", summary_ko: KID_SUMMARY }) }),
  row("Kid Unknown is a target for Manchester United, Liverpool fear.", { stage: "rumour", source_id: "rss:bbc-football", published_at: "2026-09-20T03:00:00Z", ...YOUTH({ verdict_stage: "rumour", summary_ko: KID_SUMMARY }) }),
];
const KID = dealKey(normalizePlayer("Kid Unknown"));
const UNVERIFIED = { fresh: judged(KID_ROWS()), stored: judged(KID_ROWS(), [KID]) };
// 본문 재시도는 기존 딜 층 아래로 · 반복 실패는 판정이 없는 행만
const ARTICLE = deriveDeals([
  row("Chelsea agree deal for John Doe from Benfica.", { id: 9201, ...RSS, ...MOVE({ verdict_stage: "agreement", verdict_to: "Chelsea", verdict_from: "Benfica", verdict_at: ago(25 * HOUR), verdict_attempts: 1, verdict_article_chars: 0 }), published_at: ago(2 * 86_400_000) }),
  row("Arsenal want Jack Roe from Porto.", { id: 9202, stage: "rumour", players: ["Jack Roe"], published_at: ago(3 * 86_400_000) }),
], { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: { ...DICT, "jack roe": { ko: "잭 로" } } }), requireVerified: true, requireVerdict: true, existingKeys: new Set([JOHN]) });
const FAILS = deriveDeals([
  row("Chelsea agree deal for John Doe from Benfica.", { ...RSS, ...MOVE({ verdict_stage: "agreement", verdict_to: "Chelsea", verdict_at: ago(HOUR), verdict_attempts: 3, verdict_article_chars: 0 }) }),
  row("Arsenal want Jack Roe from Porto.", { stage: "rumour", players: ["Jack Roe"], verdict: null, verdict_player: "jack roe", verdict_at: ago(HOUR), verdict_attempts: 3 }),
], { nowMs: NOW, windows: WINDOWS, names: createNameBook({ players: { ...DICT, "jack roe": { ko: "잭 로" } } }), requireVerified: true, requireVerdict: true, existingKeys: new Set([JOHN]) });
// 이월 — CARRIED_DAILY_ATTEMPTS번 이상 이월된 행은 하루 한 번(UTC 시 % 24 === id % 24)만 묻고 앞당기지 않는다
const CARRY = (id, attempts) => ({ id, verdict: null, verdict_player: null, verdict_at: null, verdict_attempts: attempts });
const SLOT_NOW = NOW + (901 % 24) * HOUR; // NOW는 UTC 0시 — 행 901의 시간
const CARRIED_DAILY = deriveDeals(PRIO_ROWS().map((r) => (r.id === 901 ? { ...r, verdict_attempts: CARRIED_DAILY_ATTEMPTS } : r)), { nowMs: SLOT_NOW, windows: WINDOWS, names: createNameBook({ players: { ...DICT, "jack roe": { ko: "잭 로" } } }), requireVerified: true, requireVerdict: true, existingKeys: new Set([JOHN]) });
// 결과 시각 — 저장된 오피셜인데 결과 시각이 빈 옛 데이터
const SETTLE = {
  // 합의 완료·오피셜 보도가 하나도 없으면 null(가장 이른 루머 시각을 짓지 않는다)
  none: withStored([row("Chelsea keen on John Doe of Benfica.", ST("rumour")), row("John Doe has a medical at Chelsea, Benfica confirm.", { stage: "medical" })], stored("official", null)),
  // 판정 전 보도에 오피셜이 있으면 그 시각
  unjudged: withStored([row("Chelsea keen on John Doe of Benfica.", ST("rumour")), row("Official: Chelsea sign John Doe from Benfica.", { stage: "official", published_at: "2026-09-21T00:00:00Z" })], stored("official", null)),
};

const UNIT = [
  { name: "우선순위 — priority가 작은 것부터(층 순서)", got: ORDER.tiers, want: [4, 3, 2, 1] },
  { name: "우선순위 — 상한 안에서 탐색용은 exploreMax건까지만 앞에 두고 나머지는 뒤로 민다", got: ORDER.capped, want: [5, 4, 1, 2, 3] },
  { name: "우선순위 — 같은 priority면 행 id 순(결정적)", got: ORDER.ties, want: [3, 9] },
  {
    name: "우선순위 — 파생이 매기는 순서: 규칙 오피셜 > 새 딜 > 기존 딜(최신 먼저) > 탐색",
    got: PRIO.judgeNeeds.map((x) => x.id),
    want: [904, 903, 902, 901, 905],
  },
  { name: "원출력 표지 — 값을 읽지 않은 행은 표지로, 판정·재생이 값을 입힌 행은 그 값으로 판정한다", got: [hasRawVerdict({ has_raw: true }), hasRawVerdict({ has_raw: false }), hasRawVerdict({ has_raw: true, verdict_raw: null }), hasRawVerdict({ has_raw: false, verdict_raw: "{}" }), hasRawVerdict({})], want: [true, false, false, true, false] },
  { name: "우선순위 — 물을 대상에 게시 시각·방식·옛 판정을 싣는다", got: [PRIO.judgeNeeds[0].published_at === PRIO_ROWS()[3].published_at, PRIO.judgeNeeds[0].mode, Object.keys(PRIO.judgeNeeds[0].prev).length, PRIO.judgeNeeds[0].prev.verdict_attempts], want: [true, "full", 13, 0] },
  { name: "우선순위 — 이월된 행은 같은 층의 새 보도보다 먼저, 다른 층은 넘지 않는다", got: CARRIED.judgeNeeds.map((x) => x.id), want: [904, 903, 901, 902, 905] },
  { name: "우선순위 — 이월된 행은 실패 수와 무관하게 다음 실행이 곧바로 묻는다(재시도 간격은 판정 시각이 있는 행에만)", got: judgeMode({ verdict: null, verdict_player: "john doe", verdict_at: null, verdict_attempts: 2 }, "john doe", NOW), want: "full" },
  { name: "금액 시점 — \"in the January transfer window\"의 제안은 앞으로의 일이다", got: PAST.futureWindow.deals[0]?.fee_amount, want: 60 },
  { name: "금액 시점 — \"will table … over the summer\"는 앞으로의 일이다", got: PAST.futureSummer.deals[0]?.fee_amount, want: 60 },
  { name: "금액 시점 — \"over the summer\"도 과거 동사(had … rejected)와 함께면 지난 금액이다", got: PAST.pastSummerVerb.deals[0]?.fee_amount ?? null, want: null },
  { name: "금액 시점 — previous는 가장 가까운 금액의 것이다(£70m 지금 제안은 쓰고 £60m 지난 제안은 거른다)", got: [PAST.previousOther.deals[0]?.fee_amount, PAST.previousSame.deals[0]?.fee_amount ?? null], want: [70, null] },
  { name: "금액 시점 — 한국어 \"지난 시즌 20골을 넣은\"은 선수를 꾸민다(금액의 때가 아니다)", got: PAST.koPerformance.deals[0]?.fee_amount, want: 60 },
  { name: "금액 시점 — 한국어 \"지난여름 거절된 6000만 파운드\"·\"당시 £60m\"은 지난 금액이다", got: [PAST.koModifies.deals[0]?.fee_amount ?? null, PAST.koThen.deals[0]?.fee_amount ?? null], want: [null, null] },
  { name: "금액 시점 — 한 자리 금액(£1m)이 다른 금액(£12m)의 앞자리에 맞지 않는다", got: PAST.koDigit.deals[0]?.fee_amount, want: 1 },
  { name: "같은 보도 — 연쇄하지 않는다(0·40·80·120시간 → 대표 둘), 접힌 행의 시각은 최근 보도 시각에 든다", got: pick(ECHO2.chain.deals[0] ?? {}, ["report_count", "rowIds", "first_reported_at", "latest_reported_at"]), want: { report_count: 2, rowIds: [9101, 9103], first_reported_at: "2026-09-10T00:00:00.000Z", latest_reported_at: "2026-09-15T00:00:00.000Z" } },
  { name: "같은 보도 — 입력 순서가 달라도 같다", got: pick(ECHO2.chainReversed.deals[0] ?? {}, ["report_count", "rowIds"]), want: { report_count: 2, rowIds: [9101, 9103] } },
  { name: "같은 보도 — 단계가 다르면 접지 않는다(합의 판정이 남는다)", got: pick(ECHO2.stage.deals[0] ?? {}, ["stage", "report_count"]), want: { stage: "agreement", report_count: 2 } },
  { name: "미확인 선수 — 접혀 출처가 하나가 되면 새 딜은 열지 않지만, 이미 저장된 딜은 남긴다", got: [UNVERIFIED.fresh.deals.length, UNVERIFIED.stored.deals.map((d) => [d.player, d.report_count])], want: [0, [["Kid Unknown", 1]]] },
  { name: "본문 재시도 — mode article이고 기존 딜 층 아래다(새 딜의 보도가 먼저)", got: ARTICLE.judgeNeeds.map((x) => [x.id, x.mode]), want: [[9202, "full"], [9201, "article"]] },
  { name: "반복 실패 — 판정이 없는 행만 센다(본문만 못 받은 성공 판정은 아니다)", got: FAILS.repeatedFailures, want: 1 },
  { name: "이월 — 여섯 번 넘게 이월된 행은 하루 한 번(그 행의 시간)만 묻는다, 그 전엔 매시", got: [judgeMode(CARRY(24, 6), "john doe", NOW), judgeMode(CARRY(5, 6), "john doe", NOW), judgeMode(CARRY(5, 6), "john doe", NOW + 5 * HOUR), judgeMode(CARRY(5, 5), "john doe", NOW)], want: ["full", null, "full", "full"] },
  { name: "이월 — 하루 한 번으로 늦춘 행은 앞당기지 않는다", got: CARRIED_DAILY.judgeNeeds.map((x) => x.id), want: [904, 903, 902, 901, 905] },
  { name: "결과 시각 — 저장 오피셜인데 결과 시각이 비었고 합의 완료·오피셜 보도가 없으면 null(루머 시각을 짓지 않는다)", got: pick(SETTLE.none.deals[0] ?? {}, ["stage", "settled_at"]), want: { stage: "official", settled_at: null } },
  { name: "결과 시각 — 판정 전 보도의 오피셜이 있으면 그 시각", got: SETTLE.unjudged.deals[0]?.settled_at, want: "2026-09-21T00:00:00.000Z" },
  { name: "우선순위 — 층 상수", got: JUDGE_TIER, want: { settled: 1, newDeal: 2, existing: 3, explore: 4 } },
  { name: "재시도 간격 — 24h × 2^(실패−1), 상한 7일(0·옛 행은 24h)", got: [0, 1, 2, 3, 4, 5].map((a) => retryDelayMs(a) / HOUR), want: [24, 24, 48, 96, 168, 168] },
  { name: "재시도 간격 — 두 번 실패한 판정 불가는 48시간 전에 다시 묻지 않는다", got: [MODE.backoffWait, MODE.backoffDue, MODE.backoffCap], want: [null, "full", "full"] },
  { name: "요약 재시도 — 이동인데 요약이 없으면 요약만 다시 묻는다(mode summary)", got: VERDICT.noSummaryRecent.judgeNeeds.map((x) => x.mode), want: ["summary"] },
  { name: "본문 재시도 — 매체 RSS 판정이 본문 없이 났으면 다시 묻는다(최대 2회 · 게시 4일 안 · 본문 받은 판정·텔레그램은 아니다)", got: [MODE.articleRetry, MODE.articleSpent, MODE.articleOld, MODE.articleGot, MODE.articleTelegram], want: ["article", null, null, null, null] },
  { name: "본문 재시도 — 본문 없이 난 '이동 아님'도 다시 묻고 딜에는 들지 않는다", got: [NOTMOVE_ARTICLE.judgeNeeds.map((x) => [x.mode, x.prev.verdict]), NOTMOVE_ARTICLE.deals[0]?.report_count], want: [[["article", "not_move"]], 1] },
  { name: "지문 — 지금 지시문과 다른 지문으로 난 판정만 다시 묻는다(--rejudge-stale)", got: [MODE.stale, MODE.fresh], want: ["full", null] },
  { name: "옛 형식 승격 — 한 번 다시 물어 실패한 행(원출력이 여전히 없다)은 실패 간격 전에 또 묻지 않는다", got: [MODE.upgradeFirst, MODE.upgradeFailedRecent], want: ["full", null] },
  { name: "부분 판정 — 저장된 루머 딜에 부인 1건만 먼저 판정되면 루머를 지킨다(보도 수는 전 보도)", got: pick(HYST.heldDenied.deals[0] ?? {}, ["stage", "report_count"]), want: { stage: "rumour", report_count: 5 } },
  { name: "부분 판정 — 저장된 단계를 모르면 판정대로 간다", got: HYST.noStored.deals[0]?.stage, want: "denied" },
  { name: "부분 판정 — 진전은 곧바로 반영한다", got: HYST.progress.deals[0]?.stage, want: "agreement" },
  { name: "부분 판정 — 커버리지가 차면 후퇴도 반영한다", got: HYST.covered.deals[0]?.stage, want: "denied" },
  { name: "부분 판정 — 반복 실패(3회)로 포기한 보도는 커버리지를 막지 않는다", got: HYST.givenUp.deals[0]?.stage, want: "denied" },
  { name: "holdStage — 후퇴(진전 순위 하락·죽은 단계로)는 지키고, 진전·되살아남·죽은 단계끼리는 반영", got: [holdStage("rumour", "agreement"), holdStage("denied", "talks"), holdStage("official", "rumour"), holdStage("rumour", "denied"), holdStage("collapsed", "denied"), holdStage("talks", null)], want: ["agreement", "talks", "official", "rumour", "collapsed", "talks"] },
  { name: "결과 시각 — 커버리지가 덜 찼고 여전히 합의 완료면 저장된 값을 지킨다", got: HYST.settledKept.deals[0]?.settled_at, want: "2026-07-02T00:00:00.000Z" },
  { name: "결과 시각 — 커버리지가 차면 보도로 다시 정한다", got: HYST.settledCovered.deals[0]?.settled_at, want: "2026-07-05T00:00:00.000Z" },
  { name: "순서 민감도 — 협상·루머·부인·루머 판정이 어떤 순서로 도착해도 최종 딜이 같고 도중에 후퇴하지 않는다", got: [ORDERS.saga.outcomes.length, ORDERS.saga.outcomes[0]?.stage, ORDERS.saga.outcomes[0]?.report_count, ORDERS.saga.regressed], want: [1, "rumour", 4, 0] },
  { name: "순서 민감도 — 합의 완료·루머·오피셜이 어떤 순서로 도착해도 단계·결과 시각이 같다", got: [ORDERS.settled.outcomes.length, ORDERS.settled.outcomes[0]?.stage, ORDERS.settled.outcomes[0]?.settled_at, ORDERS.settled.regressed], want: [1, "official", "2026-07-01T00:00:00.000Z", 0] },
  { name: "대표 행 — 같은 보도의 개정판 중 판정 있는 행이 대표다", got: REP.reps.map((r) => r.id), want: [1] },

  { name: "단계 — 부인 뒤에 루머가 다시 이어지면 되살아난 것이다(중간의 부인이 딜을 죽이지 않는다)", got: SAGA.revived.deals[0]?.stage, want: "rumour" },
  { name: "단계 — 가장 나중 보도가 부인이고 협상까지 갔었으면 결렬", got: SAGA.deadLast.deals[0]?.stage, want: "collapsed" },
  { name: "단계 — 가장 나중 보도가 부인이고 루머까지였으면 부인", got: SAGA.deniedLast.deals[0]?.stage, want: "denied" },
  { name: "이름 — 줄여 쓴 이름은 긴 이름의 딜로 합친다(딜이 둘로 갈리지 않고, 줄인 이름의 보도는 긴 이름으로 다시 묻고 보도 수에는 든다)", got: [SAGA.suffix.deals.map((d) => [d.player, d.report_count]), SAGA.suffix.judgeNeeds.map((x) => x.player)], want: [[["John van Doe", 2]], ["John van Doe"]] },
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
  { name: "금액 — 판정이 있는 딜에서 성격 없는 규칙 금액(옛 형식 판정)은 쓰지 않는다 — 누구의 금액인지 모른다", got: pick(WIDE.feeOldFormat.deals[0] ?? {}, ["fee_amount", "fee_kind"]), want: { fee_amount: null, fee_kind: null } },
  { name: "금액 — 판정이 없는 딜(규칙만)은 규칙 금액을 쓴다", got: pick(FEE.unjudgedRule.deals[0] ?? {}, ["fee_amount", "fee_kind"]), want: { fee_amount: 47, fee_kind: null } },
  { name: "금액 — 지난 창에 거절된 제안(근거 구절 \"in July … knocked back\")은 딜 금액이 아니다(스콧)", got: pick(FEE.pastBid.deals[0] ?? {}, ["fee_amount", "fee_kind"]), want: { fee_amount: null, fee_kind: null } },
  { name: "금액 — 한국어 요약의 금액 절이 지난 때(\"지난여름\")를 말하면 딜 금액이 아니다", got: FEE.pastBidKo.deals[0]?.fee_amount, want: null },
  { name: "금액 — 딜의 상대(관심 구단 맨 앞 첼시)가 아닌 구단(아스날)의 제안은 딜 금액이 아니다(콴사)", got: pick(FEE.otherClubBid.deals[0] ?? {}, ["fee_amount", "to_club_code"]), want: { fee_amount: null, to_club_code: "chelsea" } },
  { name: "금액 — 딜의 상대가 낸 지금의 제안은 쓴다", got: pick(FEE.currentBid.deals[0] ?? {}, ["fee_amount", "fee_kind"]), want: { fee_amount: 50, fee_kind: "bid" } },
  { name: "금액 — 요구액은 파는 쪽의 값이라 행선지가 없어도 쓴다", got: pick(FEE.askingPrice.deals[0] ?? {}, ["fee_amount", "fee_kind"]), want: { fee_amount: 80, fee_kind: "asking_price" } },
  { name: "금액 — 지금 구단이 데려올 때 낸 지난 이적료는 딜 금액이 아니다(무하레모비치)", got: FEE.pastFee.deals[0]?.fee_amount, want: null },
  { name: "금액 — 완료 보도의 이적료는 달 이름·과거 동사가 있어도 쓴다", got: pick(FEE.officialFee.deals[0] ?? {}, ["fee_amount", "fee_kind"]), want: { fee_amount: 50, fee_kind: "fee" } },
  { name: "금액 — 지난 제안을 거르면 직전·범위도 남은 후보로만 센다", got: pick(FEE.pastThenCurrent.deals[0] ?? {}, ["fee_amount", "prev_fee_amount", "fee_low_amount", "fee_high_amount"]), want: { fee_amount: 70, prev_fee_amount: null, fee_low_amount: 70, fee_high_amount: 70 } },
  { name: "같은 보도 — 두 칼럼이 같은 신문(빌트)을 옮기고 요약이 같으면 한 보도다(먼저 게시된 행이 대표)", got: ECHO.bild, want: { report_count: 1, rowIds: [9001] } },
  { name: "같은 보도 — 같은 신문 인용 + 판정 필드가 같으면 요약이 달라도 한 보도다", got: ECHO.bildFields, want: { report_count: 1, rowIds: [9011] } },
  { name: "같은 보도 — 48시간을 넘으면 같은 요약이어도 따로 센다", got: ECHO.apart, want: { report_count: 2, rowIds: [9021, 9022] } },
  { name: "같은 보도 — 다른 신문·다른 요약이면 다른 보도다", got: ECHO.distinct, want: { report_count: 2, rowIds: [9031, 9032] } },
  { name: "같은 보도 — 대표는 원보도다(인용 행보다 나중에 게시됐어도)", got: ECHO.original, want: { report_count: 1, rowIds: [9042] } },
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
  { name: "판정 — '이동 아님' 보도는 딜에서 빠지고, 판정 전 보도는 보도 수·배정에는 들지만 단계는 판정받은 협상 보도로 정한다", got: [VERDICT.mixed.deals[0]?.report_count, VERDICT.mixed.deals[0]?.stage, VERDICT.mixed.judgeNeeds.length, VERDICT.mixed.assignments.size], want: [2, "talks", 1, 2] },
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
  { name: "관심 구단 — 행선지는 최신 보도(2배)의 브라이턴, 옛 보도가 행선지로도 적은 아스날이 관심 구단 맨 앞이고 구단 행도 만든다", got: [VERDICT.suitors.deals[0]?.to_club_code, VERDICT.suitors.deals[0]?.suitorCodes, VERDICT.suitors.clubs.map((c) => c.code).sort()], want: ["brighton-hove", ["arsenal", "aston-villa"], ["arsenal", "aston-villa", "brighton-hove", "sturm-graz"]] },
  { name: "관심 구단 유력한 순 — 표가 같으면 보도 안에서 먼저 적힌 구단이 앞이다", got: [VERDICT.suitorsTie.deals[0]?.to_club_code, VERDICT.suitorsTie.deals[0]?.suitorCodes], want: ["arsenal", ["tottenham", "aston-villa", "newcastle"]] },
  { name: "관심 구단 유력한 순 — 최신 보도(2배)의 구단이 옛 보도 한 건의 구단보다 앞이다", got: VERDICT.suitorsRecent.deals[0]?.suitorCodes, want: ["newcastle", "tottenham"] },
  { name: "관심 구단 유력한 순 — 부인 보도의 행선지는 표가 아니다(첼시가 뉴캐슬 위로 오르지 않는다)", got: [VERDICT.suitorsDead.deals[0]?.to_club_code, VERDICT.suitorsDead.deals[0]?.suitorCodes], want: ["arsenal", ["newcastle", "chelsea"]] },
  { name: "관심 구단 유력한 순 — 행선지 투표에서 진 구단을 관심 구단에 새로 넣지 않는다", got: [VERDICT.suitorsNoNew.deals[0]?.to_club_code, VERDICT.suitorsNoNew.deals[0]?.suitorCodes], want: ["arsenal", ["newcastle"]] },
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
  { name: "normalizePlayer — 분해되지 않는 라틴 글자(ø·æ·ß·ł)를 지우지 않고 옮긴다(호이비에르가 두 딜로 갈렸다)", got: [normalizePlayer("Pierre-Emile Højbjerg") === normalizePlayer("Pierre-Emile Hojbjerg"), normalizePlayer("Martin Ødegaard"), normalizePlayer("Łukasz Fabiański")], want: [true, "martin odegaard", "lukasz fabianski"] },
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

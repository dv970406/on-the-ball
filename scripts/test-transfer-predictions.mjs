/**
 * 딜 성사 예측 채점(`scripts/lib/transfer/predictions.mjs`) 회귀 테스트 — DB 없이 순수 함수만 돈다.
 *
 *   node scripts/test-transfer-predictions.mjs
 */
import { SETTLE_GRACE_MS, hitPoints, judgeVote, scorePredictions } from "./lib/transfer/predictions.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const WIN = { key: "2027-winter", closesAt: "2027-02-02T23:00:00Z" };
const CLOSE = Date.parse(WIN.closesAt);
const DECIDE = CLOSE + SETTLE_GRACE_MS;
const vote = (will_happen, voted_at = "2027-01-10T00:00:00Z") => ({ will_happen, voted_at });

// ── 표 하나의 판정 ─────────────────────────────────────────────
check("유예는 2일이다", SETTLE_GRACE_MS === 2 * 86_400_000);
check("창 안에 결과가 나왔으면 성사 — '성사' 표는 적중", judgeVote(vote(true), "2027-01-20T00:00:00Z", DECIDE, DECIDE + 1) === "hit");
check("창 안에 결과가 나왔으면 성사 — '불발' 표는 오답", judgeVote(vote(false), "2027-01-20T00:00:00Z", DECIDE, DECIDE + 1) === "miss");
check("결과가 나오면 판정 시각 전이라도 채점한다", judgeVote(vote(true), "2027-01-20T00:00:00Z", DECIDE, Date.parse("2027-01-21T00:00:00Z")) === "hit");
check("결과 시각 이후에 던진 표는 채점하지 않는다(void)", judgeVote(vote(true, "2027-01-20T00:30:00Z"), "2027-01-20T00:00:00Z", DECIDE, DECIDE + 1) === "void");
check("결과 시각과 같은 순간에 던진 표도 void", judgeVote(vote(true, "2027-01-20T00:00:00Z"), "2027-01-20T00:00:00Z", DECIDE, DECIDE + 1) === "void");
check("결과가 없고 판정 시각 전이면 미정", judgeVote(vote(false), null, DECIDE, DECIDE - 1) === "pending");
check("결과가 없고 판정 시각이 지나면 불발 — '불발' 표는 적중", judgeVote(vote(false), null, DECIDE, DECIDE) === "hit");
check("결과가 없고 판정 시각이 지나면 불발 — '성사' 표는 오답", judgeVote(vote(true), null, DECIDE, DECIDE) === "miss");
check("유예 경계 — 마감 + 2일 정각의 결과는 이 회차의 성사", judgeVote(vote(true), new Date(DECIDE).toISOString(), DECIDE, DECIDE + 1) === "hit");
check("유예 경계 — 그 뒤의 결과는 이 회차의 불발", judgeVote(vote(true), new Date(DECIDE + 1).toISOString(), DECIDE, DECIDE + 2) === "miss");

// ── 점수 ─────────────────────────────────────────────────────
check("소수 의견 가중 — 10명 중 1명만 맞히면 90점", hitPoints(true, { yes_count: 1, no_count: 9 }) === 90);
check("소수 의견 가중 — 10명 중 9명이 맞히면 10점", hitPoints(false, { yes_count: 1, no_count: 9 }) === 10);
check("최소 1점 — 만장일치로 맞혀도 1점", hitPoints(true, { yes_count: 5, no_count: 0 }) === 1);
check("집계가 없으면 자기 한 표 — 1점", hitPoints(false, undefined) === 1);
check("반올림 — 3명 중 1명이면 67점", hitPoints(true, { yes_count: 1, no_count: 2 }) === 67);

// ── 사람별 채점·순위 ──────────────────────────────────────────
const deals = [
  { id: 1, settled_at: "2027-01-20T00:00:00Z" }, // 성사
  { id: 2, settled_at: null }, // 결과 없음
];
const tallies = [
  { deal_id: 1, round_key: WIN.key, yes_count: 1, no_count: 3 },
  { deal_id: 2, round_key: WIN.key, yes_count: 1, no_count: 3 },
];
const p = (user_id, deal_id, will_happen, voted_at = "2027-01-10T00:00:00Z", round_key = WIN.key) => ({ user_id, deal_id, round_key, will_happen, voted_at });
const predictions = [
  p("a", 1, true), // 적중 75점
  p("a", 2, true), // 오답(불발)
  p("b", 1, false), // 오답
  p("b", 2, false), // 적중 25점
  p("c", 1, false), // 오답
  p("c", 2, false), // 적중 25점
  p("d", 1, true, "2027-01-21T00:00:00Z"), // void
  p("e", 1, true, "2027-01-10T00:00:00Z", "2099-summer"), // 모르는 회차 — 채점 안 함
];
const before = scorePredictions({ predictions, deals, tallies, windows: [WIN], nowMs: DECIDE - 1 });
check(
  "판정 시각 전 — 결과가 나온 딜만 채점된다",
  eq(before.map((s) => [s.user_id, s.points, s.hits, s.scored, s.rank]), [["a", 75, 1, 1, 1], ["b", 0, 0, 1, 2], ["c", 0, 0, 1, 2]]),
  JSON.stringify(before),
);
const after = scorePredictions({ predictions, deals, tallies, windows: [WIN], nowMs: DECIDE });
check(
  "판정 시각 뒤 — 불발도 채점되고, 동점은 같은 순위(1, 2, 2)",
  eq(after.map((s) => [s.user_id, s.points, s.hits, s.scored, s.rank]), [["a", 75, 1, 2, 1], ["b", 25, 1, 2, 2], ["c", 25, 1, 2, 2]]),
  JSON.stringify(after),
);
check("void 표만 있는 사람·모르는 회차뿐인 사람은 행이 없다", !after.some((s) => s.user_id === "d" || s.user_id === "e"));
const ranks = scorePredictions({
  predictions: [p("w", 1, true), p("x", 1, true), p("y", 1, true), p("z", 1, false)],
  deals,
  tallies: [{ deal_id: 1, round_key: WIN.key, yes_count: 3, no_count: 1 }],
  windows: [WIN],
  nowMs: DECIDE,
});
check("경쟁 순위 — 1, 1, 1, 4", eq(ranks.map((s) => s.rank), [1, 1, 1, 4]), JSON.stringify(ranks));

console.log(`\n예측 채점 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);

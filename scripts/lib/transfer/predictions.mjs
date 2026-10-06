/**
 * 딜 성사 예측 — 이적 창 일정의 DB 사본을 맞추고(`syncWindows`), 모든 예측을 채점해 랭킹을 쓴다(`runScoring`).
 * `sync-transfer-news.mjs`의 파생 단계 앞뒤에서 돈다(창 맞추기 → 파생 → 채점).
 *
 * 규칙(사용자 결정 — `supabase/migrations/20261006000001_transfer_deal_prediction.sql` 머리말):
 *   - 질문은 "이번 창 안에 오피셜이 뜰까?"다. 회차는 DB 트리거가 정한다(표를 던진 순간 아직 닫히지 않은 가장 이른 창).
 *   - 회차의 판정 시각 = 그 창의 마감 + `SETTLE_GRACE_MS`. 딜의 `settled_at`(합의 완료·오피셜 보도의 게시 시각)이 판정 시각
 *     이전이면 **성사**, 아니면 판정 시각이 지났을 때 **불발**, 그 전에는 **미정**(채점하지 않는다).
 *   - 성사된 딜에서 결과 시각 **이후**에 던진(바꾼) 표는 채점하지 않는다 — 결과를 보고 고른 표다. 투표는 DB가 단계로 닫지만
 *     파이프라인 지연(최대 1시간) 사이에는 열려 있다.
 *   - 맞힌 표는 `max(1, round(100 × (1 − 같은 쪽 표 / 전체 표)))`점(소수 의견 가중) — 집계는 그 딜·회차의 tally다.
 *     모두가 고른 쪽을 맞히면 1점이고, 혼자 반대편을 맞히면 100점에 가깝다. 틀린 표는 0점.
 *   - 순위는 점수 내림차순 경쟁 순위다(같은 점수는 같은 순위 — 1, 2, 2, 4).
 *
 * ⚠ **채점은 매번 처음부터 다시 한다**(누적하지 않는다) — 탈퇴로 표가 사라져 집계가 바뀌어도, 규칙을 고쳐도 다음 실행에 맞는다.
 *   점수 표는 결과의 사본이고 바뀐 행만 쓴다.
 * ⚠ 창 일정은 `windows.json`이 단일 소스다 — 채점도 DB 사본이 아니라 같은 JSON을 읽는다(사본은 트리거가 회차를 정하는 데만 쓴다).
 */
import { upsertRows } from "../sync-db.mjs";
import { loadWindows } from "./derive-deals.mjs";

/** 창 마감 뒤 결과를 기다리는 유예 — 마감일에 등록된 이적은 발표가 하루 이틀 늦게 나온다 */
export const SETTLE_GRACE_MS = 2 * 86_400_000;

const WINDOWS = "transfer_window";
const PREDICTIONS = "transfer_deal_prediction";
const TALLIES = "transfer_deal_prediction_tally";
const SCORES = "transfer_prediction_score";
const DEALS = "transfer_deal";
const PAGE = 500;
const CHUNK = 100;

const chunks = (arr) => Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, i) => arr.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * 창 일정의 DB 사본을 JSON에 맞춘다 — 값이 바뀐(또는 없는) 행만 쓴다. **지우지 않는다**(예측이 회차로 이 키를 잡는다).
 * @returns {Promise<{ written: number, total: number }>}
 */
export async function syncWindows(supabase, { log = console } = {}) {
  const want = loadWindows().map((w) => ({ key: w.key, label: w.label, opens_at: w.opensAt, closes_at: w.closesAt }));
  const { data, error } = await supabase.from(WINDOWS).select("key, label, opens_at, closes_at");
  if (error) throw new Error(`이적 창 조회 실패: ${error.message}`);
  const stored = new Map(data.map((w) => [w.key, w]));
  const same = (a, b) =>
    a.label === b.label && Date.parse(a.opens_at) === Date.parse(b.opens_at) && Date.parse(a.closes_at) === Date.parse(b.closes_at);
  const changed = want.filter((w) => !stored.has(w.key) || !same(stored.get(w.key), w));
  const up = await upsertRows(supabase, WINDOWS, changed, { onConflict: "key" }, { log });
  if (up.failed.length) throw new Error(`이적 창 저장 실패 ${up.failed.length}건: ${up.failed[0].message}`);
  return { written: up.saved.length, total: want.length };
}

/**
 * 표 하나의 판정 — `"hit" | "miss" | "void" | "pending"`.
 * @param {{ will_happen: boolean, voted_at: string }} vote
 * @param {string | null} settledAt 딜의 결과 시각
 * @param {number} decideAtMs 그 회차의 판정 시각(마감 + 유예)
 */
export function judgeVote(vote, settledAt, decideAtMs, nowMs) {
  const settledMs = settledAt ? Date.parse(settledAt) : null;
  if (settledMs !== null && settledMs <= decideAtMs) {
    // 결과를 보고 고른 표 — 같은 시각도 뺀다(결과보다 **앞서** 던진 표만 예측이다)
    if (Date.parse(vote.voted_at) >= settledMs) return "void";
    return vote.will_happen ? "hit" : "miss";
  }
  if (nowMs < decideAtMs) return "pending";
  return vote.will_happen ? "miss" : "hit";
}

/** 맞힌 표의 점수 — 소수 의견 가중(최소 1점). 집계가 없으면 자기 한 표만 있는 것으로 본다 */
export function hitPoints(willHappen, tally) {
  const yes = tally?.yes_count ?? (willHappen ? 1 : 0);
  const no = tally?.no_count ?? (willHappen ? 0 : 1);
  const total = yes + no;
  const same = willHappen ? yes : no;
  if (total <= 0) return 1;
  return Math.max(1, Math.round(100 * (1 - same / total)));
}

/**
 * 모든 예측을 채점한다 — **순수 함수**(테스트가 DB 없이 돈다).
 * @param {{ predictions: object[], deals: { id: number, settled_at: string | null }[], tallies: object[],
 *   windows: { key: string, closesAt: string }[], nowMs: number }} input
 * @returns {{ user_id: string, points: number, hits: number, scored: number, rank: number }[]} 채점된 표가 한 건 이상인 사람만, 순위순
 */
export function scorePredictions({ predictions, deals, tallies, windows, nowMs }) {
  const settledById = new Map(deals.map((d) => [d.id, d.settled_at ?? null]));
  const decideAt = new Map(windows.map((w) => [w.key, Date.parse(w.closesAt) + SETTLE_GRACE_MS]));
  const tallyOf = new Map(tallies.map((t) => [`${t.deal_id}:${t.round_key}`, t]));

  const byUser = new Map();
  for (const v of predictions) {
    // 딜이 사라졌거나(restrict라 없어야 한다) 모르는 회차면 채점하지 않는다
    if (!settledById.has(v.deal_id) || !decideAt.has(v.round_key)) continue;
    const verdict = judgeVote(v, settledById.get(v.deal_id), decideAt.get(v.round_key), nowMs);
    if (verdict !== "hit" && verdict !== "miss") continue;
    const s = byUser.get(v.user_id) ?? { user_id: v.user_id, points: 0, hits: 0, scored: 0 };
    s.scored += 1;
    if (verdict === "hit") {
      s.hits += 1;
      s.points += hitPoints(v.will_happen, tallyOf.get(`${v.deal_id}:${v.round_key}`));
    }
    byUser.set(v.user_id, s);
  }

  // 같은 점수 안의 표시 순서는 적중 많은 순 → 채점 적은 순 → user_id(결정적) — 순위는 점수만 본다
  const rows = [...byUser.values()].sort(
    (a, b) => b.points - a.points || b.hits - a.hits || a.scored - b.scored || a.user_id.localeCompare(b.user_id),
  );
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.points !== rows[i - 1].points) rank = i + 1;
    return { ...r, rank };
  });
}

/** 예측 전부 — 복합 PK 키셋으로 끝까지 읽는다(`max_rows`에서 조용히 잘리지 않게) */
async function readPredictions(supabase) {
  const out = [];
  let last = null;
  for (;;) {
    let q = supabase
      .from(PREDICTIONS)
      .select("user_id, deal_id, round_key, will_happen, voted_at")
      .order("user_id")
      .order("deal_id")
      .order("round_key")
      .limit(PAGE);
    if (last) {
      q = q.or(
        `user_id.gt.${last.user_id},and(user_id.eq.${last.user_id},deal_id.gt.${last.deal_id}),` +
          `and(user_id.eq.${last.user_id},deal_id.eq.${last.deal_id},round_key.gt.${last.round_key})`,
      );
    }
    const { data, error } = await q;
    if (error) throw new Error(`예측 조회 실패: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) return out;
    last = data.at(-1);
  }
}

/** 저장된 점수 전부 — user_id 키셋 */
async function readScores(supabase) {
  const out = [];
  let last = null;
  for (;;) {
    let q = supabase.from(SCORES).select("user_id, points, hits, scored, rank").order("user_id").limit(PAGE);
    if (last) q = q.gt("user_id", last);
    const { data, error } = await q;
    if (error) throw new Error(`점수 조회 실패: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) return out;
    last = data.at(-1).user_id;
  }
}

/**
 * 채점 → 점수 표에 쓴다(바뀐 행만 upsert, 더는 대상이 아닌 사람은 지운다).
 * @returns {Promise<{ predictions: number, users: number, written: number, removed: number }>}
 */
export async function runScoring(supabase, { nowMs = Date.now(), log = console } = {}) {
  const predictions = await readPredictions(supabase);
  const dealIds = [...new Set(predictions.map((p) => p.deal_id))];

  const deals = [];
  const tallies = [];
  for (const ids of chunks(dealIds)) {
    const [d, t] = await Promise.all([
      supabase.from(DEALS).select("id, settled_at").in("id", ids),
      // 딜 하나에 회차가 몇 개뿐이라 한 덩어리가 max_rows에 닿지 않는다
      supabase.from(TALLIES).select("deal_id, round_key, yes_count, no_count").in("deal_id", ids),
    ]);
    if (d.error) throw new Error(`딜 결과 조회 실패: ${d.error.message}`);
    if (t.error) throw new Error(`예측 집계 조회 실패: ${t.error.message}`);
    deals.push(...d.data);
    tallies.push(...t.data);
  }

  const scores = scorePredictions({ predictions, deals, tallies, windows: loadWindows(), nowMs });
  const stored = new Map((await readScores(supabase)).map((s) => [s.user_id, s]));
  const same = (a, b) => a.points === b.points && a.hits === b.hits && a.scored === b.scored && a.rank === b.rank;
  const changed = scores.filter((s) => !stored.has(s.user_id) || !same(stored.get(s.user_id), s));
  const now = new Date(nowMs).toISOString();
  const up = await upsertRows(supabase, SCORES, changed.map((s) => ({ ...s, updated_at: now })), { onConflict: "user_id" }, { log });
  if (up.failed.length) throw new Error(`점수 저장 실패 ${up.failed.length}건: ${up.failed[0].message}`);

  // 더는 채점된 표가 없는 사람(규칙 변경 · 표가 사라짐) — 남겨 두면 옛 점수가 랭킹에 남는다
  const keep = new Set(scores.map((s) => s.user_id));
  const gone = [...stored.keys()].filter((id) => !keep.has(id));
  for (const ids of chunks(gone)) {
    const { error } = await supabase.from(SCORES).delete().in("user_id", ids);
    if (error) throw new Error(`점수 정리 실패: ${error.message}`);
  }
  return { predictions: predictions.length, users: scores.length, written: up.saved.length, removed: gone.length };
}

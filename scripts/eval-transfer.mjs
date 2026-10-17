/**
 * 이적 딜 파생의 정확도 평가 — 정답 세트(`scripts/fixtures/transfer-golden.json`)에 지금 코드를 돌려 채점한다.
 *
 *   node scripts/eval-transfer.mjs --export [--remote]   # 운영(또는 로컬) 보도를 로컬 스냅샷으로 받는다(.cache/, 읽기만)
 *   node scripts/eval-transfer.mjs                        # 스냅샷으로 채점(LLM 토큰 0 — 운영에 저장된 판정과 캐시된 판정만 쓴다)
 *   node scripts/eval-transfer.mjs --judge [--config s5-off]  # 판정이 없는 후보를 LLM에 묻고 캐시에 남긴다(토큰을 쓴다)
 *   node scripts/eval-transfer.mjs --offline              # 위키데이터 이름 조회도 하지 않는다(스냅샷의 캐시만)
 *
 * 규칙을 고칠 때마다 돌려 **정밀도(보드에 오른 딜이 맞는가)와 재현율(이적 보도를 딜로 잡았는가)을 같은 기준으로** 본다.
 * 보도 단위로는 판정의 필드(이동 여부·시점·단계·출발·행선지·관심 구단·금액)를 정답 세트의 필드 정답과 대조한다(`scoreVerdict`).
 * 직접 만든 예문(`test-transfer-*.mjs`)은 회귀를 막지만, 실제 기사에서 좋아졌는지는 이 채점이 말한다.
 *
 * ⚠ **저장소가 공개라 본문을 커밋하지 않는다**(재배포 원칙 — `api-and-db.md`). 정답 세트에는 id·URL·정답만 있고,
 *   본문은 `--export`가 받은 `.cache/transfer-eval/snapshot.json`(gitignore)에서 읽는다.
 * ⚠ **기준 시각을 스냅샷에 고정한다** — 파생 범위가 지금 시각을 따라 움직이면 같은 데이터로도 결과가 바뀐다.
 * ⚠ LLM 판정은 **운영에 저장된 것을 스냅샷과 함께 받아 그대로 쓴다**(이미 치른 비용이다) — 규칙만 고쳤으면 토큰이 들지 않는다.
 *   `--judge`가 새로 물은 것은 `.cache/transfer-eval/verdicts.json`에 **물은 (보도 id, 선수 키)** 로 캐시한다 — 저장값 전체
 *   (원출력·금액·판정 선수 이름까지)를 그대로 행에 입혀, 운영과 같은 경로로 파생한다.
 * ⚠ 품질 검증에 API를 먼저 쓰지 않는다 — 채점은 원문만 읽는 독립 채점자(사람·서브에이전트)가 하고 그 결과를 정답 세트에 더한다.
 *   같은 설정을 여러 번 물어 흔들림을 재는 것은 `scripts/bench-transfer-judge.mjs`다(이 파일의 채점 함수를 함께 쓴다).
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { connectFromEnv, loadEnv, readAll } from "./lib/sync-db.mjs";
import { extractTransfer } from "./lib/transfer/extract.mjs";
import { deriveDeals, normalizePlayer } from "./lib/transfer/derive-deals.mjs";
import { createNameBook, loadGlossary, loadNameCache, loadPlayerDictionary, missingNames } from "./lib/transfer/names-ko.mjs";
import { lookupKo } from "./lib/transfer/wikidata.mjs";
import { runJudgements } from "./lib/transfer/judge.mjs";
import * as judgePrompt from "./lib/transfer/judge-prompt.mjs";
import { canonicalClubName, detectClubs } from "./lib/transfer/clubs.mjs";
import { DEAD, RANK } from "./lib/transfer/story.mjs";

export const DIR = ".cache/transfer-eval";
export const SNAPSHOT = `${DIR}/snapshot.json`;
export const GOLDEN = "scripts/fixtures/transfer-golden.json";
const VERDICTS = `${DIR}/verdicts.json`;
/** 판정 캐시 형식 — 키는 **물은** (보도 id, 선수 키)다. 옛 형식(판정 선수로 키를 잡았다)은 읽지 않는다 */
const VERDICT_CACHE_VERSION = 2;

// ── 채점 함수(벤치와 함께 쓴다) ─────────────────────────────────────

/** 선수 이름이 같은 사람인가 — 정규형이 같거나, 두 토큰 이상 이름끼리 한쪽이 다른 쪽의 끝부분 */
export function samePlayer(a, b) {
  if (!a || !b) return false;
  const x = normalizePlayer(a);
  const y = normalizePlayer(b);
  return x === y || (y.split(" ").length >= 2 && x.split(" ").length >= 2 && (x.endsWith(y) || y.endsWith(x)));
}

/** 구단 이름의 정규명 — 구단 사전에 한 구단으로 잡히면 그 정규명, 별칭이면 정규명, 아니면 원문 표기 */
export function canonClub(name) {
  if (typeof name !== "string" || !name.trim()) return null;
  const found = detectClubs(name);
  return found.length === 1 ? found[0] : canonicalClubName(name).trim();
}

/** 구단 대조 키 — 정규명을 다시 접는다(악센트·대소문자·기호 차이) */
export const clubKey = (name) => {
  const c = canonClub(name);
  return c ? normalizePlayer(c) : null;
};

/** 저장값의 원출력 — 시점(timing)·선수 한글 표기(player_ko)는 컬럼이 없어 여기서 읽는다 */
export function rawOf(update) {
  if (typeof update?.verdict_raw !== "string") return null;
  try {
    return JSON.parse(update.verdict_raw);
  } catch {
    return null;
  }
}

/** 단계가 이웃인가 — 진전 단계는 한 칸 차이까지, 죽은 단계(결렬·부인)는 서로 이웃이다 */
export function stageNear(a, b) {
  if (a === b) return true;
  if (DEAD.includes(a) && DEAD.includes(b)) return true;
  const i = RANK.indexOf(a);
  const j = RANK.indexOf(b);
  return i >= 0 && j >= 0 && Math.abs(i - j) <= 1;
}

const jaccard = (a, b) => {
  const x = new Set(a);
  const y = new Set(b);
  if (!x.size && !y.size) return 1;
  const inter = [...x].filter((v) => y.has(v)).length;
  return inter / (x.size + y.size - inter);
};

/** 보도 단위 필드 채점의 집계 틀 — `[맞음, 대상]` 쌍(관심 구단은 Jaccard 합) */
export function newFieldScore() {
  return {
    asked: 0, invalid: 0, tp: 0, fp: 0, fn: 0, tn: 0,
    player: [0, 0], timing: [0, 0], stage: [0, 0], stageNear: [0, 0], from: [0, 0], to: [0, 0], clubSet: [0, 0], suitors: [0, 0],
    feeNone: [0, 0], feeAmount: [0, 0], feeCurrency: [0, 0], feeKind: [0, 0],
    misses: {},
  };
}

/**
 * 판정 하나를 정답 항목에 대조해 `score`에 더한다. 정답에 없는 필드는 채점하지 않는다.
 * 필드(단계·구단·금액)는 **정답이 이동 보도이고 판정도 이동이며 판정 선수가 정답의 첫 선수**일 때만 본다 — 필드 정답이 그 선수의 것이다.
 * @param {object} g 정답 항목(`transfer-golden.json`의 items 하나)
 * @param {object | null | undefined} v 저장값(`verdict*` 컬럼 + `verdict_raw`) — 판정 시각이 없으면 묻지 않은 것으로 본다
 */
export function scoreVerdict(score, g, v) {
  if (!v || !v.verdict_at) return;
  const miss = (field) => (score.misses[field] ??= []).push(g.id);
  const tick = (field, ok) => {
    score[field][1] += 1;
    if (ok) score[field][0] += 1;
    else miss(field);
  };
  score.asked += 1;
  const raw = rawOf(v);
  if ("timing" in g && raw) tick("timing", raw.timing === g.timing);
  if (v.verdict !== "move" && v.verdict !== "not_move") {
    score.invalid += 1;
    return;
  }
  const move = v.verdict === "move";
  if (move && g.is_move_report) score.tp += 1;
  else if (move) { score.fp += 1; miss("move(오탐)"); }
  else if (g.is_move_report) { score.fn += 1; miss("move(놓침)"); }
  else score.tn += 1;
  if (!(move && g.is_move_report)) return;
  const name = v.verdict_player_name ?? v.verdict_player;
  tick("player", g.players.some((p) => samePlayer(p, name)));
  if (!samePlayer(g.players[0], name)) return;
  if (g.stage) {
    tick("stage", v.verdict_stage === g.stage);
    tick("stageNear", stageNear(v.verdict_stage, g.stage));
  }
  if ("from" in g) tick("from", clubKey(v.verdict_from) === clubKey(g.from));
  if ("to" in g) tick("to", clubKey(v.verdict_to) === clubKey(g.to));
  const ours = (v.verdict_suitors ?? []).map(clubKey).filter(Boolean);
  if ("to" in g && "suitors" in g) {
    const a = new Set([clubKey(v.verdict_to), ...ours].filter(Boolean));
    const b = new Set([clubKey(g.to), ...g.suitors.map(clubKey)].filter(Boolean));
    tick("clubSet", a.size === b.size && [...a].every((c) => b.has(c)));
  }
  if ("suitors" in g) {
    const j = jaccard(ours, g.suitors.map(clubKey).filter(Boolean));
    score.suitors[0] += j;
    score.suitors[1] += 1;
    if (j < 1) miss("suitors");
  }
  if ("fee" in g) {
    const amount = v.verdict_fee_amount == null ? null : Number(v.verdict_fee_amount);
    if (!g.fee) tick("feeNone", amount == null);
    else {
      const hit = amount != null && Math.abs(amount - g.fee.amount) < 0.011;
      tick("feeAmount", hit);
      if (hit) tick("feeCurrency", v.verdict_fee_currency === g.fee.currency);
      if (hit && g.fee.kind) tick("feeKind", v.verdict_fee_kind === g.fee.kind);
    }
  }
}

export const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : "—");
const pair = ([a, b]) => `${Number.isInteger(a) ? a : a.toFixed(1)}/${b} = ${pct(a, b)}`;

/** 필드 채점 결과를 줄로 — 평가 출력과 벤치가 같은 형식을 쓴다 */
export function formatFieldScore(s, { indent = "  ", showMisses = true } = {}) {
  const lines = [
    `판정 ${s.asked}건(판정 불가 ${s.invalid}) · 이동 정밀도 ${s.tp}/${s.tp + s.fp} = ${pct(s.tp, s.tp + s.fp)} · 재현율 ${s.tp}/${s.tp + s.fn} = ${pct(s.tp, s.tp + s.fn)} (오탐 ${s.fp} · 놓침 ${s.fn} · 맞는 아님 ${s.tn})`,
    `시점 ${pair(s.timing)} · 선수 ${pair(s.player)}`,
    `단계 ${pair(s.stage)} (이웃까지 ${pair(s.stageNear)}) · 출발 ${pair(s.from)} · 행선지 ${pair(s.to)} · 관련 구단 집합 ${pair(s.clubSet)} · 관심 구단 Jaccard ${s.suitors[1] ? (s.suitors[0] / s.suitors[1]).toFixed(2) : "—"} (${s.suitors[1]}건)`,
    `금액: 없음을 없음으로 ${pair(s.feeNone)} · 금액 ${pair(s.feeAmount)} · 통화 ${pair(s.feeCurrency)} · 성격 ${pair(s.feeKind)}`,
  ];
  if (showMisses) for (const [f, ids] of Object.entries(s.misses)) lines.push(`  틀림 ${f}: ${ids.slice(0, 15).map((id) => `#${id}`).join(" ")}${ids.length > 15 ? ` 외 ${ids.length - 15}` : ""}`);
  return lines.map((l) => `${indent}${l}`);
}

/** DB에 쓰지 않는 가짜 클라이언트 — 어떤 체인을 불러도 빈 결과를 돌려준다(판정 저장·이름 캐시 쓰기를 삼킨다) */
export function createFakeDb() {
  const result = { data: [], error: null, count: 0 };
  const chain = new Proxy(() => chain, {
    get: (_t, prop) => (prop === "then" ? (resolve) => resolve(result) : () => chain),
    apply: () => chain,
  });
  return { from: () => chain, rpc: () => chain };
}

/** 지금 판정 설정 키 → 설정. 요청 쪽이 설정 맵을 내보내지 않으면 null(기본 설정으로 묻는다) */
export function judgeConfig(key) {
  if (!key) return null;
  const configs = judgePrompt.JUDGE_CONFIGS;
  if (!configs) throw new Error("judge-prompt.mjs가 JUDGE_CONFIGS를 내보내지 않는다 — 설정을 고를 수 없다");
  if (!configs[key]) throw new Error(`모르는 판정 설정: ${key} (있는 것: ${Object.keys(configs).join(", ")})`);
  return configs[key];
}

// ── 평가 실행 ────────────────────────────────────────────────────────

async function main(argv) {
  if (argv.includes("--export")) {
    await exportSnapshot(argv);
    return;
  }
  if (!fs.existsSync(SNAPSHOT)) {
    console.error(`스냅샷이 없습니다 — 먼저 node scripts/eval-transfer.mjs --export --remote 로 받으세요(${SNAPSHOT})`);
    process.exit(1);
  }

  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8")).items;
  const nowMs = Date.parse(snap.nowIso);
  let verdictCache = fs.existsSync(VERDICTS) ? JSON.parse(fs.readFileSync(VERDICTS, "utf8")) : null;
  if (verdictCache && verdictCache.version !== VERDICT_CACHE_VERSION) {
    console.warn(`⚠ ${VERDICTS}가 옛 형식이라 읽지 않는다(판정 선수로 키를 잡아 물은 선수와 어긋났다) — --judge로 다시 채운다`);
    verdictCache = null;
  }
  verdictCache ??= { version: VERDICT_CACHE_VERSION, entries: {} };

  // 스냅샷의 행을 지금 추출기로 다시 읽는다(재처리와 같다) — 저장된 판정은 캐시가 덮는다
  const rows = snap.rows.map((r) => {
    const e = extractTransfer(r.body ?? "");
    return { ...r, stage: e.stage, players: e.players, clubs: e.clubs, relevance: e.relevance, deal_id: null };
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cacheKey = (need) => `${need.id}:${need.playerKey ?? ""}`;
  const applied = new Set();
  // 파생이 묻겠다는 (보도, 선수)에 캐시된 판정이 있으면 그 저장값 전체를 행에 입힌다 — 운영이 판정 뒤 다시 파생하는 것과 같다
  const applyVerdicts = (needs) => {
    let n = 0;
    for (const need of needs) {
      const key = cacheKey(need);
      const hit = verdictCache.entries[key];
      const row = byId.get(need.id);
      if (!hit || !row || applied.has(key)) continue;
      Object.assign(row, hit);
      applied.add(key);
      n += 1;
    }
    return n;
  };

  let cache = [...(snap.names ?? [])];
  const book = () => createNameBook({ players: loadPlayerDictionary(), clubs: loadGlossary().clubs, cache });
  const derive = () => deriveDeals(rows, { nowMs, names: book(), requireVerified: true, requireVerdict: true, existingKeys: new Set() });
  const settle = () => {
    let d = derive();
    for (let i = 0; i < 5 && applyVerdicts(d.judgeNeeds); i += 1) d = derive();
    return d;
  };
  let d = settle();

  // 이름 조회(위키데이터 — LLM 아님). 스냅샷 캐시에 없는 선수만
  if (!argv.includes("--offline")) {
    for (const n of missingNames(d.nameNeeds, book(), nowMs).filter((x) => x.kind === "player")) {
      const r = await lookupKo(n.name, "player");
      cache.push({ kind: "player", key: n.key, name_ko: r.nameKo, wikidata_id: r.wikidataId, checked_at: new Date().toISOString() });
      await new Promise((res) => setTimeout(res, 250));
    }
    d = settle();
  }

  // LLM 판정 — --judge일 때만(토큰을 쓴다). 결과는 물은 (보도, 선수)로 캐시에 남긴다
  let tokens = { input: 0, output: 0, cached: 0, calls: 0 };
  if (argv.includes("--judge") && d.judgeNeeds.length) {
    const env = loadEnv(["ANTHROPIC_API_KEY"]);
    if (!env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY가 필요합니다");
      process.exit(1);
    }
    const configArg = argv.includes("--config") ? argv[argv.indexOf("--config") + 1] : null;
    const config = judgeConfig(configArg);
    const needs = d.judgeNeeds;
    const v = await runJudgements(createFakeDb(), needs, { apiKey: env.ANTHROPIC_API_KEY, names: book(), limit: 1000, ...(config ? { config } : {}) });
    tokens = { input: v.inputTokens, output: v.outputTokens, cached: v.cacheReadTokens, calls: v.move + v.notMove + v.invalid };
    const needById = new Map(needs.map((n) => [n.id, n]));
    for (const { id, ...update } of v.updates) {
      const need = needById.get(id);
      if (!need) continue;
      const key = cacheKey(need);
      verdictCache.entries[key] = { ...verdictCache.entries[key], ...update };
      applied.delete(key);
    }
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(VERDICTS, JSON.stringify(verdictCache, null, 1));
    for (const w of v.warnings) console.warn(`⚠ ${w}`);
    d = settle();
  }

  // ── 채점 ─────────────────────────────────────────────────────────────
  const norm = (s) => normalizePlayer(s);
  const truth = new Map(golden.map((g) => [g.id, g]));
  const goldenIn = golden.filter((g) => byId.has(g.id));

  let correct = 0;
  const wrong = [];
  for (const deal of d.deals) {
    const judged = deal.rowIds.map((id) => truth.get(id)).filter(Boolean);
    const ok = judged.some((t) => t.is_move_report && t.players.some((p) => samePlayer(p, deal.player)));
    if (ok) correct += 1;
    else if (judged.length) wrong.push(`${deal.player} — ${judged.some((t) => t.is_move_report) ? "이동 보도지만 선수가 틀림" : "이동 보도가 아님"}`);
  }
  const graded = d.deals.filter((deal) => deal.rowIds.some((id) => truth.has(id)));

  const truePlayers = new Map();
  for (const g of goldenIn) if (g.is_move_report) for (const p of g.players) truePlayers.set(norm(p), p);
  const covered = [...truePlayers.keys()].filter((k) => d.deals.some((deal) => samePlayer(deal.player, k) && deal.rowIds.some((id) => truth.get(id)?.is_move_report)));

  // 추출 재현율 — 게이트와 무관하게, 이동 보도 행에서 정답 선수 이름을 뽑았는가
  let extHit = 0;
  let extAll = 0;
  for (const g of goldenIn.filter((x) => x.is_move_report)) {
    const got = byId.get(g.id)?.players ?? [];
    for (const p of g.players) {
      extAll += 1;
      if (got.some((q) => samePlayer(q, p))) extHit += 1;
    }
  }

  console.log(`\n이적 딜 정확도 — 정답 ${goldenIn.length}건(스냅샷 ${snap.nowIso})`);
  console.log(`  보드 딜 ${d.deals.length}건 · 정답으로 채점 가능한 딜 ${graded.length}건 · 맞음 ${correct} → 정밀도 ${pct(correct, graded.length)}`);
  for (const deal of d.deals) console.log(`    ${wrong.some((w) => w.startsWith(`${deal.player} —`)) ? "✗" : "·"} ${deal.player}${deal.player_ko ? `(${deal.player_ko})` : ""} [${deal.stage}] ${deal.from_club_code ?? "?"} → ${deal.to_club_code ?? "?"} 보도 ${deal.report_count}`);
  console.log(`  재현율(이동 보도 선수 → 딜) ${covered.length}/${truePlayers.size} = ${pct(covered.length, truePlayers.size)}`);
  console.log(`  추출 재현율(이동 보도에서 선수 이름을 뽑음) ${extHit}/${extAll} = ${pct(extHit, extAll)}`);
  // 보도 단위 — 이동 보도가 판정자에게 갔는가(판정이 있거나 판정 대기), 딜에 묶였는가. 규칙 관문의 재현율을 본다
  {
    const moveRows = goldenIn.filter((g) => g.is_move_report);
    const pending = new Set(d.judgeNeeds.map((x) => x.id));
    const linked = new Set(d.deals.flatMap((x) => x.rowIds));
    const seen = moveRows.filter((g) => byId.get(g.id)?.verdict || pending.has(g.id));
    const falseMove = goldenIn.filter((g) => !g.is_move_report && byId.get(g.id)?.verdict === "move");
    console.log(`  보도 단위: 이동 보도 ${moveRows.length}건 중 판정자에게 간 것 ${seen.length} = ${pct(seen.length, moveRows.length)} · 딜에 묶인 것 ${moveRows.filter((g) => linked.has(g.id)).length}`);
    console.log(`  이동 보도가 아닌데 "이동" 판정이 저장된 것 ${falseMove.length}건${falseMove.length ? ` — ${falseMove.map((g) => `#${g.id}`).join(" ")}` : ""}`);
  }
  // 보도 단위 판정 필드 — 판정이 있는 정답 항목만(묻지 않은 보도는 위의 "판정자에게 간 것"이 잰다)
  {
    const score = newFieldScore();
    for (const g of goldenIn) scoreVerdict(score, g, byId.get(g.id));
    const withFields = goldenIn.filter((g) => "stage" in g || "timing" in g).length;
    console.log(`  판정 필드(보도 단위 · 판정이 저장된 정답 항목 — 그중 필드 정답이 있는 항목은 정답 전체에서 ${withFields}건):`);
    for (const line of formatFieldScore(score, { indent: "    " })) console.log(line);
  }
  console.log(`  방향 채움(출발·행선지 둘 다) ${d.deals.filter((x) => x.from_club_code && x.to_club_code).length}/${d.deals.length}`);
  console.log(`  건너뜀: ${Object.entries(d.skipped).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  판정 대기(캐시에 판정 없음 — --judge로 묻는다) ${d.judgeNeeds.length}건 · 캐시 판정 적용 ${applied.size}건`);
  console.log(`  LLM 토큰(이번 실행): 호출 ${tokens.calls} · 입력 ${tokens.input}(캐시 읽음 ${tokens.cached}) · 출력 ${tokens.output}`);
}

async function exportSnapshot(argv) {
  // 읽기만 하지만 대상을 명시하게 한다(다른 운영 명령과 같은 규칙 — `--remote`)
  const { url, supabase } = connectFromEnv(argv);
  const ids = JSON.parse(fs.readFileSync(GOLDEN, "utf8")).items.map((g) => g.id);
  const minId = Math.min(...ids);
  // 정답 세트가 가리키는 보도가 속한 기간 전체(파생 범위 계산에 필요한 이웃 보도까지)
  // 운영에 저장된 판정(verdict*)까지 받는다 — 이미 치른 호출이라 채점이 토큰 없이 돈다
  const rows = await readAll(supabase, "transfer_news", "*", "id", (q) => q.gte("id", minId - 2000), 1000);
  const names = await loadNameCache(supabase);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify({ exportedAt: new Date().toISOString(), nowIso: new Date().toISOString(), source: url, rows, names }));
  console.log(`스냅샷 ${rows.length}행 · 이름 캐시 ${names.length}행 → ${SNAPSHOT}`);
}

// 벤치가 채점 함수만 가져다 쓴다 — 직접 실행했을 때만 평가를 돈다
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));

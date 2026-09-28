/**
 * 이적 딜 파생의 정확도 평가 — 정답 세트(`scripts/fixtures/transfer-golden.json`)에 지금 코드를 돌려 채점한다.
 *
 *   node scripts/eval-transfer.mjs --export [--remote]   # 운영(또는 로컬) 보도를 로컬 스냅샷으로 받는다(.cache/, 읽기만)
 *   node scripts/eval-transfer.mjs                        # 스냅샷으로 채점(LLM 토큰 0 — 저장된·캐시된 판정만 쓴다)
 *   node scripts/eval-transfer.mjs --judge                # 판정이 없는 후보를 LLM에 묻고 캐시에 남긴다(토큰을 쓴다)
 *   node scripts/eval-transfer.mjs --offline              # 위키데이터 이름 조회도 하지 않는다(스냅샷의 캐시만)
 *
 * 규칙을 고칠 때마다 돌려 **정밀도(보드에 오른 딜이 맞는가)와 재현율(이적 보도를 딜로 잡았는가)을 같은 기준으로** 본다.
 * 직접 만든 예문(`test-transfer-*.mjs`)은 회귀를 막지만, 실제 기사에서 좋아졌는지는 이 채점이 말한다.
 *
 * ⚠ **저장소가 공개라 본문을 커밋하지 않는다**(재배포 원칙 — `api-and-db.md`). 정답 세트에는 id·URL·정답만 있고,
 *   본문은 `--export`가 받은 `.cache/transfer-eval/snapshot.json`(gitignore)에서 읽는다.
 * ⚠ **기준 시각을 스냅샷에 고정한다** — 파생 범위가 지금 시각을 따라 움직이면 같은 데이터로도 결과가 바뀐다.
 * ⚠ LLM 판정은 `.cache/transfer-eval/verdicts.json`에 캐시한다(보도 id·선수 키) — 규칙만 고쳤으면 다시 부르지 않는다.
 */
import fs from "node:fs";
import { createSyncClient, guardTarget, loadEnv } from "./lib/sync-db.mjs";
import { extractTransfer } from "./lib/transfer/extract.mjs";
import { deriveDeals, normalizePlayer } from "./lib/transfer/derive-deals.mjs";
import { createNameBook, loadGlossary, loadPlayerDictionary, missingNames } from "./lib/transfer/names-ko.mjs";
import { lookupKo } from "./lib/transfer/wikidata.mjs";
import { runJudgements } from "./lib/transfer/judge.mjs";

const argv = process.argv.slice(2);
const DIR = ".cache/transfer-eval";
const SNAPSHOT = `${DIR}/snapshot.json`;
const VERDICTS = `${DIR}/verdicts.json`;
const GOLDEN = "scripts/fixtures/transfer-golden.json";

if (argv.includes("--export")) {
  await exportSnapshot();
  process.exit(0);
}
if (!fs.existsSync(SNAPSHOT)) {
  console.error(`스냅샷이 없습니다 — 먼저 node scripts/eval-transfer.mjs --export --remote 로 받으세요(${SNAPSHOT})`);
  process.exit(1);
}

const snap = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8")).items;
const nowMs = Date.parse(snap.nowIso);
const verdictCache = fs.existsSync(VERDICTS) ? JSON.parse(fs.readFileSync(VERDICTS, "utf8")) : {};

// 스냅샷의 행을 지금 추출기로 다시 읽는다(재처리와 같다) — 저장된 판정은 캐시가 덮는다
const rows = snap.rows.map((r) => {
  const e = extractTransfer(r.body ?? "");
  return { ...r, stage: e.stage, players: e.players, relevance: e.relevance, deal_id: null };
});
const applyVerdicts = () => {
  for (const r of rows) {
    const hit = Object.entries(verdictCache).find(([k]) => k.startsWith(`${r.id}:`));
    if (hit) Object.assign(r, { verdict: hit[1].verdict, verdict_player: hit[0].slice(String(r.id).length + 1), verdict_player_name: hit[1].playerName ?? null, verdict_at: hit[1].at, verdict_from: hit[1].from ?? null, verdict_to: hit[1].to ?? null, verdict_suitors: hit[1].suitors ?? [], verdict_stage: hit[1].stage ?? null, summary_ko: hit[1].summary ?? null });
  }
};
applyVerdicts();

let cache = [...(snap.names ?? [])];
const book = () => createNameBook({ players: loadPlayerDictionary(), clubs: loadGlossary().clubs, cache });
const derive = () => deriveDeals(rows, { nowMs, names: book(), requireVerified: true, requireVerdict: true, existingKeys: new Set() });
let d = derive();

// 이름 조회(위키데이터 — LLM 아님). 스냅샷 캐시에 없는 선수만
if (!argv.includes("--offline")) {
  for (const n of missingNames(d.nameNeeds, book(), nowMs).filter((x) => x.kind === "player")) {
    const r = await lookupKo(n.name, "player");
    cache.push({ kind: "player", key: n.key, name_ko: r.nameKo, wikidata_id: r.wikidataId, checked_at: new Date().toISOString() });
    await new Promise((res) => setTimeout(res, 250));
  }
  d = derive();
}

// LLM 판정 — --judge일 때만(토큰을 쓴다). 결과는 캐시에 남긴다
let tokens = { input: 0, output: 0, cached: 0, calls: 0 };
if (argv.includes("--judge") && d.judgeNeeds.length) {
  const env = loadEnv(["ANTHROPIC_API_KEY"]);
  if (!env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY가 필요합니다");
    process.exit(1);
  }
  const fakeDb = { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) };
  const v = await runJudgements(fakeDb, d.judgeNeeds, { apiKey: env.ANTHROPIC_API_KEY, names: book(), limit: 1000 });
  tokens = { input: v.inputTokens, output: v.outputTokens, cached: v.cacheReadTokens, calls: v.move + v.notMove + v.invalid };
  for (const u of v.updates) if (u.verdict) verdictCache[`${u.id}:${u.verdict_player ?? ""}`] = { verdict: u.verdict, evidence: u.verdict_evidence, playerName: u.verdict_player_name, from: u.verdict_from, to: u.verdict_to, suitors: u.verdict_suitors, stage: u.verdict_stage, summary: u.summary_ko ?? null, at: u.verdict_at };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(VERDICTS, JSON.stringify(verdictCache, null, 1));
  for (const w of v.warnings) console.warn(`⚠ ${w}`);
  applyVerdicts();
  d = derive();
}

// ── 채점 ─────────────────────────────────────────────────────────────
const norm = (s) => normalizePlayer(s);
const same = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return x === y || (y.split(" ").length >= 2 && x.split(" ").length >= 2 && (x.endsWith(y) || y.endsWith(x)));
};
const truth = new Map(golden.map((g) => [g.id, g]));
const inSnapshot = new Set(rows.map((r) => r.id));
const goldenIn = golden.filter((g) => inSnapshot.has(g.id));

let correct = 0;
const wrong = [];
for (const deal of d.deals) {
  const judged = deal.rowIds.map((id) => truth.get(id)).filter(Boolean);
  const ok = judged.some((t) => t.is_move_report && t.players.some((p) => same(p, deal.player)));
  if (ok) correct += 1;
  else if (judged.length) wrong.push(`${deal.player} — ${judged.some((t) => t.is_move_report) ? "이동 보도지만 선수가 틀림" : "이동 보도가 아님"}`);
}
const graded = d.deals.filter((deal) => deal.rowIds.some((id) => truth.has(id)));

const truePlayers = new Map();
for (const g of goldenIn) if (g.is_move_report) for (const p of g.players) truePlayers.set(norm(p), p);
const covered = [...truePlayers.keys()].filter((k) => d.deals.some((deal) => same(deal.player, k) && deal.rowIds.some((id) => truth.get(id)?.is_move_report)));

// 추출 재현율 — 게이트와 무관하게, 이동 보도 행에서 정답 선수 이름을 뽑았는가
let extHit = 0;
let extAll = 0;
for (const g of goldenIn.filter((x) => x.is_move_report)) {
  const got = rows.find((r) => r.id === g.id)?.players ?? [];
  for (const p of g.players) {
    extAll += 1;
    if (got.some((q) => same(q, p))) extHit += 1;
  }
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : "—");
console.log(`\n이적 딜 정확도 — 정답 ${goldenIn.length}건(스냅샷 ${snap.nowIso})`);
console.log(`  보드 딜 ${d.deals.length}건 · 정답으로 채점 가능한 딜 ${graded.length}건 · 맞음 ${correct} → 정밀도 ${pct(correct, graded.length)}`);
for (const deal of d.deals) console.log(`    ${wrong.some((w) => w.startsWith(`${deal.player} —`)) ? "✗" : "·"} ${deal.player}${deal.player_ko ? `(${deal.player_ko})` : ""} [${deal.stage}] ${deal.from_club_code ?? "?"} → ${deal.to_club_code ?? "?"} 보도 ${deal.report_count}`);
console.log(`  재현율(이동 보도 선수 → 딜) ${covered.length}/${truePlayers.size} = ${pct(covered.length, truePlayers.size)}`);
console.log(`  추출 재현율(이동 보도에서 선수 이름을 뽑음) ${extHit}/${extAll} = ${pct(extHit, extAll)}`);
console.log(`  방향 채움(출발·행선지 둘 다) ${d.deals.filter((x) => x.from_club_code && x.to_club_code).length}/${d.deals.length}`);
console.log(`  건너뜀: ${Object.entries(d.skipped).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`  판정 대기(캐시에 판정 없음 — --judge로 묻는다) ${d.judgeNeeds.length}건`);
console.log(`  LLM 토큰(이번 실행): 호출 ${tokens.calls} · 입력 ${tokens.input}(캐시 읽음 ${tokens.cached}) · 출력 ${tokens.output}`);

async function exportSnapshot() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다");
  // 읽기만 하지만 대상을 명시하게 한다(다른 운영 명령과 같은 규칙)
  guardTarget(url, argv.includes("--remote"));
  const supabase = createSyncClient(url, key);
  const ids = JSON.parse(fs.readFileSync(GOLDEN, "utf8")).items.map((g) => g.id);
  const minId = Math.min(...ids);
  const read = async (table, cols, build = (q) => q) => {
    const out = [];
    let last = 0;
    for (;;) {
      const { data, error } = await build(supabase.from(table).select(cols)).gt("id", last).order("id").limit(1000);
      if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
      out.push(...data);
      if (data.length < 1000) break;
      last = data.at(-1).id;
    }
    return out;
  };
  // 정답 세트가 가리키는 보도가 속한 기간 전체(파생 범위 계산에 필요한 이웃 보도까지)
  const rows = await read("transfer_news", "id, source_id, url, provenance_url, body, published_at", (q) => q.gte("id", minId - 2000));
  const { data: names, error } = await supabase.from("transfer_name_ko").select("kind, key, name_ko, wikidata_id, checked_at");
  if (error) throw new Error(`이름 캐시 조회 실패: ${error.message}`);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify({ exportedAt: new Date().toISOString(), nowIso: "2026-09-28T02:00:04Z", source: url, rows, names }));
  console.log(`스냅샷 ${rows.length}행 · 이름 캐시 ${names.length}행 → ${SNAPSHOT}`);
}

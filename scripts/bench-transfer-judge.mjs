/**
 * LLM 판정 벤치 — 고정 보도 묶음(`scripts/fixtures/transfer-judge-bench.json`)에 **같은 설정으로 N회** 물어
 * 일관성(반복끼리 같은 답인가)과 정확도(정답 세트의 필드 정답)를 함께 잰다. DB에 쓰지 않는다.
 *
 *   node scripts/bench-transfer-judge.mjs [--config s5-off] [--reps 3]          # 계획만 — 보낼 호출 수와 예상 비용(API 0건)
 *   node scripts/bench-transfer-judge.mjs --run --config s5-adaptive --reps 3 --out .cache/transfer-eval/bench/<이름>
 *   node scripts/bench-transfer-judge.mjs --run --fill --config s5-adaptive --reps 3 --out …  # 반복 파일에서 판정을 못 받은 항목만 다시 묻는다
 *   node scripts/bench-transfer-judge.mjs --compare <디렉터리|파일 ...> [--reparse] [--detail] [--by-config] [--common]
 *
 * - `--run`이 없으면 API를 부르지 않는다. 반복마다 `<out>/<설정>-r<n>.json` = `{ config, rep, model, out: [저장값], usage }`를 쓴다
 *   (`.cache/transfer-eval/qa-1001/prompt/`의 옛 결과 `{ variant, out, usage }`와 같은 모양이라 함께 비교된다).
 * - `--compare`는 설정(`config`, 옛 파일은 `variant`)별로 반복을 묶어 필드별 전원 일치율·쌍별 불일치율, 정답이 있는 항목의
 *   필드 정확도, 호출당 토큰·비용을 표로 낸다. `--reparse`는 저장된 원출력을 **지금의 해석**(`replayJudgements`)으로 다시 읽는다
 *   — 옛 결과를 새 해석과 같은 잣대로 놓을 때 쓴다(API 0건).
 *
 * ⚠ 입력을 고정한다 — 모든 설정·반복이 같은 글을 봐야 차이가 설정의 것이다. 저장된 글은 `.cache/transfer-eval/snapshot.json`,
 *   기사 본문은 `.cache/transfer-eval/bench/articles.json`(첫 `--run`이 한 번 받아 저장한다 — 이전 평가가 받아 둔 본문이 있으면 그것부터),
 *   구단 확인(위키데이터)은 `.cache/transfer-eval/bench/lookups.json`에 캐시한다. 저장소가 공개라 본문은 `.cache/`(gitignore)에만 둔다.
 * ⚠ 비용 추정은 글자 수로 어림한 값이다(±30%) — 생각(thinking) 토큰은 설정마다 달라 가정치를 따로 적는다. 실제 값은 `--compare`가 낸다.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./lib/sync-db.mjs";
import { extractTransfer } from "./lib/transfer/extract.mjs";
import { normalizePlayer } from "./lib/transfer/derive-deals.mjs";
import { createNameBook, loadGlossary, loadPlayerDictionary } from "./lib/transfer/names-ko.mjs";
import { lookupKo } from "./lib/transfer/wikidata.mjs";
import { fetchArticleText, replayJudgements, runJudgements, wantsArticle } from "./lib/transfer/judge.mjs";
import { JUDGE_CONFIGS, JUDGE_SCHEMA, buildJudgeRequest, buildSystem } from "./lib/transfer/judge-prompt.mjs";
import { DIR, GOLDEN, SNAPSHOT, clubKey, createFakeDb, formatFieldScore, newFieldScore, pct, rawOf, scoreVerdict } from "./eval-transfer.mjs";

const FIXTURE = "scripts/fixtures/transfer-judge-bench.json";
const BENCH_DIR = `${DIR}/bench`;
const ARTICLES = `${BENCH_DIR}/articles.json`;
const LOOKUPS = `${BENCH_DIR}/lookups.json`;
/** 이전 평가가 받아 둔 기사 본문 — qa-1001 지시문 A/B가 본 본문이 먼저다(그 결과를 기준선으로 비교한다) */
const ARTICLE_SEEDS = [`${DIR}/qa-1001/after/articles.json`, `${DIR}/articles.json`];
/** 단가(USD / 백만 토큰) — 생각 토큰은 출력에 포함된다 */
const PRICES = {
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};
const DEFAULT_MODEL = "claude-sonnet-5";
/** 계획 모드의 출력 토큰 가정 — 생각이 꺼진 판정은 qa-1001 기준선(호출당 약 200), 켜진 판정은 생각 몫을 더한 가정치 */
const ASSUMED_OUTPUT = { off: 220, thinking: 1_000 };

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback = null) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);

// ── 입력 ──────────────────────────────────────────────────────────────

function loadInputs() {
  if (!fs.existsSync(SNAPSHOT)) throw new Error(`스냅샷이 없다(${SNAPSHOT}) — node scripts/eval-transfer.mjs --export --remote`);
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8")).items;
  const byId = new Map(snap.rows.map((r) => [r.id, r]));
  const missing = fixture.filter((it) => !byId.has(it.id)).map((it) => it.id);
  if (missing.length) throw new Error(`스냅샷에 없는 벤치 항목: ${missing.join(" ")}`);
  // 운영 파생이 넘기는 모양과 같은 대상 — 판정 이력(prev)은 비운다(새로 묻는 것만 잰다)
  const needs = fixture.map((it, i) => {
    const r = byId.get(it.id);
    return {
      id: r.id, playerKey: it.player ? normalizePlayer(it.player) : null, player: it.player ?? null, body: r.body ?? "",
      clubs: extractTransfer(r.body ?? "").clubs, source_id: r.source_id, external_id: r.external_id, url: r.url,
      summary_ko: null, published_at: r.published_at ?? null, mode: "full", prev: null, priority: i,
    };
  });
  const names = () => createNameBook({ players: loadPlayerDictionary(), clubs: loadGlossary().clubs, cache: snap.names ?? [] });
  return { snap, byId, needs, names, nowMs: Date.parse(snap.nowIso) };
}

/** 기사 본문 캐시 — 보도 id → 본문(받지 못했으면 ""). 받으려는 보도만 */
function loadArticles(needs) {
  const cache = readJson(ARTICLES, {});
  let seeded = 0;
  const seeds = ARTICLE_SEEDS.map((f) => readJson(f, {}));
  for (const n of needs.filter(wantsArticle)) {
    if (String(n.id) in cache) continue;
    const hit = seeds.find((s) => String(n.id) in s);
    if (hit) {
      cache[n.id] = hit[n.id] ?? "";
      seeded += 1;
    }
  }
  const missing = needs.filter((n) => wantsArticle(n) && !(String(n.id) in cache));
  return { cache, seeded, missing };
}

function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 1));
}

/** 캐시된 본문을 돌려주는 가짜 fetch — 판정 코드는 HTML에서 본문을 다시 꺼내므로 JSON-LD로 감싼다 */
function articleFetch(needs, cache) {
  const byUrl = new Map(needs.filter((n) => cache[n.id]).map((n) => [n.url, cache[n.id]]));
  return async (url) => (byUrl.has(url)
    ? { ok: true, text: async () => `<script type="application/ld+json">${JSON.stringify({ articleBody: byUrl.get(url) })}</script>` }
    : { ok: false, text: async () => "" });
}

/** 구단 확인 캐시 — `network`가 거짓이면 캐시에 없는 이름은 확인하지 못한 것으로 둔다 */
function cachedLookup(network) {
  const cache = readJson(LOOKUPS, {});
  const stats = { hit: 0, fetched: 0, miss: 0 };
  const lookup = async (name, kind) => {
    const key = `${kind}:${name}`;
    if (key in cache) {
      stats.hit += 1;
      return cache[key];
    }
    if (!network) {
      stats.miss += 1;
      return { wikidataId: null, nameKo: null };
    }
    const r = await lookupKo(name, kind);
    cache[key] = r;
    stats.fetched += 1;
    return r;
  };
  return { lookup, stats, save: () => saveJson(LOOKUPS, cache) };
}

// ── 계획 · 실행 ────────────────────────────────────────────────────────

const tokenGuess = (s) => {
  const chars = [...String(s)];
  const ascii = chars.filter((c) => c.charCodeAt(0) < 128).length;
  return ascii / 3.5 + (chars.length - ascii) * 1.4;
};
const priceOf = (model, u) => {
  const p = PRICES[model] ?? PRICES[DEFAULT_MODEL];
  return ((u.input ?? 0) * p.input + (u.output ?? 0) * p.output + (u.cacheRead ?? 0) * p.cacheRead + (u.cacheWrite ?? 0) * p.cacheWrite) / 1e6;
};

async function plan() {
  const configKey = opt("--config", "s5-off");
  const config = JUDGE_CONFIGS[configKey];
  if (!config) throw new Error(`모르는 판정 설정: ${configKey} (있는 것: ${Object.keys(JUDGE_CONFIGS).join(", ")})`);
  const reps = Number(opt("--reps", "3"));
  if (!Number.isInteger(reps) || reps < 1) throw new Error("--reps는 1 이상의 정수");
  const { needs, names, nowMs } = loadInputs();
  const articles = loadArticles(needs);
  const system = buildSystem();
  const book = names();

  // 예상 토큰 — 지시문(+출력 형식)은 첫 호출이 캐시에 쓰고 나머지가 읽는다(같은 반복 안 5분 캐시)
  const prefix = tokenGuess(system) + tokenGuess(JSON.stringify(JUDGE_SCHEMA));
  const userTokens = needs.reduce((sum, n) => sum + tokenGuess(buildJudgeRequest(n, book, system, articles.cache[n.id] ?? "", config).messages[0].content), 0);
  const thinking = config.thinking?.type && config.thinking.type !== "disabled";
  const perRep = { input: userTokens, cacheWrite: prefix, cacheRead: prefix * (needs.length - 1), output: needs.length * ASSUMED_OUTPUT[thinking ? "thinking" : "off"] };
  const cost = priceOf(config.model, perRep) * reps;
  console.log(`벤치 계획 — ${configKey}(${config.model} · 생각 ${config.thinking?.type ?? "?"} · effort ${config.effort} · 출력 상한 ${config.maxTokens})`);
  console.log(`  항목 ${needs.length}건 × 반복 ${reps} = 호출 ${needs.length * reps}건`);
  console.log(`  기사 본문: 받을 보도 ${needs.filter(wantsArticle).length}건 중 캐시 있음 ${needs.filter(wantsArticle).length - articles.missing.length}(그중 앞선 평가의 캐시에서 ${articles.seeded} — --run이 벤치 캐시로 옮긴다) · 아직 없음 ${articles.missing.length}(--run이 한 번 받는다)`);
  console.log(`  예상 토큰(반복당, 어림): 입력 ${Math.round(perRep.input)} · 캐시 쓰기 ${Math.round(perRep.cacheWrite)} · 캐시 읽기 ${Math.round(perRep.cacheRead)} · 출력 ${perRep.output}(호출당 ${ASSUMED_OUTPUT[thinking ? "thinking" : "off"]} 가정)`);
  console.log(`  예상 비용 ≈ $${cost.toFixed(2)} (반복 ${reps}회 합)`);
  if (!flag("--run")) {
    console.log("  --run이 없어 API를 부르지 않았다.");
    return;
  }

  const outDir = opt("--out");
  if (!outDir) throw new Error("--run에는 --out <디렉터리>가 필요하다");
  const env = loadEnv(["ANTHROPIC_API_KEY"]);
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY가 필요합니다");

  // 본문은 이 실행 전에 한 번만 받아 고정한다 — 반복·설정이 같은 본문을 보게
  for (const n of articles.missing) {
    articles.cache[n.id] = await fetchArticleText(n.url);
    await new Promise((res) => setTimeout(res, 250));
  }
  saveJson(ARTICLES, articles.cache);
  const fetchImpl = articleFetch(needs, articles.cache);
  const lookups = cachedLookup(true);

  for (let rep = 1; rep <= reps; rep += 1) {
    const file = `${outDir}/${configKey}-r${rep}.json`;
    // --fill: 이미 있는 반복 파일에서 판정을 못 받은 항목(한도·일시 실패로 빠진 것)만 다시 묻고 합친다 — 반복마다 항목이 빠짐없이 차게
    const prior = flag("--fill") && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    const have = new Set((prior?.out ?? []).map((u) => u.id));
    const todo = prior ? needs.filter((n) => !have.has(n.id)) : needs;
    if (!todo.length) {
      console.log(`  반복 ${rep}: 빠진 항목 없음 — ${file}`);
      continue;
    }
    if (prior) console.log(`  반복 ${rep}: 빠진 항목 ${todo.length}건만 묻는다`);
    const v = await runJudgements(createFakeDb(), todo, { apiKey: env.ANTHROPIC_API_KEY, names: names(), config, system, limit: todo.length, fetchImpl, lookup: lookups.lookup, nowMs, log: console });
    lookups.save();
    // 판정이 난 행만 남긴다 — 일시 실패로 이월된 행(연속 실패 수만 있다)은 판정이 아니다. 다음 --fill이 다시 묻는다
    const judgedRows = v.updates.filter((u) => "verdict_at" in u);
    const add = { calls: v.move + v.notMove + v.invalid, input: v.inputTokens, output: v.outputTokens, cacheRead: v.cacheReadTokens, cacheWrite: v.cacheWriteTokens };
    const before = prior?.usage ?? { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const usage = Object.fromEntries(Object.keys(add).map((k) => [k, (before[k] ?? 0) + add[k]]));
    usage.price = priceOf(config.model, usage);
    const st = prior?.stats ?? { move: 0, notMove: 0, invalid: 0, failed: 0 };
    const stats = { move: st.move + v.move, notMove: st.notMove + v.notMove, invalid: st.invalid + v.invalid, failed: v.failed };
    const out = [...(prior?.out ?? []), ...judgedRows];
    const missing = needs.length - new Set(out.map((u) => u.id)).size;
    saveJson(file, { config: configKey, rep, model: config.model, out, usage, stats, missing, warnings: [...(prior?.warnings ?? []), ...v.warnings] });
    console.log(`  반복 ${rep}: 이동 ${stats.move} · 아님 ${stats.notMove} · 불가 ${stats.invalid} · 실패 ${v.failed} · 빠진 항목 ${missing} · ${usage.price.toFixed(3)} → ${file}`);
    if (missing) console.warn(`  ⚠ 반복 ${rep}에 판정을 못 받은 항목 ${missing}건이 남았다 — 같은 명령에 --fill을 붙여 다시 돌리면 그 항목만 묻는다`);
    if (v.failed) for (const w of v.warnings.filter((x) => /실패|한도/u.test(x))) console.warn(`  ⚠ ${w}`);
  }
}

// ── 비교 ──────────────────────────────────────────────────────────────

/** 반복 결과 파일 목록 — 디렉터리면 그 안의 `out` 배열을 가진 JSON 전부 */
function expandInputs(inputs) {
  const files = [];
  for (const p of inputs) {
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p).filter((x) => x.endsWith(".json")).sort()) {
        const j = readJson(path.join(p, f), null);
        if (Array.isArray(j?.out)) files.push(path.join(p, f));
      }
    } else files.push(p);
  }
  return files;
}

/** 필드 — 반복끼리 같은지 볼 값(구단은 정규명 키, 관심 구단은 집합) */
const FIELDS = {
  move: (u) => u.verdict ?? "불가",
  timing: (u) => rawOf(u)?.timing ?? null,
  player: (u) => (u.verdict === "move" ? normalizePlayer(u.verdict_player_name ?? u.verdict_player ?? "") : null),
  stage: (u) => u.verdict_stage ?? null,
  from: (u) => clubKey(u.verdict_from),
  to: (u) => clubKey(u.verdict_to),
  suitors: (u) => [...new Set((u.verdict_suitors ?? []).map(clubKey).filter(Boolean))].sort().join("|"),
  feeAmount: (u) => (u.verdict_fee_amount == null ? null : `${Number(u.verdict_fee_amount)} ${u.verdict_fee_currency ?? ""}`),
  feeKind: (u) => u.verdict_fee_kind ?? null,
  playerKo: (u) => (u.verdict === "move" ? (rawOf(u)?.player_ko ?? null) : null),
};
/** "구조화 필드 전부 일치" — 요약·선수 표기를 뺀 판정 필드 */
const STRUCTURED = ["move", "timing", "player", "stage", "from", "to", "suitors", "feeAmount", "feeKind"];
/**
 * 모델의 원출력 그대로의 필드 — 해석(원문 대조·구단 정규화·접기)이 흡수하기 전의 흔들림이다. 저장값의 흔들림과 함께 봐야
 * "모델이 흔들렸는데 해석이 막았다"와 "모델은 같았는데 해석이 갈랐다"를 가른다. 원출력이 없으면(형식 깨짐) "∅".
 */
const rawField = (key) => (u) => {
  const o = rawOf(u);
  if (!o) return "∅";
  if (key === "suitors") return [...(Array.isArray(o.suitors) ? o.suitors : [])].sort().join("|");
  if (key === "fee") return o.fee ? `${o.fee.amount} ${o.fee.currency} ${o.fee.kind}` : null;
  return o[key] ?? null;
};
const RAW_FIELDS = Object.fromEntries(["move", "timing", "player", "stage", "from", "to", "suitors", "fee", "player_ko"].map((k) => [`원출력 ${k}`, rawField(k)]));
const RAW_STRUCTURED = Object.keys(RAW_FIELDS).filter((k) => k !== "원출력 player_ko");

async function compare(inputs) {
  if (!inputs.length) throw new Error("--compare <디렉터리|파일 ...>");
  const files = expandInputs(inputs);
  const golden = new Map(JSON.parse(fs.readFileSync(GOLDEN, "utf8")).items.map((g) => [g.id, g]));
  const reparse = flag("--reparse") ? reparser() : null;

  // 설정별로 묶는다 — 같은 설정 이름이 다른 디렉터리에서 오면 디렉터리 이름을 앞에 붙여 가른다
  const groups = new Map();
  const dirsOf = new Map();
  const loaded = files.map((f) => {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const name = j.config ?? j.variant ?? path.basename(f, ".json");
    (dirsOf.get(name) ?? dirsOf.set(name, new Set()).get(name)).add(path.dirname(f));
    return { file: f, j, name };
  });
  for (const { file, j, name } of loaded) {
    // --by-config: 같은 설정을 여러 디렉터리로 나눠 돌렸을 때(반복을 이어 돌림) 한 묶음으로 센다
    const label = !flag("--by-config") && dirsOf.get(name).size > 1 ? `${path.basename(path.dirname(file))}/${name}` : name;
    let out = j.out;
    if (reparse) out = await reparse(out);
    const g = groups.get(label) ?? groups.set(label, { label, model: j.model ?? JUDGE_CONFIGS[j.config]?.model ?? DEFAULT_MODEL, reps: [] }).get(label);
    g.reps.push({ file, rows: new Map(out.map((u) => [u.id, u])), usage: j.usage ?? {} });
  }

  // --common: 모든 반복·묶음에 있는 항목만 센다 — 항목 집합이 다른 묶음(옛 68건 · 새 100건)을 같은 기준으로 비교한다
  if (flag("--common")) {
    const all = [...groups.values()].flatMap((g) => g.reps.map((r) => new Set(r.rows.keys())));
    const common = [...all[0]].filter((id) => all.every((set) => set.has(id)));
    for (const g of groups.values()) for (const r of g.reps) r.rows = new Map([...r.rows].filter(([id]) => common.includes(id)));
    console.log(`(--common: 모든 반복에 있는 항목 ${common.length}건만 센다)\n`);
  }
  const results = [...groups.values()].map((g) => summarize(g, golden));
  printTable(results);
  if (flag("--detail")) for (const r of results) printDetail(r);
  if (reparse) console.log(`\n(--reparse: 원출력을 지금의 해석으로 다시 읽었다 — 구단 확인 캐시 적중 ${reparse.stats.hit} · 캐시 밖이라 확인 못 함 ${reparse.stats.miss})`);
}

/** 원출력 재해석 — 저장된 원출력을 지금의 `parseJudgement`·구단 확인으로 다시 읽는다(API·네트워크 0건) */
function reparser() {
  const { byId, needs, names, nowMs } = loadInputs();
  const { cache } = loadArticles(needs);
  const fetchImpl = articleFetch(needs, cache);
  const lookups = cachedLookup(false);
  const fn = async (out) => {
    const rows = out.filter((u) => byId.has(u.id)).map((u) => ({ ...byId.get(u.id), ...u }));
    const v = await replayJudgements(createFakeDb(), rows, { names: names(), fetchImpl, lookup: lookups.lookup, nowMs });
    const changed = new Map(v.updates.map((u) => [u.id, u]));
    return out.map((u) => ({ ...u, ...(changed.get(u.id) ?? {}) }));
  };
  fn.stats = lookups.stats;
  return fn;
}

function summarize(g, golden) {
  const ids = [...g.reps[0].rows.keys()].filter((id) => g.reps.every((r) => r.rows.has(id)));
  const dropped = new Set(g.reps.flatMap((r) => [...r.rows.keys()])).size - ids.length;
  const n = g.reps.length;
  const pairs = [];
  for (let a = 0; a < n; a += 1) for (let b = a + 1; b < n; b += 1) pairs.push([a, b]);
  const fields = {};
  for (const [name, get] of Object.entries({ ...FIELDS, ...RAW_FIELDS })) {
    const vals = ids.map((id) => g.reps.map((r) => JSON.stringify(get(r.rows.get(id)))));
    const unanimous = vals.filter((v) => v.every((x) => x === v[0])).length;
    const pairDiff = pairs.length ? pairs.reduce((s, [a, b]) => s + vals.filter((v) => v[a] !== v[b]).length, 0) / (pairs.length * ids.length) : null;
    const split = ids.filter((_, i) => !vals[i].every((x) => x === vals[i][0]));
    fields[name] = { unanimous, pairDiff, split };
  }
  const structuredSplit = ids.filter((id) => STRUCTURED.some((f) => fields[f].split.includes(id)));
  const rawStructuredSplit = ids.filter((id) => RAW_STRUCTURED.some((f) => fields[f].split.includes(id)));
  const invalid = g.reps.reduce((s, r) => s + ids.filter((id) => !r.rows.get(id).verdict).length, 0) / (n * ids.length);
  // 정확도 — 반복을 합쳐(풀링) 센다
  const score = newFieldScore();
  for (const r of g.reps) for (const id of ids) if (golden.has(id)) scoreVerdict(score, golden.get(id), r.rows.get(id));
  const usage = g.reps.reduce((s, r) => {
    const calls = r.usage.calls ?? r.rows.size;
    return { calls: s.calls + calls, input: s.input + (r.usage.input ?? 0), output: s.output + (r.usage.output ?? 0), cacheRead: s.cacheRead + (r.usage.cacheRead ?? 0), cacheWrite: s.cacheWrite + (r.usage.cacheWrite ?? 0) };
  }, { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  return { ...g, ids, dropped, fields, structuredSplit, rawStructuredSplit, invalid, score, usage, cost: priceOf(g.model, usage), graded: ids.filter((id) => golden.has(id)).length };
}

function printTable(results) {
  const cols = results.map((r) => r.label);
  const row = (name, f) => `| ${name} | ${results.map(f).join(" | ")} |`;
  const per = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
  const lines = [
    `| 지표 | ${cols.join(" | ")} |`,
    `|---|${cols.map(() => "---:").join("|")}|`,
    row("반복 × 항목", (r) => `${r.reps.length} × ${r.ids.length}${r.dropped ? ` (빠진 항목 ${r.dropped})` : ""}`),
    row("구조화 필드 전원 일치", (r) => `${r.ids.length - r.structuredSplit.length}/${r.ids.length} (${per(r.ids.length - r.structuredSplit.length, r.ids.length)})`),
    ...Object.keys(FIELDS).map((f) => row(`${f} 전원 일치 · 쌍별 불일치`, (r) => `${per(r.fields[f].unanimous, r.ids.length)} · ${r.fields[f].pairDiff == null ? "—" : per(r.fields[f].pairDiff * r.ids.length, r.ids.length)}`)),
    row("원출력 구조화 필드 전원 일치", (r) => `${r.ids.length - r.rawStructuredSplit.length}/${r.ids.length} (${per(r.ids.length - r.rawStructuredSplit.length, r.ids.length)})`),
    ...Object.keys(RAW_FIELDS).map((f) => row(`${f} 전원 일치 · 쌍별 불일치`, (r) => `${per(r.fields[f].unanimous, r.ids.length)} · ${r.fields[f].pairDiff == null ? "—" : per(r.fields[f].pairDiff * r.ids.length, r.ids.length)}`)),
    row("판정 불가율", (r) => per(r.invalid * r.ids.length, r.ids.length)),
    row("정답 있는 항목", (r) => String(r.graded)),
    row("이동 정밀도 · 재현율", (r) => `${pct(r.score.tp, r.score.tp + r.score.fp)} · ${pct(r.score.tp, r.score.tp + r.score.fn)}`),
    row("시점", (r) => accuracy(r.score.timing)),
    row("단계 (이웃까지)", (r) => `${accuracy(r.score.stage)} (${accuracy(r.score.stageNear)})`),
    row("출발 · 행선지", (r) => `${accuracy(r.score.from)} · ${accuracy(r.score.to)}`),
    row("관련 구단 집합 · 관심 구단 Jaccard", (r) => `${accuracy(r.score.clubSet)} · ${r.score.suitors[1] ? (r.score.suitors[0] / r.score.suitors[1]).toFixed(2) : "—"}`),
    row("금액 · 성격 · 없음", (r) => `${accuracy(r.score.feeAmount)} · ${accuracy(r.score.feeKind)} · ${accuracy(r.score.feeNone)}`),
    row("호출당 입력 · 캐시 읽기 · 출력", (r) => (r.usage.calls ? `${Math.round(r.usage.input / r.usage.calls)} · ${Math.round(r.usage.cacheRead / r.usage.calls)} · ${Math.round(r.usage.output / r.usage.calls)}` : "—")),
    row("비용(합 · 호출당)", (r) => (r.usage.calls ? `$${r.cost.toFixed(3)} · $${(r.cost / r.usage.calls).toFixed(4)}` : "—")),
  ];
  console.log(lines.join("\n"));
  console.log("\n위 필드는 저장값(해석 뒤 — 구단은 정규명), \"원출력\"은 모델이 낸 그대로다. 정확도는 반복을 합쳐 센 값(분모 = 반복 × 항목).");
  console.log("쌍별 불일치 = 반복 두 개를 골라 그 필드가 다른 항목의 비율(쌍 평균).");
}

const accuracy = ([a, b]) => (b ? `${((a / b) * 100).toFixed(0)}% (${a}/${b})` : "—");

function printDetail(r) {
  console.log(`\n## ${r.label} — 흔들린 항목`);
  for (const [f, v] of Object.entries(r.fields)) if (v.split.length) console.log(`  ${f}: ${v.split.map((id) => `#${id}`).join(" ")}`);
  for (const line of formatFieldScore(r.score, { indent: "  " })) console.log(line);
}

// 상수·함수 선언이 모두 끝난 뒤에 실행한다(맨 위에서 부르면 아래 const가 아직 초기화 전이다)
if (flag("--compare")) await compare(argv.slice(argv.indexOf("--compare") + 1).filter((a) => !a.startsWith("--")));
else await plan();

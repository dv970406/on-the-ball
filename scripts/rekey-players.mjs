/**
 * 선수 키 이전 — `normalizePlayer`가 `ø·æ·ß·ł·đ·ð·þ·œ·ı`를 지우던 옛 규칙에서 라틴 글자로 옮기는 새 규칙으로
 * 바뀐 뒤, **배포 때 한 번** 저장된 키를 새 규칙으로 옮긴다.
 *
 *   node scripts/rekey-players.mjs                    # 로컬 DB — 드라이런(바꿀 것을 표로만)
 *   node scripts/rekey-players.mjs --apply            # 로컬 DB에 쓴다
 *   node scripts/rekey-players.mjs --remote [--apply] # 원격(운영) — 대상은 환경변수다
 *
 * 왜 필요한가: `transfer_deal.deal_key`는 영구 계약이다(관심 FK는 cascade, 댓글·예측 FK는 restrict).
 *   키 규칙만 바뀐 채 파생이 돌면 옛 키 딜은 "보도가 끊긴 딜"이 되어 지워지고(관심이 cascade로 사라진다)
 *   새 키 딜이 새 id로 생겨 "새 딜" 알림이 다시 나간다. 그래서 **파생보다 먼저** 키만 옮겨 id를 지킨다.
 *
 * 옮기는 것(순서가 규약이다 — 실패하면 거기서 멈추고 된 것까지 보고한다):
 *   1. `transfer_deal.deal_key` — `dealKey(옛 키)` → `dealKey(새 키)`. 새 키 딜이 이미 있으면 옮기지 않고 "병합 필요"로 보고만.
 *   2. `transfer_news.verdict_player` — 그 행의 선수 이름(`players`·`verdict_player_name`)으로 확인된 옛 키 → 새 키.
 *   3. `transfer_name_ko`의 선수 키(`player`·`player_club`·`player_owner_club`) — 옛 키 → 새 키. 새 키 행이 이미 있으면 손대지 않고 보고만.
 *   4. `players-ko.json`(사람 사전)은 파일이라 손대지 않는다 — 옛 키가 남아 있으면 경고.
 *
 * ⚠ **멱등**이다 — 옮긴 뒤에는 옛 키 행이 없어 다음 실행의 계획이 비어 있다.
 * ⚠ 옛 키가 **글자 없는 다른 이름의 키와 같으면**(예: 옛 규칙에서 "Højbjerg"와 철자 그대로의 "Hjbjerg"는 같은 키)
 *   그 키의 딜이 누구 것인지 가를 수 없어 건드리지 않고 "모호"로 보고한다.
 * ⚠ 계획 계산(`planRekey` 이하)은 DB와 분리된 순수 함수다 — `scripts/test-transfer-rekey.mjs`가 가짜 행으로 검사한다.
 */
import { pathToFileURL } from "node:url";
import { connectFromEnv, readRange } from "./lib/sync-db.mjs";
import { dealKey } from "./lib/transfer/derive-deals.mjs";
import { loadPlayerDictionary } from "./lib/transfer/names-ko.mjs";
import { normalizePlayer } from "./lib/transfer/player-key.mjs";

/** 새 규칙이 옮기는 글자 — `player-key.mjs`의 `LATIN_FOLD`와 같은 집합 */
/** 키가 선수 키인 이름 캐시 종류 — 선수 표기 · 현 소속 · 임대 중인 선수의 보유 구단 */
export const PLAYER_KEY_KINDS = ["player", "player_club", "player_owner_club"];
export const FOLD_CHARS = /[øØæÆœŒßłŁđĐðÐþÞı]/u;

/** 옛 정규형 — 바뀌기 전의 `normalizePlayer` 그대로(이 스크립트 전용 사본. 새 코드에서 쓰지 않는다) */
export function oldNormalizePlayer(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 이름 하나의 옛 키·새 키. 키가 그대로면(옮길 글자가 없거나 옮겨도 같으면) null */
export function keyPair(name) {
  if (typeof name !== "string" || !FOLD_CHARS.test(name)) return null;
  const oldKey = oldNormalizePlayer(name);
  const newKey = normalizePlayer(name);
  if (!oldKey || oldKey === newKey) return null;
  return { name, oldKey, newKey };
}

/** 행 하나가 말하는 선수 이름들 */
function namesOfNews(row) {
  return [...(Array.isArray(row.players) ? row.players : []), row.verdict_player_name].filter((n) => typeof n === "string" && n);
}

/**
 * 옮길 키의 표 — 옛 키 → { newKey, names }. 그리고 모호한 옛 키(같은 옛 키가 새 키 둘 이상으로 가거나,
 * 글자 없는 이름의 키와 겹친다).
 */
export function collectTargets({ deals = [], news = [], nameRows = [] }) {
  const allNames = new Set();
  for (const d of deals) if (d.player) allNames.add(d.player);
  for (const r of news) for (const n of namesOfNews(r)) allNames.add(n);
  for (const r of nameRows) if (r.kind === "player" && r.name_en) allNames.add(r.name_en);

  const targets = new Map();
  const plainKeys = new Set();
  for (const name of allNames) {
    const pair = keyPair(name);
    if (!pair) {
      // 옛 규칙과 새 규칙이 같은 이름 — 그 키는 이미 "자기 키"다
      if (oldNormalizePlayer(name) === normalizePlayer(name)) plainKeys.add(normalizePlayer(name));
      continue;
    }
    const t = targets.get(pair.oldKey) ?? { oldKey: pair.oldKey, newKeys: new Set(), names: new Set() };
    t.newKeys.add(pair.newKey);
    t.names.add(name);
    targets.set(pair.oldKey, t);
  }

  const resolved = new Map();
  const ambiguous = [];
  for (const t of targets.values()) {
    const names = [...t.names].sort();
    if (t.newKeys.size > 1 || plainKeys.has(t.oldKey)) {
      ambiguous.push({ oldKey: t.oldKey, newKeys: [...t.newKeys].sort(), names, reason: t.newKeys.size > 1 ? "새 키가 여럿" : "글자 없는 이름과 옛 키가 같다" });
      continue;
    }
    resolved.set(t.oldKey, { oldKey: t.oldKey, newKey: [...t.newKeys][0], names });
  }
  return { targets: resolved, ambiguous };
}

/**
 * 바꿀 목록을 계산한다(순수).
 * @param {{ deals: {id, deal_key, player}[], news: {id, players, verdict_player_name, verdict_player}[],
 *           nameRows: {kind, key, name_en}[], dictKeys: string[] }} input
 */
export function planRekey({ deals = [], news = [], nameRows = [], dictKeys = [] }) {
  const { targets, ambiguous } = collectTargets({ deals, news, nameRows });
  const byDealKey = new Map(deals.map((d) => [d.deal_key, d]));

  const dealMoves = [];
  const dealConflicts = [];
  for (const t of targets.values()) {
    const from = dealKey(t.oldKey);
    const to = dealKey(t.newKey);
    const oldDeal = byDealKey.get(from);
    if (!oldDeal) continue;
    const newDeal = byDealKey.get(to);
    if (newDeal) dealConflicts.push({ oldId: oldDeal.id, newId: newDeal.id, player: oldDeal.player, from, to, oldKey: t.oldKey, newKey: t.newKey });
    else dealMoves.push({ id: oldDeal.id, player: oldDeal.player, from, to, oldKey: t.oldKey, newKey: t.newKey });
  }

  const newsMoves = [];
  for (const r of news) {
    const t = r.verdict_player ? targets.get(r.verdict_player) : null;
    if (!t) continue;
    // 그 행의 선수 이름이 이 옛 키를 만드는지 확인한다 — 같은 옛 키의 다른 사람에게 붙이지 않는다
    const own = namesOfNews(r).some((n) => keyPair(n)?.oldKey === t.oldKey);
    if (!own) continue;
    newsMoves.push({ id: r.id, from: t.oldKey, to: t.newKey });
  }

  const nameMoves = [];
  const nameConflicts = [];
  const existingNameKeys = new Set(nameRows.map((r) => `${r.kind}\u0000${r.key}`));
  for (const r of nameRows) {
    if (!PLAYER_KEY_KINDS.includes(r.kind)) continue;
    const t = targets.get(r.key);
    if (!t) continue;
    if (existingNameKeys.has(`${r.kind}\u0000${t.newKey}`)) nameConflicts.push({ kind: r.kind, from: t.oldKey, to: t.newKey });
    else nameMoves.push({ kind: r.kind, from: t.oldKey, to: t.newKey });
  }

  const dictWarnings = [];
  const dict = new Set(dictKeys);
  for (const t of targets.values()) if (dict.has(t.oldKey)) dictWarnings.push({ oldKey: t.oldKey, newKey: t.newKey, names: t.names });

  return { targets: [...targets.values()], ambiguous, dealMoves, dealConflicts, newsMoves, nameMoves, nameConflicts, dictWarnings };
}

export const isEmptyPlan = (p) => p.dealMoves.length + p.newsMoves.length + p.nameMoves.length === 0;

/** 계획을 사람이 읽는 표로 */
export function renderPlan(p) {
  const lines = [];
  lines.push(`옮길 선수 키 ${p.targets.length}개`);
  for (const t of p.targets) lines.push(`  ${t.names.join(" / ")}: "${t.oldKey}" → "${t.newKey}"`);
  if (p.ambiguous.length) {
    lines.push(`⚠ 모호해서 건드리지 않는 옛 키 ${p.ambiguous.length}개`);
    for (const a of p.ambiguous) lines.push(`  "${a.oldKey}" (${a.reason}) — ${a.names.join(" / ")} → ${a.newKeys.join(", ")}`);
  }
  lines.push(`1. transfer_deal.deal_key ${p.dealMoves.length}건`);
  for (const m of p.dealMoves) lines.push(`  id ${m.id} ${m.player}: ${m.from} → ${m.to}`);
  if (p.dealConflicts.length) {
    lines.push(`⚠ 병합 필요(옛 키·새 키 딜이 둘 다 있다 — 옮기지 않는다) ${p.dealConflicts.length}건`);
    for (const c of p.dealConflicts) {
      lines.push(`  ${c.player}: 옛 id ${c.oldId}(${c.from}) · 새 id ${c.newId}(${c.to})`);
      const u = c.userData;
      if (!u) continue;
      lines.push(`    옛 딜의 사용자 데이터 — 관심 ${u.watch} · 댓글 ${u.comment} · 예측 ${u.prediction}`);
      // ⚠ 파생은 두 딜을 새 키 하나로 합치고, 보도가 끊긴 옛 딜을 지운다(관심은 cascade, 댓글·예측이 있으면 지우지 않고 경고)
      lines.push(
        u.watch + u.comment + u.prediction === 0
          ? "    → 사용자 데이터가 없다 — 파생이 옛 딜을 지우고 새 id로 합쳐도 잃는 것이 없다"
          : "    → ⚠ 사용자 데이터가 있다 — 파생 전에 사람이 병합한다(관심·댓글·예측을 새 id로 옮기거나 새 딜을 지우고 옛 딜을 옮긴다)",
      );
    }
  }
  lines.push(`2. transfer_news.verdict_player ${p.newsMoves.length}건`);
  for (const m of p.newsMoves) lines.push(`  보도 ${m.id}: "${m.from}" → "${m.to}"`);
  lines.push(`3. transfer_name_ko 선수 키 ${p.nameMoves.length}건`);
  for (const m of p.nameMoves) lines.push(`  ${m.kind}: "${m.from}" → "${m.to}"`);
  if (p.nameConflicts.length) {
    lines.push(`⚠ 새 키 행이 이미 있어 손대지 않는 옛 행 ${p.nameConflicts.length}건(지울지는 사람이 정한다)`);
    for (const c of p.nameConflicts) lines.push(`  ${c.kind}: "${c.from}" (새 "${c.to}" 있음)`);
  }
  if (p.dictWarnings.length) {
    lines.push(`⚠ players-ko.json에 옛 키가 남아 있다 — 새 키로 손으로 고친다 ${p.dictWarnings.length}건`);
    for (const w of p.dictWarnings) lines.push(`  "${w.oldKey}" → "${w.newKey}"`);
  }
  if (isEmptyPlan(p)) lines.push("바꿀 것 없음");
  return lines.join("\n");
}

// ── DB ────────────────────────────────────────────────────────────────────

/** 딜 하나에 걸린 사용자 데이터 수(관심·댓글·예측) */
async function userDataOf(supabase, dealId) {
  const count = async (table) => {
    const { count: n, error } = await supabase.from(table).select("deal_id", { count: "exact", head: true }).eq("deal_id", dealId);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    return n ?? 0;
  };
  const [watch, comment, prediction] = await Promise.all(["transfer_deal_watch", "transfer_deal_comment", "transfer_deal_prediction"].map(count));
  return { watch, comment, prediction };
}

/** 계획대로 쓴다 — 1 → 2 → 3. 실패하면 거기서 멈추고 된 것을 돌려준다 */
export async function applyPlan(supabase, plan, log = console) {
  const done = { deals: 0, news: 0, names: 0 };
  const step = async (label, items, run) => {
    for (const m of items) {
      const { data, error } = await run(m);
      // ⚠ 0행은 그 사이 누가 바꿨다는 뜻이다(옛 값 조건을 걸었다) — 실패로 멈춘다
      if (error || !data?.length) throw new Error(`${label} 실패(${JSON.stringify(m)}): ${error?.message ?? "0행 — 그 사이 값이 바뀌었다"}`);
      done[label] += 1;
    }
  };
  try {
    await step("deals", plan.dealMoves, (m) => supabase.from("transfer_deal").update({ deal_key: m.to }).eq("id", m.id).eq("deal_key", m.from).select("id"));
    await step("news", plan.newsMoves, (m) => supabase.from("transfer_news").update({ verdict_player: m.to }).eq("id", m.id).eq("verdict_player", m.from).select("id"));
    await step("names", plan.nameMoves, (m) => supabase.from("transfer_name_ko").update({ key: m.to }).eq("kind", m.kind).eq("key", m.from).select("key"));
  } catch (e) {
    log.error(`✗ ${e.message}`);
    log.error(`  여기까지 됐다 — 딜 ${done.deals}/${plan.dealMoves.length} · 보도 ${done.news}/${plan.newsMoves.length} · 이름 ${done.names}/${plan.nameMoves.length}. 다시 돌리면 남은 것만 이어 간다(멱등).`);
    return { ok: false, done };
  }
  return { ok: true, done };
}

async function main(argv) {
  const { url, supabase } = connectFromEnv(argv);
  const apply = argv.includes("--apply");

  const [deals, news, nameRows] = await Promise.all([
    readRange(() => supabase.from("transfer_deal").select("id, deal_key, player").order("id"), "딜"),
    readRange(() => supabase.from("transfer_news").select("id, players, verdict_player_name, verdict_player").order("id"), "보도"),
    readRange(() => supabase.from("transfer_name_ko").select("kind, key, name_en").in("kind", PLAYER_KEY_KINDS).order("kind").order("key"), "이름 캐시"),
  ]);
  const dictKeys = Object.keys(loadPlayerDictionary());

  const plan = planRekey({ deals, news, nameRows, dictKeys });
  // 병합이 필요한 옛 딜에 사용자 데이터가 걸렸는지 — 파생에 맡겨도 되는지를 가른다
  for (const c of plan.dealConflicts) c.userData = await userDataOf(supabase, c.oldId);
  console.log(`대상: ${argv.includes("--remote") ? "원격" : "로컬"} ${url} · ${apply ? "쓰기" : "드라이런"}`);
  console.log(`읽은 행: 딜 ${deals.length} · 보도 ${news.length} · 이름 캐시(선수) ${nameRows.length}`);
  console.log(renderPlan(plan));

  if (!apply || isEmptyPlan(plan)) {
    if (!apply && !isEmptyPlan(plan)) console.log("\n쓰려면 --apply 를 붙이세요.");
    return;
  }
  const result = await applyPlan(supabase, plan);
  if (!result.ok) process.exit(1);
  console.log(`\n✓ 옮겼다 — 딜 ${result.done.deals} · 보도 ${result.done.news} · 이름 ${result.done.names}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));

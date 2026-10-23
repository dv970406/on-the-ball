/**
 * 선수 키 이전(`rekey-players.mjs`)의 회귀 테스트 — DB 없이 가짜 행으로 계획 계산만 본다.
 *
 *   node scripts/test-transfer-rekey.mjs
 */
import { collectTargets, isEmptyPlan, keyPair, oldNormalizePlayer, planRekey } from "./rekey-players.mjs";
import { dealKey } from "./lib/transfer/derive-deals.mjs";
import { normalizePlayer } from "./lib/transfer/player-key.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const HOJ = "Pierre-Emile Højbjerg";
const OLD = "pierreemile hjbjerg";
const NEW = "pierreemile hojbjerg";

// ── 옛/새 키 ───────────────────────────────────────────────────────────────
check("옛 규칙은 ø를 지운다", oldNormalizePlayer(HOJ) === OLD, oldNormalizePlayer(HOJ));
check("새 규칙은 ø를 o로 옮긴다", normalizePlayer(HOJ) === NEW, normalizePlayer(HOJ));
check("keyPair — 옛·새 키", eq(keyPair(HOJ), { name: HOJ, oldKey: OLD, newKey: NEW }));
check("keyPair — 악센트만 있는 이름은 대상 아님(NFD로 이미 같았다)", keyPair("Kylian Mbappé") === null);
check("keyPair — ß·ł·æ·ı도 대상", keyPair("Łukasz Skorupski")?.newKey === "lukasz skorupski" && keyPair("Kerem Aktürkoğlu") === null && keyPair("Barış Alper Yılmaz")?.newKey === "baris alper yilmaz");
check("keyPair — 문자열 아님은 null", keyPair(null) === null && keyPair(undefined) === null);

// ── 계획 ──────────────────────────────────────────────────────────────────
const deals = [
  { id: 223, deal_key: dealKey(OLD), player: HOJ },
  { id: 9, deal_key: dealKey("harry kane"), player: "Harry Kane" },
];
const news = [
  { id: 1, players: [HOJ], verdict_player_name: null, verdict_player: OLD },
  { id: 2, players: ["Harry Kane"], verdict_player_name: null, verdict_player: "harry kane" },
  // 판정 이름이 그 선수 — players가 비어도 확인된다
  { id: 3, players: [], verdict_player_name: HOJ, verdict_player: OLD },
  // verdict_player가 옛 키지만 그 행의 이름이 그 선수가 아니면 건드리지 않는다
  { id: 4, players: ["Someone Else"], verdict_player_name: null, verdict_player: OLD },
];
const nameRows = [
  { kind: "player", key: OLD, name_en: HOJ },
  { kind: "player_club", key: OLD, name_en: "Tottenham Hotspur" },
  { kind: "player_owner_club", key: OLD, name_en: "Tottenham Hotspur" },
  { kind: "club", key: OLD, name_en: "x" },
];
const plan = planRekey({ deals, news, nameRows, dictKeys: [OLD, "harry kane"] });

check("딜 — 옛 키 딜만 새 키로(id 그대로)", eq(plan.dealMoves.map((m) => [m.id, m.from, m.to]), [[223, dealKey(OLD), dealKey(NEW)]]));
check("딜 — 충돌 없음", plan.dealConflicts.length === 0);
check("보도 — 그 선수의 행만(1·3), 다른 선수 이름의 행(4)·대상 아닌 행(2)은 빼고", eq(plan.newsMoves.map((m) => m.id), [1, 3]) && plan.newsMoves.every((m) => m.to === NEW));
check("이름 캐시 — 선수 키인 종류(player·player_club·player_owner_club)만", eq(plan.nameMoves.map((m) => m.kind), ["player", "player_club", "player_owner_club"]));
check("사람 사전의 옛 키는 경고만", eq(plan.dictWarnings.map((w) => w.oldKey), [OLD]));

// 둘 다 있는 충돌
const both = planRekey({ deals: [...deals, { id: 500, deal_key: dealKey(NEW), player: "Pierre-Emile Hojbjerg" }], news: [], nameRows: [] });
check("딜 — 새 키 딜이 이미 있으면 옮기지 않고 병합 필요로", both.dealMoves.length === 0 && eq(both.dealConflicts.map((c) => [c.oldId, c.newId]), [[223, 500]]));

const nameBoth = planRekey({ deals: [], news: [], nameRows: [{ kind: "player", key: OLD, name_en: HOJ }, { kind: "player", key: NEW, name_en: "Pierre-Emile Hojbjerg" }] });
check("이름 캐시 — 새 키 행이 있으면 옛 행은 손대지 않고 보고만", nameBoth.nameMoves.length === 0 && nameBoth.nameConflicts.length === 1);

// 모호 — 글자 없는 이름의 키가 옛 키와 같다
const amb = collectTargets({ deals: [{ id: 1, deal_key: dealKey("ab"), player: "Aøb" }, { id: 2, deal_key: dealKey("x"), player: "Ab" }] });
check("모호 — 글자 없는 이름과 옛 키가 같으면 옮기지 않는다", amb.targets.size === 0 && amb.ambiguous.length === 1);
const amb2 = collectTargets({ deals: [{ id: 1, deal_key: "k", player: "Aøb" }, { id: 2, deal_key: "j", player: "Aæb" }] });
check("모호 — 같은 옛 키가 새 키 둘로 가면 옮기지 않는다", amb2.targets.size === 0 && amb2.ambiguous[0]?.newKeys.length === 2);

// 대상 아님
const none = planRekey({ deals: [deals[1]], news: [news[1]], nameRows: [], dictKeys: [] });
check("대상 아님 — 빈 계획", isEmptyPlan(none) && none.targets.length === 0);

// 멱등 — 계획을 적용한 뒤의 상태로 다시 계산하면 비어 있다
const apply = (p, { deals: d, news: n, nameRows: r }) => ({
  deals: d.map((x) => { const m = p.dealMoves.find((y) => y.id === x.id); return m ? { ...x, deal_key: m.to } : x; }),
  news: n.map((x) => { const m = p.newsMoves.find((y) => y.id === x.id); return m ? { ...x, verdict_player: m.to } : x; }),
  nameRows: r.map((x) => { const m = p.nameMoves.find((y) => y.kind === x.kind && y.from === x.key); return m ? { ...x, key: m.to } : x; }),
});
const after = apply(plan, { deals, news, nameRows });
const again = planRekey({ ...after, dictKeys: [] });
check("멱등 — 적용 뒤 다시 계산하면 바꿀 것 없음", isEmptyPlan(again) && again.dealConflicts.length === 0 && again.nameConflicts.length === 0);
check("멱등 — 적용 뒤 딜 id 223이 새 규칙의 dealKey를 갖는다", after.deals.find((d) => d.id === 223).deal_key === dealKey(normalizePlayer(HOJ)));

console.log(`\n${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);

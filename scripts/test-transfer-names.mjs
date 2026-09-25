/**
 * 이름 사전(선수·구단 한국어 표기)의 회귀 테스트 — 위키데이터를 부르지 않는다(응답은 픽스처다).
 *
 *   node scripts/test-transfer-names.mjs
 */
import { RECHECK_MS, createNameBook, missingNames, shortClubName } from "./lib/transfer/names-ko.mjs";
import { koLabel, pickEntity } from "./lib/transfer/wikidata.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 위키데이터 응답 판정 ──────────────────────────────────────────────────
const claim = (id) => ({ mainsnak: { datavalue: { value: { id } } } });
const ENT = {
  Q1: { labels: { ko: { value: "왓퍼드" } }, claims: { P31: [claim("Q515")] } }, // 도시
  Q2: { labels: { ko: { value: "왓퍼드 FC" } }, claims: { P31: [claim("Q476028")] } }, // 구단
  Q3: { labels: { ko: { value: "페데리코 키에사" } }, claims: { P106: [claim("Q937857")] } }, // 축구 선수
  Q4: { labels: { ko: { value: "Federico Chiesa" } }, claims: { P106: [claim("Q937857")] } }, // 한글 없는 레이블
  Q5: { labels: {}, claims: { P106: [claim("Q937857")] } }, // 한국어 레이블 없음
  Q6: { labels: { ko: { value: "페데리코 키에사" } }, claims: { P106: [claim("Q33999")] } }, // 동명이인(배우)
};
check("구단 — 검색 첫 결과가 도시여도 축구 클럽 항목을 고른다", eq(pickEntity(["Q1", "Q2"], ENT, "club"), { wikidataId: "Q2", nameKo: "왓퍼드 FC" }));
check("선수 — 직업이 축구 선수가 아닌 동명이인은 건너뛴다", eq(pickEntity(["Q6", "Q3"], ENT, "player"), { wikidataId: "Q3", nameKo: "페데리코 키에사" }));
check("한글이 없는 한국어 레이블은 없는 것으로 본다(영문 복사본)", eq(pickEntity(["Q4"], ENT, "player"), { wikidataId: "Q4", nameKo: null }));
check("한국어 레이블이 없으면 항목만 남는다", eq(pickEntity(["Q5"], ENT, "player"), { wikidataId: "Q5", nameKo: null }));
check("종류가 맞는 항목이 없으면 둘 다 null", eq(pickEntity(["Q1"], ENT, "club"), { wikidataId: null, nameKo: null }));
check("koLabel — 한글이 있어야 한다", koLabel(ENT.Q3) === "페데리코 키에사" && koLabel(ENT.Q4) === null);

// ── 구단 약칭 ──────────────────────────────────────────────────────────
check("약칭 — 뒤 FC를 걷는다", shortClubName("왓퍼드 FC") === "왓퍼드");
check("약칭 — 뒤 CF", shortClubName("인터 마이애미 CF") === "인터 마이애미");
check("약칭 — 앞 VfL", shortClubName("VfL 볼프스부르크") === "볼프스부르크");
check("약칭 — 걷을 게 없으면 그대로", shortClubName("리버풀") === "리버풀");
check("약칭 — 다 걷어 비면 원래 이름", shortClubName("FC") === "FC");

// ── 우선순위: 사람 > 캐시 ─────────────────────────────────────────────────
const NOW = Date.parse("2026-09-25T00:00:00Z");
const fresh = "2026-09-20T00:00:00Z";
const stale = new Date(NOW - RECHECK_MS - 1).toISOString();
const book = createNameBook({
  players: { "david alaba": { ko: "다비드 알라바", position: "CB" } },
  clubs: { Watford: "왓퍼드" },
  cache: [
    { kind: "player", key: "david alaba", name_ko: "다비트 알라바", checked_at: fresh },
    { kind: "player", key: "federico chiesa", name_ko: "페데리코 키에사", checked_at: fresh },
    { kind: "player", key: "andria bartishvili", name_ko: null, checked_at: fresh },
    { kind: "player", key: "isaac konde", name_ko: null, checked_at: stale },
    { kind: "club", key: "Watford", name_ko: "왓퍼드 FC", checked_at: fresh },
    { kind: "club", key: "Wolfsburg", name_ko: "VfL 볼프스부르크", checked_at: fresh },
  ],
});
check("사람이 고친 선수 표기가 캐시를 이긴다(다비트 → 다비드)", book.playerKo("david alaba") === "다비드 알라바");
check("사람 사전에 없으면 캐시", book.playerKo("federico chiesa") === "페데리코 키에사");
check("캐시에 '없음'이면 null(영문 그대로)", book.playerKo("andria bartishvili") === null);
check("사람이 고친 구단 표기가 캐시를 이긴다", eq(book.club("Watford"), { name: "왓퍼드", short: "왓퍼드" }));
check("구단 캐시 — 약칭은 앞 VfL을 걷는다", eq(book.club("Wolfsburg"), { name: "VfL 볼프스부르크", short: "볼프스부르크" }));
check("5대 리그는 프리셋이 이긴다(엠블럼·리그와 한 쌍)", eq(book.club("Arsenal"), { name: "아스날", short: "아스날" }));
check("사전 어디에도 없으면 null", book.club("Kolkheti 1913") === null);

// ── 무엇을 찾을까 ────────────────────────────────────────────────────────
check("사람 사전에 있으면 찾지 않는다", !book.needsLookup("player", "david alaba", NOW));
check("캐시에 있으면 찾지 않는다", !book.needsLookup("player", "federico chiesa", NOW));
check("최근에 못 찾은 이름은 다시 찾지 않는다(매시간 검색하지 않게)", !book.needsLookup("player", "andria bartishvili", NOW));
check("못 찾은 지 30일이 지나면 다시 찾는다", book.needsLookup("player", "isaac konde", NOW));
check("처음 보는 이름은 찾는다", book.needsLookup("player", "john doe", NOW));
check("프리셋 구단은 찾지 않는다", !book.needsLookup("club", "Arsenal", NOW));
const need = missingNames([
  { player: "John Doe", playerKey: "john doe", fromCanonical: "Kolkheti 1913", toCanonical: "Arsenal" },
  { player: "John Doe", playerKey: "john doe", fromCanonical: "Kolkheti 1913", toCanonical: null },
], book, NOW);
check("딜의 선수·구단 중 빠진 것만, 중복 없이",
  eq(need, [{ kind: "player", key: "john doe", name: "John Doe" }, { kind: "club", key: "Kolkheti 1913", name: "Kolkheti 1913" }]), JSON.stringify(need));

console.log(`\n이름 사전 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);

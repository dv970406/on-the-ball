/**
 * 이름 사전(선수·구단 한국어 표기)의 회귀 테스트 — 위키데이터를 부르지 않는다(응답은 픽스처다).
 *
 *   node scripts/test-transfer-names.mjs
 */
import { RECHECK_MS, createNameBook, missingNames, shortClubName } from "./lib/transfer/names-ko.mjs";
import { koLabel, lookupKo, normalizeName, pickEntity, toHits } from "./lib/transfer/wikidata.mjs";

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
const hit = (id, ...texts) => ({ id, texts });
check("구단 — 검색 첫 결과가 도시여도 축구 클럽 항목을 고른다", eq(pickEntity([hit("Q1", "Watford"), hit("Q2", "Watford F.C.")], ENT, "club", "Watford"), { wikidataId: "Q2", nameKo: "왓퍼드 FC" }));
check("선수 — 직업이 축구 선수가 아닌 동명이인은 건너뛴다", eq(pickEntity([hit("Q6", "Federico Chiesa"), hit("Q3", "Federico Chiesa")], ENT, "player", "Federico Chiesa"), { wikidataId: "Q3", nameKo: "페데리코 키에사" }));
check("한글이 없는 한국어 레이블은 없는 것으로 본다(영문 복사본)", eq(pickEntity([hit("Q4", "Federico Chiesa")], ENT, "player", "Federico Chiesa"), { wikidataId: "Q4", nameKo: null }));
check("한국어 레이블이 없으면 항목만 남는다", eq(pickEntity([hit("Q5", "Federico Chiesa")], ENT, "player", "Federico Chiesa"), { wikidataId: "Q5", nameKo: null }));
check("종류가 맞는 항목이 없으면 둘 다 null", eq(pickEntity([hit("Q1", "Watford")], ENT, "club", "Watford"), { wikidataId: null, nameKo: null }));

// 운영 사고: "Joao Pedro"가 별칭 앞부분만 맞는 주앙 칸셀루로 풀렸다 — 검색 응답을 그대로 옮긴 픽스처
const JP = {
  Q109982356: { labels: {}, claims: {} }, // 박물관 인물(축구 선수 아님)
  Q6298063: { labels: { ko: { value: "주앙 칸셀루" } }, claims: { P106: [claim("Q937857")] } },
  Q64005114: { labels: { ko: { value: "주앙 페드루" } }, claims: { P106: [claim("Q937857")] } },
  Q96384789: { labels: {}, claims: { P106: [claim("Q937857")] } }, // 동명의 다른 선수(한국어 레이블 없음)
};
const JP_HITS = toHits([
  { id: "Q109982356", label: "Joao Pedro", match: { type: "label", text: "Joao Pedro" } },
  { id: "Q6298063", label: "João Cancelo", match: { type: "alias", text: "Joao Pedro Cavaco Cancelo" } },
  { id: "Q64005114", label: "João Pedro", match: { type: "label", text: "João Pedro" } },
  { id: "Q96384789", label: "João Pedro", match: { type: "label", text: "João Pedro" } },
]);
check("선수 — 별칭 앞부분만 맞는 다른 선수(칸셀루)를 고르지 않는다", eq(pickEntity(JP_HITS, JP, "player", "Joao Pedro"), { wikidataId: "Q64005114", nameKo: "주앙 페드루" }));
check("선수 — 이름이 통째로 같은 후보가 없으면 고르지 않는다", eq(pickEntity([hit("Q6298063", "João Cancelo", "Joao Pedro Cavaco Cancelo")], JP, "player", "Joao Pedro"), { wikidataId: null, nameKo: null }));
check("선수 — 별칭이 통째로 같으면 받는다", eq(pickEntity([hit("Q6298063", "João Cancelo", "Joao Cancelo")], JP, "player", "Joao Cancelo"), { wikidataId: "Q6298063", nameKo: "주앙 칸셀루" }));
check(
  "선수 — 같은 이름의 선수가 서로 다른 한국어 표기로 여럿이면 고르지 않는다(틀린 칸보다 빈 칸)",
  eq(pickEntity([hit("Q6298063", "Joao Pedro"), hit("Q64005114", "João Pedro")], JP, "player", "Joao Pedro"), { wikidataId: null, nameKo: null }),
);
// 동명이인 중 압도적으로 유명한 한 명(브루누 페르난드스)은 고르고, 비슷하면 비운다
const links = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`w${i}`, {}]));
const BF = {
  Q1: { labels: { ko: { value: "브루누 페르난드스" } }, sitelinks: links(60), claims: { P106: [claim("Q937857")] } },
  Q2: { labels: { ko: { value: "브루누 주앙 난딩가 보르즈스 페르난드스" } }, sitelinks: links(8), claims: { P106: [claim("Q937857")] } },
  Q3: { labels: { ko: { value: "다른 페르난드스" } }, sitelinks: links(40), claims: { P106: [claim("Q937857")] } },
};
check("선수 — 동명이인 중 언어판 수가 2배 이상인 한 명은 고른다", eq(pickEntity([hit("Q2", "Bruno Fernandes"), hit("Q1", "Bruno Fernandes")], BF, "player", "Bruno Fernandes"), { wikidataId: "Q1", nameKo: "브루누 페르난드스" }));
check("선수 — 동명이인의 유명도가 비슷하면 비운다", eq(pickEntity([hit("Q1", "Bruno Fernandes"), hit("Q3", "Bruno Fernandes")], BF, "player", "Bruno Fernandes"), { wikidataId: null, nameKo: null }));
{
  let calls = 0;
  const r = await lookupKo("Joao", "player", async () => {
    calls += 1;
    throw new Error("불리면 안 된다");
  });
  check("선수 — 이름 한 토큰(Joao)은 위키데이터를 부르지도 않는다", eq(r, { wikidataId: null, nameKo: null }) && calls === 0);
}
{
  // 선수 출신 감독 — 직업에 "축구 선수"와 "축구 감독"이 함께 붙어 있다(투헬)
  const TT = { Q1: { labels: { ko: { value: "토마스 투헬" } }, claims: { P106: [claim("Q937857"), claim("Q628099")] } } };
  check("선수 — 직업에 축구 감독이 함께 붙은 사람은 선수로 보지 않는다", eq(pickEntity([hit("Q1", "Thomas Tuchel")], TT, "player", "Thomas Tuchel"), { wikidataId: null, nameKo: null }));
}
{
  // 이름이 통째로 같은 은퇴 선수(1969년생) — 칼리아리 유망주 "Alessandro Romano"가 이 사람으로 확인됐다
  const born = (y) => ({ P569: [{ mainsnak: { datavalue: { value: { time: `+${y}-09-30T00:00:00Z` } } } }] });
  const AR = {
    Q1: { labels: {}, claims: { P106: [claim("Q937857")], ...born(1969) } },
    Q2: { labels: { ko: { value: "젊은 로마노" } }, claims: { P106: [claim("Q937857")], ...born(2008) } },
    Q3: { labels: {}, claims: { P106: [claim("Q937857")] } },
  };
  check("선수 — 40세를 넘은 동명이인은 받지 않는다(은퇴 선수)", eq(pickEntity([hit("Q1", "Alessandro Romano")], AR, "player", "Alessandro Romano", 2026), { wikidataId: null, nameKo: null }));
  check("선수 — 같은 이름이라도 나이가 맞는 쪽을 고른다", eq(pickEntity([hit("Q1", "Alessandro Romano"), hit("Q2", "Alessandro Romano")], AR, "player", "Alessandro Romano", 2026), { wikidataId: "Q2", nameKo: "젊은 로마노" }));
  check("선수 — 출생일이 없으면 나이로 거르지 않는다", pickEntity([hit("Q3", "Alessandro Romano")], AR, "player", "Alessandro Romano", 2026).wikidataId === "Q3");
}
check("normalizeName — 악센트·대소문자·기호를 접는다", normalizeName("João  Pedro-") === normalizeName("joao pedro"));
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

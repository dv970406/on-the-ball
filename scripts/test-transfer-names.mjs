/**
 * 이름 사전(선수·구단 한국어 표기)의 회귀 테스트 — 위키데이터를 부르지 않는다(응답은 픽스처다).
 *
 *   node scripts/test-transfer-names.mjs
 */
import { CLUB_RECHECK_MS, RECHECK_MS, cacheLlmNames, canonicalClubName, createNameBook, lookupAndCache, missingNames, renameInSummary, shortClubName, syncDictionaryNames } from "./lib/transfer/names-ko.mjs";
import { koLabel, lookupKo, normalizeName, pickCurrentClub, pickEntity, toHits } from "./lib/transfer/wikidata.mjs";

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
check("선수 — 별칭만 앞부분이 같은 후보는 하나뿐이어도 고르지 않는다(칸셀루)", eq(pickEntity([hit("Q6298063", "João Cancelo", "Joao Pedro Cavaco Cancelo")], JP, "player", "Joao Pedro"), { wikidataId: null, nameKo: null }));
check("선수 — 레이블이 찾는 이름으로 시작하는 후보가 하나뿐이면 받는다(Valentin Atangana ↔ Valentin Atangana Edoa)", eq(pickEntity([hit("Q6298063", "Valentin Atangana Edoa")], JP, "player", "Valentin Atangana"), { wikidataId: "Q6298063", nameKo: "주앙 칸셀루" }));
check("선수 — 찾는 이름이 레이블로 시작하고 별칭이 찾는 이름으로 시작하면 받는다(Estevao Willian ↔ Estevão + 긴 별칭)", eq(pickEntity([hit("Q6298063", "Estevão", "Estêvão Willian Almeida de Oliveira Gonçalves")], JP, "player", "Estevao Willian"), { wikidataId: "Q6298063", nameKo: "주앙 칸셀루" }));
check("선수 — 앞부분 일치 후보가 둘이면 비운다", eq(pickEntity([hit("Q6298063", "Valentin Atangana Edoa"), hit("Q64005114", "Valentin Atangana Nkosi")], JP, "player", "Valentin Atangana"), { wikidataId: null, nameKo: null }));
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

// ── 현 소속 구단(P54) — 종료일 없는 축구 클럽 중 시작이 가장 늦은 것 ────────────────────
const team = (id, en, ko, p31 = "Q476028") => ({ labels: { en: { value: en }, ko: { value: ko } }, claims: { P31: [claim(p31)] } });
const p54 = (id, { start, end, rank } = {}) => ({
  rank: rank ?? "normal",
  mainsnak: { datavalue: { value: { id } } },
  qualifiers: { ...(start ? { P580: [{ datavalue: { value: { time: start } } }] } : {}), ...(end === undefined ? {} : { P582: [end ? { datavalue: { value: { time: end } } } : {}] }) },
});
const TEAMS = { Q10: team("Q10", "Tottenham Hotspur F.C.", "토트넘 홋스퍼 FC"), Q11: team("Q11", "FC Bayern Munich", "FC 바이에른 뮌헨"), Q12: team("Q12", "England national football team", "잉글랜드 축구 국가대표팀", "Q6979593"), Q13: team("Q13", "Loan Town", "론 타운") };
const kane = { claims: { P54: [p54("Q10", { start: "+2009-01-01T00:00:00Z", end: "+2023-08-12T00:00:00Z" }), p54("Q11", { start: "+2023-08-12T00:00:00Z" }), p54("Q12", { start: "+2015-03-27T00:00:00Z" })] } };
check("현 소속 — 종료된 소속·국가대표팀을 빼고 남은 클럽", eq(pickCurrentClub(kane, TEAMS), { wikidataId: "Q11", nameEn: "FC Bayern Munich", nameKo: "FC 바이에른 뮌헨" }));
check("현 소속 — 임대 중이면 시작이 더 늦은 임대 구단", pickCurrentClub({ claims: { P54: [p54("Q11", { start: "+2023-08-12T00:00:00Z" }), p54("Q13", { start: "+2026-01-10T00:00:00Z" })] } }, TEAMS)?.wikidataId === "Q13");
check("현 소속 — 값 없는 종료일(somevalue)도 끝난 소속이다", pickCurrentClub({ claims: { P54: [p54("Q11", { start: "+2023-08-12T00:00:00Z", end: null })] } }, TEAMS) === null);
check("현 소속 — 종료일 없는 클럽이 하나도 없으면 null(지어내지 않는다)", pickCurrentClub({ claims: { P54: [p54("Q10", { end: "+2023-08-12T00:00:00Z" })] } }, TEAMS) === null && pickCurrentClub({ claims: {} }, TEAMS) === null);
check("현 소속 — 우선 순위(preferred)가 시작일보다 먼저다", pickCurrentClub({ claims: { P54: [p54("Q11", { start: "+2020-01-01T00:00:00Z", rank: "preferred" }), p54("Q13", { start: "+2026-01-10T00:00:00Z" })] } }, TEAMS)?.wikidataId === "Q11");
check("정규명 — 위키데이터 레이블이 구단 사전 별칭으로 풀리면 정규명, 아니면 레이블 그대로", canonicalClubName("FC Bayern Munich") === "Bayern Munich" && canonicalClubName("Kolkheti 1913") === "Kolkheti 1913");
const clubBook = createNameBook({ cache: [
  { kind: "player_club", key: "harry kane", name_en: "Bayern Munich", name_ko: null, wikidata_id: "Q11", checked_at: new Date(NOW - 86_400_000).toISOString() },
  { kind: "player_club", key: "finn jeltsch", name_en: "Finn Jeltsch", name_ko: null, wikidata_id: null, checked_at: new Date(NOW - 86_400_000).toISOString() },
  { kind: "player_club", key: "old man", name_en: "Old Club", name_ko: null, wikidata_id: "Q99", checked_at: new Date(NOW - CLUB_RECHECK_MS - 1).toISOString() },
] });
check("사전 — 현 소속은 찾은 행만 값이고, 못 찾은 행·없는 행은 null", clubBook.currentClub("harry kane") === "Bayern Munich" && clubBook.currentClub("finn jeltsch") === null && clubBook.currentClub("nobody") === null);
check("사전 — 조회 대상: 없는 행·재확인 주기가 지난 행(찾았어도 소속은 바뀐다), 최근 행은 아니다", clubBook.needsClubLookup("nobody", NOW) && clubBook.needsClubLookup("old man", NOW) && !clubBook.needsClubLookup("harry kane", NOW) && !clubBook.needsClubLookup("finn jeltsch", NOW));

// ── 표기의 기준은 팬들이 쓰는 표기다 — 사람 사전 → 판정자의 통용 표기 → 위키데이터 레이블 ──
{
  const cache = [
    { kind: "player", key: "cody gakpo", name_en: "Cody Gakpo", name_ko: "코디 가크포", wikidata_id: "Q1", source: "wikidata", checked_at: "2026-09-01T00:00:00Z" },
    { kind: "player", key: "isaac konde", name_en: "Isaac Konde", name_ko: "아이작 콘데", wikidata_id: null, source: "llm", checked_at: "1970-01-01T00:00:00.000Z" },
    { kind: "player", key: "bernardo silva", name_en: "Bernardo Silva", name_ko: "베르나르두 실바", wikidata_id: "Q2", source: "wikidata", checked_at: "2026-09-01T00:00:00Z" },
    { kind: "player", key: "thiago silva", name_en: "Thiago Silva", name_ko: null, wikidata_id: "Q3", source: "wikidata", checked_at: "2026-09-01T00:00:00Z" },
  ];
  const book = createNameBook({ players: { "erling haaland": { ko: "엘링 홀란드" } }, cache });
  check("표기 — 믿는 표기는 사람 사전과 통용 표기뿐이다(위키데이터 레이블은 판정자에게 넘기지 않는다)", book.playerKoTrusted("erling haaland") === "엘링 홀란드" && book.playerKoTrusted("isaac konde") === "아이작 콘데" && book.playerKoTrusted("cody gakpo") === null && book.playerKo("cody gakpo") === "코디 가크포");
  check("성으로 찾기 — 아는 선수(사전 · 확인된 캐시) 중 그 성을 가진 선수", eq(book.playersBySurname("haaland"), [{ key: "erling haaland", name: "Erling Haaland" }]) && book.playersBySurname("silva").length === 2 && book.playersBySurname("konde").length === 0);

  check("요약 표기 — 전체 이름과 성 부분을 함께 바꾼다", renameInSummary("리버풀의 판 데이크가 떠난다. 버질 판 데이크는", "버질 판 데이크", "버질 반 다이크") === "리버풀의 반 다이크가 떠난다. 버질 반 다이크는");
  check("요약 표기 — 받침이 달라지면 조사를 맞추고, 이미 바뀐 글자를 또 늘리지 않는다", renameInSummary("엘링 홀란과 홀란드, 홀란은", "엘링 홀란", "엘링 홀란드") === "엘링 홀란드와 홀란드, 홀란드는");
  check("요약 표기 — 가크포를 → 각포를", renameInSummary("코디 가크포의 이적, 가크포를 원한다", "코디 가크포", "코디 각포") === "코디 각포의 이적, 각포를 원한다");

  // 쓰기 흐름 — 가짜 DB(쓴 것을 모은다)
  const fake = (summaries = []) => {
    const log = { upserts: [], updates: [] };
    const news = { select: () => news, eq: () => news, not: async () => ({ data: summaries, error: null }), update: (v) => ({ eq: async (_c, id) => { log.updates.push({ table: "transfer_news", id, ...v }); return { error: null }; } }) };
    const names = { upsert: async (rows) => { log.upserts.push(...rows); return { error: null }; }, update: (v) => ({ eq: () => ({ eq: async (_c, key) => { log.updates.push({ table: "transfer_name_ko", key, ...v }); return { error: null }; } }) }) };
    return { log, from: (t) => (t === "transfer_news" ? news : names) };
  };
  const db1 = fake([{ id: 7, summary_ko: "코디 가크포의 이적이 무산됐다." }]);
  const wrote = await cacheLlmNames(db1, [{ key: "cody gakpo", name: "Cody Gakpo", ko: "코디 각포" }, { key: "erling haaland", name: "Erling Haaland", ko: "엘링 홀란" }, { key: "isaac konde", name: "Isaac Konde", ko: "이삭 콘데" }], book);
  check("통용 표기 — 위키데이터 레이블을 덮고 항목 id는 남긴다(사람 사전·앞선 통용 표기는 건드리지 않는다)", wrote === 1 && eq(db1.log.upserts.map((r) => [r.key, r.name_ko, r.wikidata_id, r.source]), [["cody gakpo", "코디 각포", "Q1", "llm"]]), JSON.stringify(db1.log.upserts));
  check("통용 표기 — 레이블을 덮으면 이미 쓴 요약도 바꾼다", eq(db1.log.updates, [{ table: "transfer_news", id: 7, summary_ko: "코디 각포의 이적이 무산됐다." }]), JSON.stringify(db1.log.updates));

  const db2 = fake();
  const found = async () => ({ ok: true, json: async () => ({}) });
  await lookupAndCache(db2, [{ kind: "player", key: "isaac konde", name: "Isaac Konde" }], { book, fetchImpl: found }).catch(() => null);
  check("조회 — 통용 표기가 있는 행은 위키데이터가 표기를 덮지 않는다", db2.log.upserts.every((r) => r.key !== "isaac konde" || (r.name_ko === "아이작 콘데" && r.source === "llm")), JSON.stringify(db2.log.upserts));

  const db3 = fake([{ id: 9, summary_ko: "리버풀이 가크포를 판다." }]);
  const sync = await syncDictionaryNames(db3, book, { "cody gakpo": { ko: "코디 각포" }, "erling haaland": { ko: "엘링 홀란드" } });
  check("사전 맞춤 — 사람 사전과 다른 캐시 표기를 사전 표기로 고치고 요약도 바꾼다(캐시에 없는 선수는 대상이 아니다)", sync.synced === 1 && sync.summariesFixed === 1 && eq(db3.log.updates, [{ table: "transfer_name_ko", key: "cody gakpo", name_ko: "코디 각포" }, { table: "transfer_news", id: 9, summary_ko: "리버풀이 각포를 판다." }]), JSON.stringify([sync, db3.log.updates]));
}

console.log(`\n이름 사전 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);

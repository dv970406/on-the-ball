/**
 * 이름 표기 정비 목록(`names-todo.mjs`)의 회귀 테스트 — DB·API 없이 가짜 행으로 목록 계산만 본다.
 *
 *   node scripts/test-transfer-names-todo.mjs
 */
import { readFileSync } from "node:fs";
import {
  buildTodo,
  citedKey,
  findNameSpan,
  isCitedKnown,
  isContiguousPart,
  latinNameIn,
  levenshtein,
  nameSkeleton,
  renderMarkdown,
  romanize,
  summaryDivergence,
  suspiciousDictKeys,
} from "./names-todo.mjs";
import { dealKey } from "./lib/transfer/derive-deals.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 편집 거리 ─────────────────────────────────────────────────────────────
check("편집 거리 — 같으면 0", levenshtein("quansah", "quansah") === 0);
check("편집 거리 — 글자 하나 빠짐은 1(jarrell ↔ jarell)", levenshtein("jarrell quansah", "jarell quansah") === 1);
check("편집 거리 — 치환 2", levenshtein("kitten", "sitten") === 1 && levenshtein("kitten", "sittin") === 2);
check("편집 거리 — 한글은 음절 단위", levenshtein("각포", "가크포") === 2);

// ── 인용 매체 키 — reporter.ts의 citedKey와 대조 ──────────────────────────
// ⚠ 화면의 TS 함수를 그대로 읽어 실행한다 — 두 규칙이 갈리면 여기서 깨진다
const reporterTs = readFileSync(new URL("../src/entities/transfer/lib/reporter.ts", import.meta.url), "utf8");
const tsBody = reporterTs.match(/function citedKey\(outlet: string\): string \{([\s\S]*?)\n\}/u);
check("reporter.ts에 citedKey가 있다", Boolean(tsBody), "함수 시그니처가 바뀌었으면 이 테스트의 정규식을 함께 고친다");
if (tsBody) {
  const tsCitedKey = new Function("outlet", tsBody[1]);
  const samples = ["TeamTalk", "Teamtalk", "The Sun", "Sun", "L'Equipe", "Football Insider", "4-4-2.ch", "Gazzetta dello Sport", "The  Athletic", "Mundo Deportivo", "THE TIMES", "Thesun"];
  const diff = samples.filter((x) => tsCitedKey(x) !== citedKey(x));
  check("citedKey — 화면(reporter.ts)과 같은 값을 낸다", diff.length === 0, diff.join(", "));
}
const cited = JSON.parse(readFileSync(new URL("./lib/transfer/reporters.json", import.meta.url), "utf8")).cited;
const notFolded = Object.keys(cited).filter((k) => citedKey(k) !== k);
check("reporters.json의 cited 키는 이미 접힌 형태다", notFolded.length === 0, notFolded.join(", "));
check("cited — 표기 차이를 접어 찾는다(The TeamTalk)", isCitedKnown("TeamTalk", { teamtalk: {} }) && isCitedKnown("The Teamtalk", { teamtalk: {} }));
check("cited — 'A via B'는 앞 신문으로도 찾는다", isCitedKnown("Gazzetta via Glasgow Times", { gazzetta: {} }));
check("cited — 없는 매체", !isCitedKnown("Open Goal podcast", { teamtalk: {} }));

// ── 요약 속 이름 찾기 ─────────────────────────────────────────────────────
check("로마자 — 각포 = gakpo", romanize("각포") === "gakpo");
check("로마자 — 홀란드 = holrandeu(음절마다 옮긴다 — 이름 찾기용 근사)", romanize("홀란드") === "holrandeu");
check("자음 골격 — 각포·가크포·Gakpo가 같다", nameSkeleton("gakpo") === nameSkeleton("Gakpo") && nameSkeleton(romanize("가크포")) === nameSkeleton("Gakpo"));
check("자음 골격 — 홀란드 = Haaland", nameSkeleton(romanize("홀란드")) === nameSkeleton("Haaland"));
check("이름 찾기 — 조사를 걷는다(코디 가크포의)", findNameSpan("코디 가크포의 맨체스터 시티행 이적이 무산됐다.", "Cody Gakpo")?.text === "코디 가크포");
check("이름 찾기 — 성만 쓴 요약(케인은)", findNameSpan("바이에른의 케인은 재계약에 합의했다.", "Harry Kane")?.text === "케인");
check("이름 찾기 — 뒤에 붙은 낱말을 끌어오지 않는다(골격이 접는 \"영입\"·\"대해\")", findNameSpan("레알이 엘링 홀란 영입에 관심을 보인다.", "Erling Haaland")?.text === "엘링 홀란" && findNameSpan("밀란의 카마르다에 대해 첼시가 관심", "Francesco Camarda")?.text === "카마르다");
check("이름 찾기 — 전체 이름이 성보다 먼저(해리 케인 > 케인)", findNameSpan("해리 케인이 합의했다.", "Harry Kane")?.text === "해리 케인");
check("이름 찾기 — 하이픈을 낱말 안에 둔다", findNameSpan("트렌트 알렉산더-아놀드는 떠날 생각이 없다.", "Trent Alexander-Arnold")?.text === "트렌트 알렉산더-아놀드");
check("이름 찾기 — 이름이 없으면 null(짧은 골격이 일반어에 우연히 맞지 않는다)", findNameSpan("계약 기간이 남았지만 구단은 매각을 검토한다.", "Harry Kane") === null);
check("이름 찾기 — 영문 이름만 있는 요약은 null", findNameSpan("Kane이 합의했다", "Harry Kane") === null);

check("영문 이름 — 한글 요약에 남은 영문 이름을 덩어리째", latinNameIn("16세 유망주 Dany Freire가 테스트를 통과했다.", "Dany Freire")?.text === "Dany Freire" && latinNameIn("유망주 JJ Gabriel을", "JJ Gabriel")?.text === "JJ Gabriel");
check("영문 이름 — 다른 영문(구단 약칭)은 이름이 아니다", latinNameIn("PSV의 핵심 자원", "Noah Fernandez") === null);
check("일부 판정 — 성만", isContiguousPart("코네", "에마누엘 마누 코네") && isContiguousPart("마누 코네", "에마누엘 마누 코네"));
check("일부 판정 — 하이픈·띄어쓰기 차이는 같다", isContiguousPart("알렉산더-아널드", "트렌트 알렉산더아널드") && isContiguousPart("아놀드", "트렌트 알렉산더-아놀드"));
check("일부 판정 — 다른 표기는 일부가 아니다", !isContiguousPart("가크포", "코디 각포") && !isContiguousPart("홀란", "엘링 홀란드"));

const S = (id, summary) => ({ id, summary });
check(
  "갈림 — 기준과 같거나 그 일부(성·조사)면 갈림이 아니다",
  summaryDivergence([S(1, "코디 각포가 합류했다."), S(2, "각포의 이적료는 공개되지 않았다."), S(3, "리버풀은 각포를 지킨다.")], "Cody Gakpo", "코디 각포") === null,
);
const withRef = summaryDivergence([S(1, "코디 각포가 합류했다."), S(2, "코디 가크포의 이적이 무산됐다."), S(3, "코디 가크포는 남는다.")], "Cody Gakpo", "코디 각포");
check("갈림 — 기준과 다른 표기를 모은다", eq(withRef?.variants.map((v) => [v.ko, v.ids]), [["코디 가크포", [2, 3]]]), JSON.stringify(withRef));
const noRef = summaryDivergence([S(1, "엘링 홀란드가 남는다."), S(2, "엘링 홀란이 관심을 받는다."), S(3, "홀란드는 재계약했다.")], "Erling Haaland", null);
check("갈림 — 기준이 없으면 서로의 일부가 아닌 표기가 둘 이상일 때", eq(noRef?.variants.map((v) => v.ko).sort(), ["엘링 홀란", "엘링 홀란드", "홀란드"].sort()), JSON.stringify(noRef));
check("갈림 — 기준이 없어도 성만 쓴 것은 갈림이 아니다", summaryDivergence([S(1, "엘링 홀란드가 남는다."), S(2, "홀란드는 재계약했다.")], "Erling Haaland", null) === null);

check("갈림 — 영문 이름이 남은 요약도 갈림이다", eq(summaryDivergence([S(1, "도르트문트가 Dany Freire를 노린다.")], "Dany Freire", "대니 프레이르")?.variants.map((v) => v.ko), ["Dany Freire"]));

// ── 사전 키 의심 ──────────────────────────────────────────────────────────
const sus = suspiciousDictKeys(["jarell quansah", "cody gakpo", "old player"], new Map([["jarrell quansah", 2], ["cody gakpo", 3], ["someone else", 1]]));
check("사전 키 의심 — 범위에 없는 키의 거리 1~2 이웃만", eq(sus, [{ key: "jarell quansah", near: [{ key: "jarrell quansah", distance: 1, count: 2 }] }]), JSON.stringify(sus));
check("사전 키 의심 — 이웃이 다른 사전 키면 의심하지 않는다", suspiciousDictKeys(["jarell quansah", "jarrell quansah"], new Map([["jarrell quansah", 1]])).length === 0);

// ── 전체 목록(가짜 행) ────────────────────────────────────────────────────
const players = { "cody gakpo": { ko: "코디 각포" }, "jarell quansah": { ko: "자렐 콴사" } };
const cache = [
  { kind: "player", key: "tyler morton", name_en: "Tyler Morton", name_ko: "타일러 모튼", wikidata_id: "Q1", source: "llm", checked_at: "2026-10-01T00:00:00Z" },
  { kind: "player", key: "finn jeltsch", name_en: "Finn Jeltsch", name_ko: "핀 옐치", wikidata_id: null, source: "llm", checked_at: "2026-10-01T00:00:00Z" },
  { kind: "player", key: "cody gakpo", name_en: "Cody Gakpo", name_ko: "코디 가크포", wikidata_id: "Q2", source: "llm", checked_at: "2026-10-01T00:00:00Z" },
  { kind: "player", key: "nico paz", name_en: "Nico Paz", name_ko: null, wikidata_id: "Q3", source: "wikidata", checked_at: "2026-10-01T00:00:00Z" },
  { kind: "club", key: "Sturm Graz", name_en: "Sturm Graz", name_ko: "SK 슈투름 그라츠", wikidata_id: "Q9", source: "wikidata", checked_at: "2026-10-01T00:00:00Z" },
];
const row = (id, o) => ({ id, source_id: "rss:x", players: [], verdict: null, verdict_player: null, verdict_player_name: null, summary_ko: null, attribution: "byline", attributed_to: null, verdict_suitors: [], ...o });
const rows = [
  row(1, { players: ["Cody Gakpo"], verdict: "move", verdict_player: "cody gakpo", summary_ko: "코디 각포가 합류했다.", verdict_to: "Liverpool" }),
  row(2, { players: ["Cody Gakpo"], verdict: "move", verdict_player: "cody gakpo", summary_ko: "코디 가크포의 이적이 무산됐다.", verdict_from: "Sturm Graz", verdict_to: "Kolkheti 1913" }),
  row(3, { players: ["Jarrell Quansah"], verdict: "move", verdict_player: "jarrell quansah", source_id: "rss:a" }),
  row(4, { players: ["Jarrell Quansah"], verdict: "move", verdict_player: "jarrell quansah", source_id: "rss:b" }),
  row(5, { attribution: "cited", attributed_to: "TeamTalk" }),
  row(6, { attribution: "cited", attributed_to: "Open Goal via Daily Record" }),
  row(7, { attribution: "cited", attributed_to: "Open goal" }),
  row(8, { players: ["Tyler Morton"] }),
];
const deal = (player, o = {}) => ({ deal_key: dealKey(player.toLowerCase()), player, stage: "rumour", latest_reported_at: "2026-10-01T00:00:00Z", report_count: 1, ...o });
const derived = {
  verified: {
    deals: [deal("Cody Gakpo"), deal("Unstored Player", { latest_reported_at: "2026-10-05T00:00:00Z" })],
    clubs: [{ canonical: "Kolkheti 1913", name: "Kolkheti 1913" }, { canonical: "Liverpool", name: "리버풀" }],
    nameNeeds: [
      { player: "Cody Gakpo", playerKey: "cody gakpo" },
      { player: "Jarrell Quansah", playerKey: "jarrell quansah" },
      { player: "Inacio", playerKey: "inacio" },
      { player: "Unstored Player", playerKey: "unstored player" },
    ],
  },
  open: {
    deals: [deal("Cody Gakpo"), deal("Jarrell Quansah", { stage: "talks", report_count: 2 })],
    clubs: [],
    nameNeeds: [],
  },
};
const boardDeals = [
  { id: 11, deal_key: dealKey("cody gakpo"), player: "Cody Gakpo", stage: "rumour", latest_reported_at: "2026-10-02T00:00:00+00:00" },
  { id: 12, deal_key: dealKey("tyler morton"), player: "Tyler Morton", stage: "rumour", latest_reported_at: "2026-10-03T00:00:00+00:00" },
  { id: 13, deal_key: dealKey("nico paz"), player: "Nico Paz", stage: "offer", latest_reported_at: "2026-10-04T00:00:00+00:00" },
];
const todo = buildTodo({ rows, cache, players, glossaryClubs: {}, cited: { teamtalk: { ko: "팀토크" } }, boardDeals, derived });

check(
  "1 — 사전에 없는 llm 표기만, 보드 딜이 먼저",
  eq(todo.pendingLlm.map((p) => [p.key, p.onBoard, p.dealIds]), [["tyler morton", true, [12]], ["finn jeltsch", false, []]]),
  JSON.stringify(todo.pendingLlm),
);
check(
  "2 — 사전·캐시 모두 표기가 없는 보드 딜(저장 안 된 파생 딜 포함), 최신순",
  eq(todo.missingKo.map((m) => [m.key, m.dealId]), [["unstored player", null], ["nico paz", 13]]),
  JSON.stringify(todo.missingKo),
);
check(
  "3 — 확인 관문만 걸린 이름(운영 관문을 지난 딜은 빠진다), 넣으면 열리는 것 먼저",
  eq(todo.blocked.map((b) => [b.key, b.opensIfAdded, b.moveVerdicts, b.moveSources, b.singleToken]), [["jarrell quansah", true, 2, 2, false], ["inacio", false, 0, 0, true]]),
  JSON.stringify(todo.blocked),
);
check("4 — 사전 표기와 다른 요약 표기", eq(todo.summarySplits.map((s) => [s.key, s.reference, s.referenceFrom, s.variants.map((v) => v.ko)]), [["cody gakpo", "코디 각포", "사전", ["코디 가크포"]]]), JSON.stringify(todo.summarySplits));
check("5 — 사전 키 오타 의심", eq(todo.dictSuspects.map((d) => [d.key, d.near[0].key]), [["jarell quansah", "jarrell quansah"]]), JSON.stringify(todo.dictSuspects));
check(
  "6-a — 한국어 없는 판정 구단(캐시에 한국어가 있는 구단·사전 구단은 빠진다), 보드 구단 먼저",
  eq(todo.englishClubs.map((c) => [c.canonical, c.onBoard, c.count]), [["Kolkheti 1913", true, 2]]),
  JSON.stringify(todo.englishClubs),
);
check("6-b — cited에 없는 인용 매체를 키로 접어 센다", eq(todo.unknownOutlets.map((o) => [o.key, o.count, o.forms]), [["opengoal", 2, ["Open Goal via Daily Record", "Open goal"]]]), JSON.stringify(todo.unknownOutlets));

const md = renderMarkdown(todo, { target: "테스트" });
check("마크다운 — 여섯 목록 제목이 다 있다", ["## 1.", "## 2.", "## 3.", "## 4.", "## 5.", "### 6-a.", "### 6-b."].every((h) => md.includes(h)));
check("마크다운 — 표 칸의 | 를 이스케이프한다", !renderMarkdown({ ...todo, unknownOutlets: [{ key: "a|b", forms: ["x|y"], count: 1 }] }).includes("| a|b |"));

console.log(`\n${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);

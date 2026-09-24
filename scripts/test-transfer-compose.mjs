/**
 * 이적설 글 조립(`scripts/lib/transfer/compose.mjs`) 회귀 테스트 — DB 없이 합성 행으로 돈다.
 *
 *   node scripts/test-transfer-compose.mjs
 *
 * 여기 사례는 전부 실제로 틀렸던 출력이다(QA). 조립 규칙을 고치면 이걸 먼저 돌린다.
 */
import { composeTransferPost } from "./lib/transfer/compose.mjs";

let n = 0;
const row = (body, extra = {}) => ({
  id: ++n,
  source_id: "tg:romano",
  attribution: "linked_mirror",
  stage: "official",
  attributed_to: "fabrizioromano",
  fee_text: null,
  players: ["John Doe"],
  url: `https://t.me/fabrizioromanotg/${n}`,
  published_at: `2026-09-${String(10 + n).padStart(2, "0")}T00:00:00Z`,
  body,
  ...extra,
});

/** 표의 각 행이 칸 구분자(이스케이프되지 않은 `|`)를 정확히 3개 갖는가 — 원문의 `|`가 표를 깨지 않는다 */
const tableIntact = (content) =>
  content.split("\n").filter((l) => l.startsWith("| ")).every((l) => (l.match(/(?<!\\)\|/g) ?? []).length === 3);
const cell = (content, label) => content.split("\n").find((l) => l.startsWith(`| ${label} |`)) ?? "";

const CASES = [
  {
    name: "무산이 대표 단계가 된다(합의 뒤 무산)",
    rows: [row("Chelsea agree deal for John Doe from Benfica.", { stage: "agreement" }), row("John Doe deal with Chelsea has collapsed.", { stage: "collapsed" })],
    check: (p) => p.title.endsWith("이적 무산") && cell(p.content, "진행 단계").includes("무산"),
  },
  {
    name: "문장 앞 일반어(Deal·Sources)를 구단으로 받지 않는다",
    rows: [row("Deal completed. Sources confirm John Doe to Brighton.", { stage: "here_we_go" })],
    check: (p) => cell(p.content, "행선지").includes("브라이턴") && !/Deal|Sources/.test(p.content.split("#### ")[0].split("> ")[0]),
  },
  {
    name: "속보 표식(EXCL)을 떼고 사전 밖 구단은 원문 그대로",
    rows: [row("EXCL Watford sign John Doe from Real Madrid.", { stage: "here_we_go" })],
    check: (p) => cell(p.content, "행선지").includes("Watford") && !cell(p.content, "행선지").includes("EXCL") && cell(p.content, "소속팀").includes("레알 마드리드"),
  },
  {
    name: "동명 구단(Inter Miami)은 인테르가 아니다 — 영문, 엠블럼 없음",
    rows: [row("John Doe will join Inter Miami. Agreement done.", { stage: "agreement" })],
    check: (p) => cell(p.content, "행선지").includes("Inter Miami") && !cell(p.content, "행선지").includes("crests"),
  },
  {
    name: "Newcastle Jets·Forest Green Rovers가 EPL 구단으로 표시되지 않는다",
    rows: [row("Official: John Doe joins Newcastle Jets from Forest Green Rovers.")],
    check: (p) => cell(p.content, "행선지").includes("Newcastle Jets") && cell(p.content, "소속팀").includes("Forest Green Rovers") && !p.content.includes("/crests/"),
  },
  {
    name: "원문의 파이프·서식·링크가 표와 인용을 깨지 않는다",
    rows: [row("Arsenal confirm John Doe | col | **bold** [x](javascript:alert(1)) <img src=x> `code` _it_\n# Heading\n- item", {
      // 레지스트리 밖 소스 — 보도 칸에 원문의 매체명(`attributed_to`)이 그대로 들어가는 경로
      source_id: "rss:qa-unknown", attribution: "outlet", attributed_to: "Sky | Sports", url: "https://ex.com/a(b",
    })],
    check: (p) =>
      tableIntact(p.content) &&
      cell(p.content, "보도").includes("Sky \\| Sports") &&
      !/(?<!\\)\]\(javascript/.test(p.content) &&
      !/(?<!\\)\*\*bold/.test(p.content) &&
      p.content.includes("[원문](<https://ex.com/a(b>)"),
  },
  {
    name: "인용 중간의 '— … (@계정)'은 서명이 아니다 — 뒤 문장을 자르지 않는다",
    rows: [row("Arsenal confirm John Doe — as told by coach (@coach) on Monday, then more facts follow here.")],
    check: (p) => p.content.includes("then more facts"),
  },
  {
    name: "다른 선수의 계약 만료가 섞이지 않는다",
    rows: [
      row("Arsenal confirm John Doe on a five-year deal.", { players: ["John Doe"] }),
      row("Lee Kim's contract runs until June 2030 at Arsenal. John Doe agreed too.", { players: ["Lee Kim", "John Doe"], stage: "rumour" }),
    ],
    check: (p) => cell(p.content, "계약").includes("5년") && !cell(p.content, "계약").includes("2030"),
  },
  {
    name: "경기장·국가를 행선지로 받지 않는다(자유 계약만 남는다)",
    rows: [row("Official: John Doe joined Stamford Bridge today; he left Brazil as a free agent.")],
    check: (p) => !/Stamford|Brazil/.test(p.content.split("> ")[0]) && cell(p.content, "소속팀").includes("FA"),
  },
  {
    name: "이모지를 중간에서 자르지 않는다(인용 140그래핌)",
    rows: [row(`Arsenal confirm John Doe ${"👨‍👩‍👧‍👦".repeat(200)}`)],
    check: (p) => {
      const q = p.content.split("\n").find((l) => l.startsWith("> ")) ?? "";
      return q.isWellFormed() && !/‍…$/.test(q) && q.endsWith("…");
    },
  },
  {
    name: "소유격 구단(PSV's …)은 행선지가 아니다",
    rows: [row("Chelsea confirm John Doe after looking at PSV's Paul Wanner.")],
    check: (p) => cell(p.content, "행선지").includes("첼시") && !cell(p.content, "소속팀").includes("PSV"),
  },
];

const ERRORS = [
  { name: "빈 키워드", rows: [row("Arsenal confirm John Doe.")], keyword: "" },
  { name: "와일드카드 키워드", rows: [row("Arsenal confirm John Doe.")], keyword: "%" },
  { name: "가십 모음만 있으면 글을 만들지 않는다", rows: [row("Man Utd & Liverpool eye John Doe - Wednesday's gossip", { source_id: "rss:bbc-gossip" })], keyword: "Doe" },
  { name: "구단을 읽을 수 없으면(이적 기사 아님) 글을 만들지 않는다", rows: [row("John Doe scored twice in a 3-1 win.", { stage: "rumour" })], keyword: "Doe" },
  { name: "부분 일치로 다른 이야기를 잡지 않는다(Read ↔ already)", rows: [row("Arsenal already confirm John Doe.")], keyword: "Read" },
];

let pass = 0;
for (const c of CASES) {
  const p = composeTransferPost(c.rows, c.keyword ?? "Doe");
  const ok = !("error" in p) && c.check(p);
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}`);
  if (!ok) console.log(`   ${"error" in p ? `error: ${p.error}` : `${p.title}\n   ${p.content.replace(/\n/g, "\n   ")}`}`);
}
for (const c of ERRORS) {
  const p = composeTransferPost(c.rows, c.keyword);
  const ok = "error" in p;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} 거부: ${c.name}${ok ? "" : ` — 만들어짐: ${p.title}`}`);
}
const total = CASES.length + ERRORS.length;
console.log(`\n글 조립 ${pass}/${total} 통과`);
if (pass !== total) process.exit(1);

/**
 * 수집한 이적 소식 → 이적설 게시글(제목 + 마크다운 본문).
 *
 * 순수 함수다 — DB를 모른다. 입력은 `transfer_news` 행 배열(한 선수의 이야기로 묶기 전이어도 된다),
 * 출력은 `{ title, content }` 또는 `{ error }`다. 조회·저장은 호출자(`scripts/compose-transfer-post.mjs`).
 *
 * 형식(사용자 결정):
 *   - 말머리는 대표 보도 기자의 **한국어 전체 이름**(파브리지오 로마노·데이비드 온스테인…), 매체면 매체명.
 *   - 특정 기자의 관용구("HERE WE GO")를 말머리·단계·진행 경과에 쓰지 않는다 — 중립 어휘로 통일.
 *   - 한 줄 요약 + 표(선수·소속팀·행선지·추정 이적료·계약·진행 단계·보도·최종 업데이트) + 짧은 인용 + 진행 경과.
 *   - 5대 리그 구단은 한국어명 + 엠블럼 아이콘, 그 밖은 원문 영문명 그대로(엠블럼 없음).
 *
 * ⚠ **원문 재배포 범위**: 링크 + 짧은 인용(140자) + 추출된 사실만 싣는다(`api-and-db.md`).
 * ⚠ **틀린 값보다 빈 칸이 낫다.** 소속팀·행선지·이적료·계약은 그 선수가 나오는 **문장에서만** 읽고,
 *   못 읽으면 "미확인"으로 둔다. 이적이 아니라고 보이면 글을 만들지 않는다.
 */
import { readFileSync } from "node:fs";
import { clubDisplay } from "./club-display.mjs";
import { detectClubs } from "./clubs.mjs";
import { contractLabel, parseContract } from "./contract.mjs";
import { DEST, FORMER, FROM, LEFT_FREE, vote } from "./direction.mjs";
import { extractTransfer } from "./extract.mjs";
import { RANK, RENEWAL, cleanBody, escapeRe, isRoundup, mentionRe, sentencesOf } from "./story.mjs";

// ── 표기 ────────────────────────────────────────────────────────────────
const STAGE = {
  rumour: "관심", talks: "협상 중", offer: "오퍼", agreement: "구단 간 합의", personal_terms: "개인 조건 합의",
  medical: "메디컬", here_we_go: "사실상 확정", official: "공식 발표", collapsed: "무산", unknown: "기타",
};
const HEADLINE = {
  rumour: "관심", talks: "협상 중", offer: "오퍼 제출", agreement: "이적 합의", personal_terms: "개인 조건 합의",
  medical: "메디컬 진행", here_we_go: "이적 사실상 확정", official: "이적 공식 발표", collapsed: "이적 무산",
};

/**
 * 보도 주체 표기 — `reporters.json`이 단일 소스다(이적시장 화면이 같은 파일을 읽는다).
 *   journalists: 계정·핸들 → 성 / sources: 소스 id → 보도 주체.
 * ⚠ Google News 소스는 **그 기자의 보도를 인용한 기사**를 모은 피드라 보도 주체는 기자다 —
 *   `attributed_to`(Yahoo Sports·Football365 같은 재인용 매체)를 말머리로 쓰면 규칙 위반이다.
 */
const REPORTERS = JSON.parse(readFileSync(new URL("./reporters.json", import.meta.url), "utf8"));
const JOURNALIST = REPORTERS.journalists;
const SOURCE = REPORTERS.sources;
const BYLINE = REPORTERS.bylines;
// ⚠ byline이 등재된 기자면 매체보다 기자가 먼저다(지역지 RSS의 기자 기사). 화면(`entities/transfer/lib/reporter.ts`)과 같은 순서
const reporter = (r) => BYLINE[r.attributed_to] ?? SOURCE[r.source_id] ?? JOURNALIST[r.attributed_to] ?? r.attributed_to ?? r.source_id;
// 기자로 세는 이름 — 계정 매핑의 성 + Google News 소스의 보도 주체(그 피드는 기자 이름으로 검색한 것이다)
const JOURNALIST_NAMES = new Set([
  ...Object.values(JOURNALIST),
  ...Object.values(BYLINE),
  ...Object.entries(SOURCE).filter(([id]) => id.startsWith("gnews:")).map(([, name]) => name),
]);
const isJournalist = (name) => JOURNALIST_NAMES.has(name);

// ── 마크다운 안전 ────────────────────────────────────────────────────────
/**
 * 원문에서 온 값을 인라인 마크다운으로 안전하게. 표 칸의 `|`가 표를 깨고, `*`·`[`·`<`·백틱이 서식·링크가 된다.
 * ⚠ react-markdown이 raw HTML을 그리지 않지만(`styling.md`) 서식·링크 주입은 막아 주지 않는다.
 */
const md = (s) => String(s).replace(/\s+/g, " ").trim().replace(/[\\`*_[\]<>|~#!]/g, "\\$&");

/** 링크 주소 — 꺾쇠로 감싸면 괄호가 든 주소도 깨지지 않는다(CommonMark 링크 대상) */
const href = (u) => (typeof u === "string" && /^https?:\/\/[^\s<>]+$/.test(u) ? `<${u}>` : null);

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("ko", { granularity: "grapheme" }) : null;
/** 그래핌 단위 절단 — 국기·가족 이모지 중간에서 자르지 않는다 */
function clampGraphemes(s, n) {
  const parts = segmenter ? [...segmenter.segment(s)].map((x) => x.segment) : [...s];
  return parts.length <= n ? s : `${parts.slice(0, n).join("").trimEnd()}…`;
}
const graphemeLength = (s) => (segmenter ? [...segmenter.segment(s)].length : [...s].length);

// ── 구단 ────────────────────────────────────────────────────────────────
// 문장 손질은 story.mjs, 방향 판정(소속팀·행선지·자유 계약·전 소속)은 direction.mjs — 딜 파생과 공유한다.

/** 구단 → 표 칸 문자열. 엠블럼 아이콘의 대체 텍스트는 비운다 — 바로 옆 이름을 스크린리더가 두 번 읽는다 */
function clubCell(name) {
  const d = clubDisplay(name);
  return `${d.crest ? `![](${d.crest} "icon")` : ""}${md(d.name)}`;
}
const clubName = (name) => clubDisplay(name).name;

// ── 계약 ────────────────────────────────────────────────────────────────
/** 계약 칸 — 파싱은 contract.mjs(딜 파생과 공유), 여기서는 표 칸 문구만 만든다 */
const contract = (sentences) => contractLabel(parseContract(sentences));

// ── 시각 ────────────────────────────────────────────────────────────────
/** KST "9/24 01:33" */
function kst(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ── 선수 ────────────────────────────────────────────────────────────────
/**
 * 키워드 → 선수 이름. 추출기가 잡은 선수 중 키워드를 담은 이름이 우선이고, 없으면 원문에서
 * 키워드를 품은 고유명사를 찾는다("Gibbs" → "Morgan Gibbs-White").
 * ⚠ 기사 첫 선수를 그냥 쓰지 않는다 — 가십·다선수 기사에서 **다른 선수의 이름으로 제목이 났다**(QA).
 */
function findPlayer(items, keyword) {
  const kw = mentionRe(keyword);
  const votes = new Map();
  const add = (n) => votes.set(n, (votes.get(n) ?? 0) + 1);
  for (const r of items) for (const p of r.players ?? []) if (kw.test(p)) add(p);
  if (!votes.size) {
    const re = new RegExp(String.raw`(?:[A-Z][\p{L}'’-]+\s)*${escapeRe(keyword)}(?:[\p{L}'’-]*)(?:\s[A-Z][\p{L}'’-]+)*`, "gu");
    for (const r of items) for (const m of r.body.matchAll(re)) add(m[0].trim());
  }
  return [...votes.entries()]
    .map(([name, count]) => [name.replace(/['’]s$/, ""), count])
    .filter(([name]) => isPersonLike(name))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? null;
}

/**
 * 사람 이름처럼 생겼는가 — 구단명·속보 표식·일반어로 글을 만들지 않는다.
 * ⚠ 키워드가 "Arsenal"·"EXCL"·"here we go"여도 글이 만들어져 제목이 "[로마노] EXCL, 우디네세 …"가 됐다(QA).
 */
const NOT_PERSON = /^(?:EXCL|EXCLUSIVE|BREAKING|OFFICIAL|Official|Understand|Here We Go|Sources|Deal|Club|South American|Premier League)$/i;
function isPersonLike(name) {
  return /^\p{Lu}/u.test(name) && !NOT_PERSON.test(name) && detectClubs(name).length === 0;
}

/**
 * 그 선수에게 해당하는 단계.
 * ⚠ 기사 단계를 그대로 쓰면 **곁들여 나온 선수가 기사 주인공의 단계를 받는다** — 알라바 메디컬 기사 끝의
 *   "Juventus … close in on signing Neto"가 Neto의 "사실상 확정"이 됐다(QA). 추출기가 그 선수만 잡은
 *   기사가 아니면, 선수가 나오는 문장만으로 단계를 다시 판정한다.
 */
function stageFor(r, kwRe) {
  const single = (r.players ?? []).length > 0 && r.players.every((p) => kwRe.test(p));
  if (single) return r.stage;
  let best = "unknown";
  for (const s of sentencesOf(cleanBody(r)).filter((x) => kwRe.test(x))) {
    const st = extractTransfer(s).stage;
    if (st === "collapsed") return "collapsed";
    if (RANK.indexOf(st) > RANK.indexOf(best)) best = st;
  }
  return best;
}

/** 재계약·연장 — 이적 기사가 아니다 */

// ── 조립 ────────────────────────────────────────────────────────────────
const TITLE_MAX = 120; // 화면 한도(그래핌) — `TITLE_LIMIT`과 같은 값
const CONTENT_MAX = 20000; // 본문 DB 한도(코드포인트)
const TIMELINE_MAX = 8;

/**
 * @param {object[]} rows  transfer_news 행(id, source_id, attribution, stage, attributed_to, fee_text, players, body, url, published_at)
 * @param {string} keyword 선수 이름(성만이어도 된다)
 * @returns {{ title: string, content: string, sources: number[] } | { error: string }}
 */
export function composeTransferPost(rows, keyword) {
  const kw = typeof keyword === "string" ? keyword.trim() : "";
  if (!/^[\p{L}][\p{L}'’. -]{1,40}$/u.test(kw)) return { error: "선수 이름(2~41자, 글자로 시작)이 필요합니다" };
  const kwRe = mentionRe(kw);

  if (detectClubs(kw).length > 0) return { error: `"${kw}"는 구단 이름입니다 — 선수 이름을 넣어 주세요` };

  // 이야기 = 그 이름이 **단어로** 나오는 이적 기사(가십 모음 제외), 단계는 그 선수 기준으로 다시 매긴다
  const items = rows
    .filter((r) => r.stage !== "unknown" && !isRoundup(r) && kwRe.test(r.body))
    .map((r) => ({ ...r, stage: stageFor(r, kwRe) }))
    .filter((r) => r.stage !== "unknown")
    .sort((a, b) => a.published_at.localeCompare(b.published_at));
  if (!items.length) return { error: `"${kw}"의 이적 기사가 없습니다(가십 모음·미분류 제외)` };

  const player = findPlayer(items, kw);
  if (!player) return { error: `"${kw}"에 해당하는 선수 이름을 원문에서 찾지 못했습니다` };

  // 구단 판정은 그 선수가 나오는 문장에서만 — 한 기사에 다른 선수·다른 구단이 섞인다
  const sentences = items.flatMap((r) => sentencesOf(cleanBody(r)).filter((s) => kwRe.test(s)));
  // 계약·이적료는 추출기가 **그 선수 한 명만** 잡은 기사라면 기사 전체에서 읽는다 — 로마노는 둘째 문장을
  // "Former … centre back signs a one year deal until June 2027"처럼 이름 없이 쓴다
  const storySentences = items.flatMap((r) => {
    const all = sentencesOf(cleanBody(r));
    const single = (r.players ?? []).every((p) => kwRe.test(p));
    return single ? all : all.filter((s) => kwRe.test(s));
  });

  const free = vote(sentences, LEFT_FREE, player);
  const from = free ?? vote(sentences, FROM, player);
  const dest = vote(sentences, DEST, player);
  const isFree = Boolean(free) || sentences.some((s) => /\bfree agent\b/i.test(s));
  // 전 소속("former West Ham striker")은 이름 없이 쓰이는 일이 많아 단독 선수 기사 전체에서 읽는다
  const former = !from && !isFree ? vote(storySentences, FORMER, player) : null;
  const origin = from && from !== dest ? from : null;
  const destination = dest && dest !== from ? dest : null;

  if (!origin && !destination && !isFree) {
    return { error: `"${player}"의 소속팀·행선지를 원문에서 읽지 못했습니다 — 이적 기사가 아닐 수 있습니다` };
  }
  // 소속팀 없이 한 구단만 나오고 재계약 표현이 있으면 이적이 아니다("Arteta agrees new contract")
  if (!origin && !isFree && sentences.some((s) => RENEWAL.test(s))) {
    return { error: `"${player}" 기사는 재계약으로 보입니다 — 이적 기사가 아닙니다` };
  }

  // 대표 단계 — 진전은 되돌아가지 않고, 무산은 그 뒤에 다시 진전이 없으면 무산이다
  let stage = null;
  for (const r of items) {
    if (r.stage === "collapsed") stage = "collapsed";
    else if (stage === "collapsed" || stage === null || RANK.indexOf(r.stage) > RANK.indexOf(stage)) stage = r.stage;
  }
  // 대표 항목(인용·말머리) — 대표 단계의 가장 최신 보도, 기자 보도를 매체보다 앞세운다
  const ofStage = items.filter((r) => r.stage === stage);
  const top = [...ofStage].reverse().find((r) => isJournalist(reporter(r))) ?? ofStage[ofStage.length - 1];

  // 자유 계약이면 "구단 간" 합의가 아니다
  const stageLabel = (s) => (s === "agreement" && isFree ? "합의" : STAGE[s]);

  const fee = [...storySentences].reverse().map((s) => extractTransfer(s)).find((x) => x.feeText && x.feeAmount >= 0.005)?.feeText ?? null;
  const deal = contract(storySentences);

  // 보도 칸 — 같은 기자를 되받아 쓴 기사는 따로 세지 않는다(reporter가 이미 기자로 접는다)
  const sources = [...new Set(items.map(reporter))];
  const byline = sources.length > 1 ? `${md(reporter(top))} 외 ${sources.length - 1}곳` : md(reporter(top));

  const fromCell = origin
    ? `${clubCell(origin)}${isFree ? " (계약 만료 · FA)" : ""}`
    : isFree ? (former ? `${clubCell(former)} (계약 만료 · FA)` : "FA")
    : former ? `${clubCell(former)} (전 소속)` : "미확인";
  const feeCell = fee ? `**${md(fee)}**` : isFree ? "없음 (자유 계약)" : "미공개";
  const fromName = origin ?? former;

  // 진행 경과 — 시간순, 같은 단계가 연달아 오면 첫 보도에 "외 N곳"으로 접는다
  const timeline = [];
  for (const r of items) {
    const prev = timeline[timeline.length - 1];
    if (prev && prev.r.stage === r.stage) {
      if (!prev.names.has(reporter(r))) prev.names.add(reporter(r));
      continue;
    }
    timeline.push({ r, names: new Set([reporter(r)]) });
  }
  const shown = timeline.slice(-TIMELINE_MAX);

  let title = `[${reporter(top)}] ${player}${destination ? `, ${clubName(destination)}` : ""} ${HEADLINE[stage]}`;
  if (graphemeLength(title) > TITLE_MAX) title = clampGraphemes(title, TITLE_MAX - 1);

  const lines = [
    // 한 줄 요약 — 목록 카드 발췌와 공유 설명문이 이 문장으로 시작한다(표로 시작하면 "선수 … 소속팀 …" 나열이 된다)
    `**${md(player)}** · ${md(fromName ? clubName(fromName) : isFree ? "FA" : "소속 미확인")} → ${md(destination ? clubName(destination) : "행선지 미확인")} · ${stageLabel(stage)}`,
    "",
    `| 선수 | **${md(player)}** |`,
    "|---|---|",
    `| 소속팀 | ${fromCell} |`,
    `| 행선지 | ${destination ? `**${clubCell(destination)}**` : "미확인"} |`,
    `| 추정 이적료 | ${feeCell} |`,
    deal ? `| 계약 | ${md(deal)} |` : null,
    `| 진행 단계 | **${stageLabel(stage)}** |`,
    `| 보도 | ${byline} |`,
    `| 최종 업데이트 | ${kst(items[items.length - 1].published_at)} |`,
    "",
    `> ${md(clampGraphemes(cleanBody(top).replace(/\s+/g, " ").trim(), 140))}`,
    ">",
    `> — ${md(reporter(top))}${href(top.url) ? ` · [원문](${href(top.url)})` : ""}`,
    "",
    "#### 진행 경과",
    "",
    timeline.length > shown.length ? `- … 이전 ${timeline.length - shown.length}건` : null,
    ...shown.map(({ r, names }) => {
      const others = names.size > 1 ? ` 외 ${names.size - 1}곳` : "";
      return `- ${kst(r.published_at)} · **${stageLabel(r.stage)}** · ${md(reporter(r))}${others}${href(r.url) ? ` · [원문](${href(r.url)})` : ""}`;
    }),
  ].filter((l) => l !== null);

  const content = lines.join("\n");
  if ([...content].length > CONTENT_MAX) return { error: `본문이 ${CONTENT_MAX}자를 넘습니다` };
  return { title, content, sources: items.map((r) => r.id) };
}

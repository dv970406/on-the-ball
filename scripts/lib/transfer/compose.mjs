/**
 * 수집한 이적 소식 → 이적설 게시글(제목 + 마크다운 본문).
 *
 * 순수 함수다 — DB를 모른다. 입력은 `transfer_news` 행 배열(한 선수의 이야기로 묶기 전이어도 된다),
 * 출력은 `{ title, content }` 또는 `{ error }`다. 조회·저장은 호출자(`scripts/compose-transfer-post.mjs`).
 *
 * 형식(사용자 결정):
 *   - 말머리는 대표 보도 기자의 **성**(로마노·온스테인…), 매체면 매체명.
 *   - 특정 기자의 관용구("HERE WE GO")를 말머리·단계·진행 경과에 쓰지 않는다 — 중립 어휘로 통일.
 *   - 한 줄 요약 + 표(선수·소속팀·행선지·추정 이적료·계약·진행 단계·보도·최종 업데이트) + 짧은 인용 + 진행 경과.
 *   - 5대 리그 구단은 한국어명 + 엠블럼 아이콘, 그 밖은 원문 영문명 그대로(엠블럼 없음).
 *
 * ⚠ **원문 재배포 범위**: 링크 + 짧은 인용(140자) + 추출된 사실만 싣는다(`api-and-db.md`).
 * ⚠ **틀린 값보다 빈 칸이 낫다.** 소속팀·행선지·이적료·계약은 그 선수가 나오는 **문장에서만** 읽고,
 *   못 읽으면 "미확인"으로 둔다. 이적이 아니라고 보이면 글을 만들지 않는다.
 */
import { clubDisplay } from "./club-display.mjs";
import { detectClubs } from "./clubs.mjs";
import { extractTransfer } from "./extract.mjs";

// ── 표기 ────────────────────────────────────────────────────────────────
const STAGE = {
  rumour: "관심", talks: "협상 중", offer: "오퍼", agreement: "구단 간 합의", personal_terms: "개인 조건 합의",
  medical: "메디컬", here_we_go: "사실상 확정", official: "공식 발표", collapsed: "무산", unknown: "기타",
};
const HEADLINE = {
  rumour: "관심", talks: "협상 중", offer: "오퍼 제출", agreement: "이적 합의", personal_terms: "개인 조건 합의",
  medical: "메디컬 진행", here_we_go: "이적 사실상 확정", official: "이적 공식 발표", collapsed: "이적 무산",
};
/** 진전 순서 — 무산은 여기 없다(따로 다룬다) */
const RANK = ["rumour", "talks", "offer", "agreement", "personal_terms", "medical", "here_we_go", "official"];

/** 기자 — 계정·핸들 → 성 */
const JOURNALIST = {
  fabrizioromano: "로마노",
  fabrizioromanotg: "로마노",
  "david-ornstein.bsky.social": "온스테인",
  "jacobsben.bsky.social": "제이콥스",
  "nizaarkinsella.bsky.social": "킨셀라",
  "migueldelaney.bsky.social": "딜레이니",
};
/**
 * 소스 → 보도 주체.
 * ⚠ Google News 소스는 **그 기자의 보도를 인용한 기사**를 모은 피드라 보도 주체는 기자다 —
 *   `attributed_to`(Yahoo Sports·Football365 같은 재인용 매체)를 말머리로 쓰면 규칙 위반이다.
 */
const SOURCE = {
  "gnews:romano": "로마노", "gnews:ornstein": "온스테인", "gnews:mokbel": "목벨",
  "bsky:theathletic": "디 애슬레틱", "rss:bbc-football": "BBC", "rss:bbc-gossip": "BBC",
  "rss:sky-transfers": "스카이스포츠", "rss:guardian-football": "가디언",
};
const reporter = (r) => SOURCE[r.source_id] ?? JOURNALIST[r.attributed_to] ?? r.attributed_to ?? r.source_id;
const isJournalist = (name) => Object.values(JOURNALIST).includes(name) || name === "목벨";

/** 여러 선수를 한데 모은 가십 칼럼 — 한 선수의 이야기로 읽으면 남의 구단·금액이 섞인다 */
const isRoundup = (r) => r.source_id === "rss:bbc-gossip" || /\bgossip\b/i.test(r.body.split("\n")[0]);

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

// ── 문장 ────────────────────────────────────────────────────────────────
/** 인용·판정에 쓸 본문 — 링크·트윗 서명·Google News의 제목 반복을 걷어낸다 */
function cleanBody(r) {
  let t = r.body;
  // Google News는 "제목 - 매체\n\n제목 - 매체" 형태로 같은 문장이 두 번 온다
  if (r.source_id.startsWith("gnews:")) t = t.split(/\n\s*\n/)[0];
  return t
    .replace(/\s+—\s+[^—\n]{1,80}\(@\w+\)\s+[A-Z][a-z]{2} \d{1,2}, \d{4}\s*$/, "") // 텔레그램이 붙이는 트윗 서명(끝에 있을 때만)
    .replace(/https?:\/\/\S+|\bwww\.\S+/g, "")
    .replace(/^RT @\w+:\s*/, "");
}

const sentencesOf = (text) => text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── 구단 ────────────────────────────────────────────────────────────────
// 구단명 후보 — 대문자로 시작하는 토큰 1~4개(숫자 토큰 허용: "Kolkheti 1913", "Schalke 04")
const NAME = String.raw`((?:[A-Z][\p{L}\p{N}'.-]*)(?:\s(?:[A-Z][\p{L}\p{N}'.-]*|\d{2,4}))*)`;
/** 이름 앞에 붙는 속보 표식 — 구단명의 일부가 아니다 */
const TAG = String.raw`(?:(?:EXCL|EXCLUSIVE|BREAKING|OFFICIAL|Official|Understand|RT)\b[:,]?\s+)*`;
/**
 * 사전 밖 이름은 **구단처럼 생겼을 때만** 받는다 — "Verbal"·"Deal"·"Sources"·기자명·경기장·국가가
 * 행선지로 들어왔다(QA). 사전에 없는 구단은 대개 이런 표지를 달고 다닌다.
 */
const CLUB_LIKE = /\b(?:FC|CF|SC|AC|AFC|CD|SV|FK|SK|IF|BK|SL|United|City|Town|Rovers|Athletic|Sporting|Club|Olympique|Dynamo|Dinamo)\b|\s\d{2,4}$/;

function resolveClub(phrase, strong, player) {
  const raw = phrase.trim();
  const [known] = detectClubs(raw);
  if (known) return known;
  if (!strong || !CLUB_LIKE.test(raw)) return null;
  if (player.split(/\s+/).some((w) => raw.split(/\s+/).includes(w))) return null;
  return raw;
}

/** 패턴들이 잡은 구단을 모아 표가 가장 많은 것(확실한 문형 2표) */
function vote(sentences, patterns, player) {
  const votes = new Map();
  for (const s of sentences) {
    for (const { re, strong } of patterns) {
      for (const m of s.matchAll(re)) {
        // ⚠ 소유격("PSV's Paul Wanner")은 그 구단 소속의 **다른 선수** 이야기다
        if (/^['’]s\b/.test(s.slice(m.index + m[0].length))) continue;
        const name = resolveClub(m[1], strong, player);
        if (name) votes.set(name, (votes.get(name) ?? 0) + (strong ? 2 : 1));
      }
    }
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
const P = (src, strong) => ({ re: new RegExp(src, "gu"), strong });
const VERB = String.raw`(?:confirm(?:s|ed)?|complete(?:s|d)?|sign(?:s|ed)?|seal(?:s|ed)?|agree(?:s|d)?|reach(?:es|ed)?|announce(?:s|d)?|land(?:s|ed)?|secure(?:s|d)?)\b`;

const DEST = [
  // 문장 주어 + 확정 동사 — "Arsenal confirm …", "Watford confirm X has joined"
  P(String.raw`^[^\p{L}]*${TAG}${NAME}\s+(?:have\s+|has\s+)?${VERB}`, true),
  // "X joins <구단>" — "joined from"은 소속팀 쪽이라 뺀다
  P(String.raw`\bjoin(?:s|ed|ing)?\s+(?!from\b)${NAME}`, true),
  P(String.raw`\bsign(?:s|ed|ing)?\s+for\s+${NAME}`, true),
  P(String.raw`\b(?:to|move to|new)\s+${NAME}`, false),
  P(String.raw`\bat\s+${NAME}`, false),
];
const FROM = [
  P(String.raw`\bfrom\s+(?:his\s+parent\s+club\s+|the\s+)?${NAME}`, true),
  P(String.raw`\bparent club\s+${NAME}`, true),
];
const LEFT_FREE = [P(String.raw`\b(?:leaving|left|leaves)\s+${NAME}\s+(?:as (?:a )?free agent|on a free)`, true)];
const FORMER = [P(String.raw`\b(?:former|ex-)\s*${NAME}`, false)];

/** 구단 → 표 칸 문자열. 엠블럼 아이콘의 대체 텍스트는 비운다 — 바로 옆 이름을 스크린리더가 두 번 읽는다 */
function clubCell(name) {
  const d = clubDisplay(name);
  return `${d.crest ? `![](${d.crest} "icon")` : ""}${md(d.name)}`;
}
const clubName = (name) => clubDisplay(name).name;

// ── 계약 ────────────────────────────────────────────────────────────────
const MONTH = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/**
 * 계약 — 기간과 만료가 **같은 문장**에 함께 나온 것을 먼저 쓴다(최신 우선). 없으면 하나만 있는 문장.
 * ⚠ 서로 다른 문장의 기간과 만료를 조합하지 않는다 — 다른 선수의 "2030년까지"가 붙었다(QA).
 */
function contract(sentences) {
  const parsed = [...sentences].reverse().map((s) => ({
    years: s.match(/\b(one|two|three|four|five|six|\d)[- ]year\b/i),
    until: s.match(/\buntil (?:(January|February|March|April|May|June|July|August|September|October|November|December) (?:\d{1,2},? )?)?(20\d{2})\b/),
  }));
  const hit = parsed.find((x) => x.years && x.until) ?? parsed.find((x) => x.years || x.until);
  if (!hit) return null;
  const n = hit.years ? NUM[hit.years[1].toLowerCase()] ?? Number(hit.years[1]) : null;
  const end = hit.until ? `${hit.until[2]}년${hit.until[1] ? ` ${MONTH[hit.until[1]]}월` : ""}까지` : null;
  return [n ? `${n}년` : null, end].filter(Boolean).join(" · ");
}

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
  const kw = new RegExp(`(?<![\\p{L}])${escapeRe(keyword)}(?![\\p{L}])`, "iu");
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
const RENEWAL = /\b(?:new (?:deal|contract)|contract extension|extends?|extension|renew(?:s|ed|al)?|stay(?:s)? at)\b/i;

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
  const kwRe = new RegExp(`(?<![\\p{L}])${escapeRe(kw)}(?![\\p{L}])`, "iu");

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

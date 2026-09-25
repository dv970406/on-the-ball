/**
 * 이적 **방향** 판정 — 어느 구단에서 어느 구단으로 가는가.
 *
 * `compose.mjs`에 있던 것을 딜 파생(`derive-deals.mjs`)도 쓰도록 뺐다. 순수 함수뿐이다.
 *
 * ⚠ **틀린 값보다 빈 칸이 낫다.** 소속팀·행선지는 그 선수가 나오는 문장에서만 읽고, 사전 밖
 *   이름은 구단처럼 생겼을 때만 받는다 — "Verbal"·"Deal"·"Sources"·기자명·경기장·국가가
 *   행선지로 들어왔다(QA).
 */
import { detectClubs } from "./clubs.mjs";

// 구단명 후보 — 대문자로 시작하는 토큰 1~4개(숫자 토큰 허용: "Kolkheti 1913", "Schalke 04")
const NAME = String.raw`((?:[A-Z][\p{L}\p{N}'.-]*)(?:\s(?:[A-Z][\p{L}\p{N}'.-]*|\d{2,4}))*)`;
/** 이름 앞에 붙는 속보 표식 — 구단명의 일부가 아니다 */
const TAG = String.raw`(?:(?:EXCL|EXCLUSIVE|BREAKING|OFFICIAL|Official|Understand|RT)\b[:,]?\s+)*`;
/**
 * 사전 밖 이름은 **구단처럼 생겼을 때만** 받는다. 사전에 없는 구단은 대개 이런 표지를 달고 다닌다.
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

const P = (src, strong) => ({ re: new RegExp(src, "gu"), strong });
const VERB = String.raw`(?:confirm(?:s|ed)?|complete(?:s|d)?|sign(?:s|ed)?|seal(?:s|ed)?|agree(?:s|d)?|reach(?:es|ed)?|announce(?:s|d)?|land(?:s|ed)?|secure(?:s|d)?)\b`;

export const DEST = [
  // 문장 주어 + 확정 동사 — "Arsenal confirm …", "Watford confirm X has joined"
  P(String.raw`^[^\p{L}]*${TAG}${NAME}\s+(?:have\s+|has\s+)?${VERB}`, true),
  // "X joins <구단>" — "joined from"은 소속팀 쪽이라 뺀다
  P(String.raw`\bjoin(?:s|ed|ing)?\s+(?!from\b)${NAME}`, true),
  P(String.raw`\bsign(?:s|ed|ing)?\s+for\s+${NAME}`, true),
  P(String.raw`\b(?:to|move to|new)\s+${NAME}`, false),
  P(String.raw`\bat\s+${NAME}`, false),
];
export const FROM = [
  P(String.raw`\bfrom\s+(?:his\s+parent\s+club\s+|the\s+)?${NAME}`, true),
  P(String.raw`\bparent club\s+${NAME}`, true),
];
export const LEFT_FREE = [P(String.raw`\b(?:leaving|left|leaves)\s+${NAME}\s+(?:as (?:a )?free agent|on a free)`, true)];
export const FORMER = [P(String.raw`\b(?:former|ex-)\s*${NAME}`, false)];

/**
 * 패턴들이 잡은 구단별 표 — 확실한 문형은 2표, 나머지는 1표.
 * @returns {Map<string, number>} 정규 영문명(또는 구단처럼 생긴 원문) → 표
 */
export function collectVotes(sentences, patterns, player, weight = 1) {
  const votes = new Map();
  for (const s of sentences) {
    for (const { re, strong } of patterns) {
      for (const m of s.matchAll(re)) {
        // ⚠ 소유격("PSV's Paul Wanner")은 그 구단 소속의 **다른 선수** 이야기다
        if (/^['’]s\b/.test(s.slice(m.index + m[0].length))) continue;
        const name = resolveClub(m[1], strong, player);
        if (name) votes.set(name, (votes.get(name) ?? 0) + (strong ? 2 : 1) * weight);
      }
    }
  }
  return votes;
}

/** 표가 가장 많은 것. 동률이면 먼저 표를 얻은 쪽(Map 삽입 순서 — 안정 정렬) */
export function topVote(votes) {
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** `collectVotes` + `topVote` — 문장 묶음 하나에서 바로 답을 얻을 때 */
export const vote = (sentences, patterns, player) => topVote(collectVotes(sentences, patterns, player));

/** 여러 묶음의 표를 한 Map에 더한다(파생기가 행마다 가중치를 달리 줄 때) */
export function addVotes(into, votes) {
  for (const [name, n] of votes) into.set(name, (into.get(name) ?? 0) + n);
  return into;
}

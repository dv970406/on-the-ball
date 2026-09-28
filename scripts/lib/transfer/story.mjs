/**
 * 한 선수의 이야기로 읽기 위한 **텍스트 손질** — 딜 파생(derive-deals)이 쓴다.
 *
 * 순수 함수뿐이다. 둘이 각자 문장을 나누면 같은 원문에서 다른 문장 집합을 보게 되어
 * 글의 소속팀과 보드의 출발 구단이 갈린다.
 */

/** 진전 순서 — 무산은 여기 없다(따로 다룬다) */
export const RANK = ["rumour", "talks", "offer", "agreement", "personal_terms", "medical", "here_we_go", "official"];

/** 여러 선수를 한데 모은 가십 칼럼 — 한 선수의 이야기로 읽으면 남의 구단·금액이 섞인다 */
/**
 * 재계약·첫 프로 계약 — 같은 구단에 남는 계약이라 이적이 아니다. 소속·행선지를 못 읽었는데 이 표현이 있으면
 * 이적 기사로 보지 않는다.
 */
export const RENEWAL = /\b(?:new (?:long-term |long term |multi-year |improved |bumper )?(?:deal|contract)|contract extension|extends?|extension|renew(?:s|ed|al)?|stay(?:s)? at|(?:first )?professional (?:contract|deal)|first senior (?:deal|contract))\b/i;

/** 가십 칼럼에서 나눈 항목 행의 표지 — 칼럼 external_id 뒤에 붙는다(`roundup.mjs`) */
export const ITEM_MARK = "#item-";
/** 가십 칼럼에서 나눈 항목 행인가 — 한 문단 = 한 이적설이라 가십 모음이 아니다 */
export const isRoundupItem = (r) => typeof r.external_id === "string" && r.external_id.includes(ITEM_MARK);

/**
 * 가십 칼럼 — BBC 이적 가십(제목에 "gossip")과 스카이 신문 요약("Papers: …").
 * ⚠ 칼럼에서 나눈 항목 행은 칼럼과 같은 소스지만 가십 모음이 아니다(`isRoundupItem`).
 */
export const isRoundup = (r) =>
  !isRoundupItem(r) &&
  (r.source_id === "rss:bbc-gossip" || /\bgossip\b/i.test(r.body.split("\n")[0]) || (r.source_id === "rss:sky-transfers" && /^Papers:/u.test(r.body)));

/** 인용·판정에 쓸 본문 — 링크·트윗 서명·Google News의 제목 반복을 걷어낸다 */
export function cleanBody(r) {
  let t = r.body;
  // Google News는 "제목 - 매체\n\n제목 - 매체" 형태로 같은 문장이 두 번 온다
  if (r.source_id.startsWith("gnews:")) t = t.split(/\n\s*\n/)[0];
  return t
    .replace(/\s+—\s+[^—\n]{1,80}\(@\w+\)\s+[A-Z][a-z]{2} \d{1,2}, \d{4}\s*$/, "") // 텔레그램이 붙이는 트윗 서명(끝에 있을 때만)
    .replace(/https?:\/\/\S+|\bwww\.\S+/g, "")
    .replace(/^RT @\w+:\s*/, "");
}

export const sentencesOf = (text) => text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 키워드가 **단어로** 나오는가 — 부분 일치("Read" ↔ "already")는 다른 이야기를 섞는다 */
export const mentionRe = (keyword) => new RegExp(`(?<![\\p{L}])${escapeRe(keyword)}(?![\\p{L}])`, "iu");

/**
 * 계약 기간·만료 파싱 — 딜 파생(derive-deals)이 쓴다.
 *
 * 구조화된 값(`parseContract`)과 두 표기(`contractLabel` — 글의 표 칸, `contractText` — 보드의
 * `contract_text`)를 함께 둔다. 표기를 각자 만들면 같은 문장에서 다른 값이 나온다.
 */
const MONTH = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/**
 * 기간과 만료가 **같은 문장**에 함께 나온 것을 먼저 쓴다(최신 우선). 없으면 하나만 있는 문장.
 * ⚠ 서로 다른 문장의 기간과 만료를 조합하지 않는다 — 다른 선수의 "2030년까지"가 붙었다(QA).
 * @returns {{ years: number | null, untilYear: number | null, untilMonth: number | null } | null}
 */
export function parseContract(sentences) {
  const parsed = [...sentences].reverse().map((s) => ({
    years: s.match(/\b(one|two|three|four|five|six|\d)[- ]year\b/i),
    until: s.match(/\buntil (?:(January|February|March|April|May|June|July|August|September|October|November|December) (?:\d{1,2},? )?)?(20\d{2})\b/),
  }));
  const hit = parsed.find((x) => x.years && x.until) ?? parsed.find((x) => x.years || x.until);
  if (!hit) return null;
  const years = hit.years ? NUM[hit.years[1].toLowerCase()] ?? Number(hit.years[1]) : null;
  return {
    years: years || null,
    untilYear: hit.until ? Number(hit.until[2]) : null,
    untilMonth: hit.until?.[1] ? MONTH[hit.until[1]] : null,
  };
}

/** 글의 표 칸 — "5년 · 2027년 6월까지" */
export function contractLabel(c) {
  if (!c) return null;
  const end = c.untilYear ? `${c.untilYear}년${c.untilMonth ? ` ${c.untilMonth}월` : ""}까지` : null;
  return [c.years ? `${c.years}년` : null, end].filter(Boolean).join(" · ") || null;
}

/** 보드의 `contract_text` — 만료가 있으면 "2027.06"(월이 없으면 "2027"), 없으면 "5년" */
export function contractText(c) {
  if (!c) return null;
  if (c.untilYear) return c.untilMonth ? `${c.untilYear}.${String(c.untilMonth).padStart(2, "0")}` : String(c.untilYear);
  return c.years ? `${c.years}년` : null;
}

import reporters from "../../../../scripts/lib/transfer/reporters.json";
import type { TransferClub, TransferDeal, TransferReport } from "../model/types";
import { BYLINES, citedOutletOf, reporterName } from "./reporter";

/**
 * 출처의 공신력 — 🎖️(오피셜에 육박하는 매체에만), 또는 달 5단계(🌑 1 ~ 🌕 5 — 그 밖의 매체와 기자).
 * 등급의 단일 소스는 `scripts/lib/transfer/reporters.json`의 `credibility`다(보도 주체 표기와 같은 파일).
 */
export type Credibility = { kind: "medal" } | { kind: "moon"; level: 1 | 2 | 3 | 4 | 5 };

/** 등급 값 하나 — `"medal"` 또는 1~5. 어느 자리에 무엇이 허용되는지는 `test-transfer-extract.mjs`가 검사한다 */
type GradeValue = string | number;

/**
 * `reporters.json`에 적힌 등급 — 숫자 하나(어느 딜에서나 같다) 또는 **범위 등급**.
 * 범위 등급은 구단(코드)·리그(5대 리그 이름)마다 다른 등급이고, `default`는 범위 밖의 등급이다.
 * 예: `{ "default": 2, "clubs": { "atletico-madrid": 5 } }` — 아틀레티코가 걸린 딜에서만 🌕.
 */
export type GradeEntry =
  | GradeValue
  | { default: GradeValue; leagues?: Record<string, GradeValue>; clubs?: Record<string, GradeValue> };

const OUTLETS: Record<string, GradeEntry> = reporters.credibility.outlets;
const JOURNALISTS: Record<string, GradeEntry> = reporters.credibility.journalists;

/** 등급을 고를 때 보는 딜 — 보도는 늘 딜 하나에 붙어 그려지므로(목록 행 · 캐러셀 · 타임라인 · 날짜별 소식) 호출부가 그 딜을 넘긴다 */
export type CredibilityDeal = Pick<TransferDeal, "fromClub" | "toClub" | "loanClub" | "suitors">;

/**
 * 범위 등급을 고를 구단 — 출발(보유 구단)·행선지·임대 중인 구단. 관심 구단은 **행선지가 없는 루머에서만** 본다(그때는 관심 구단이
 * 곧 행선지 후보다).
 * ⚠ 리그·구단 필터의 `dealClubs`(관심 구단 전부)를 쓰지 않는다 — 고르기가 "가장 높은 쪽"이라, 행선지가 정해진 딜에서도 관심 구단
 *   하나가 등급을 끌어올렸다(로마노가 다루는 딜 24개 중 6개가 관심 구단 하나로 한두 칸 올랐다 — 운영 데이터 모의 실험).
 */
function scopeClubs(deal: CredibilityDeal): TransferClub[] {
  const sides = [deal.fromClub, deal.toClub, deal.loanClub, ...(deal.toClub === null ? deal.suitors : [])];
  return sides.filter((c): c is TransferClub => c !== null);
}

function toCredibility(v: GradeValue | undefined): Credibility | null {
  if (v === "medal") return { kind: "medal" };
  if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5) return { kind: "moon", level: v };
  return null;
}

/** 표의 칸 — 프로토타입 키(`constructor` 등)를 등급으로 읽지 않는다 */
function cell(map: Record<string, GradeValue> | undefined, key: string | null): GradeValue | undefined {
  return map !== undefined && key !== null && Object.hasOwn(map, key) ? map[key] : undefined;
}

/**
 * 등재된 등급 하나를 그 딜에서 푼다. 범위 등급이면 **딜의 구단마다**(`scopeClubs`) `구단 → 그 구단의 리그 → default` 순으로 찾고
 * 그중 가장 높은 것을 쓴다 — 기자가 딜의 어느 한쪽 구단에 정통하면 그 보도를 믿을 만하다고 본다.
 * ⚠ 그래서 "담당 밖에서는 약하다"는 `default`를 낮춰 적는다. 특정 구단 칸을 `default`보다 낮게 적어도 상대 구단 쪽에서
 *   `default`가 살아나면 그 값이 이긴다(그 구단만 걸린 딜에서만 낮아진다).
 * ⚠ 구단이 하나도 없는 딜(선수만 확인된 딜)은 `default`다.
 */
function resolve(entry: GradeEntry | undefined, deal: CredibilityDeal): Credibility | null {
  if (entry === undefined) return null;
  if (typeof entry !== "object") return toCredibility(entry);
  const fallback = toCredibility(entry.default);
  const clubs = scopeClubs(deal);
  if (clubs.length === 0) return fallback;
  return clubs
    .map((club) => toCredibility(cell(entry.clubs, club.code) ?? cell(entry.leagues, club.league)) ?? fallback)
    .reduce((best, c) => (credibilityRank(c) > credibilityRank(best) ? c : best));
}

/**
 * 보도 한 건의 공신력 — 그 보도가 붙은 **딜**(`deal`)의 구단으로 범위 등급을 푼다. 가십 칼럼이 인용한 신문의 보도(`cited`)면
 * **그 신문**, 등재된 기자의 byline이면 그 기자, 아니면 **매체(소스 id)**, 없으면 보도 주체(기자) 표기로 찾는다.
 * ⚠ 매체를 소스 id로 매기는 이유: "BBC"라는 표기를 BBC Sport(🎖️)와 BBC 이적 가십(타블로이드 모음)이 함께 쓴다.
 * ⚠ 인용 귀속을 소스 id보다 먼저 보는 이유: 칼럼 항목의 소스는 BBC Sport 피드일 수 있는데 그 등급(🎖️)은 칼럼의
 *   것이지 칼럼이 옮겨 적은 타블로이드의 것이 아니다. 인용된 신문의 등급은 1~5뿐이다(`reporters.json`).
 * ⚠ 등재되지 않은 출처는 `null` — 모르는 출처에 등급을 지어내지 않는다(표시하지 않는다).
 * ⚠ 배지·정렬·캐러셀·보도 흐름이 모두 이 함수 하나로 고른다 — 같은 보도가 자리마다 다른 등급을 말하지 않게, 딜도 늘 함께 넘긴다.
 */
export function credibilityOf(
  report: Pick<TransferReport, "sourceId" | "attribution" | "attributedTo">,
  deal: CredibilityDeal,
): Credibility | null {
  if (report.attribution === "cited") {
    // 등급이 비어 있으면 표기로 기자 등급을 찾는다(디 마르지오처럼 기자를 인용한 항목)
    return resolve(citedOutletOf(report)?.credibility, deal) ?? resolve(JOURNALISTS[reporterName(report)], deal);
  }
  // 지역지 RSS의 기사라도 등재된 기자(byline)가 썼으면 **그 기자의 등급**이다(football.london의 골드 기사 = 🌕)
  const byline = report.attributedTo === null ? undefined : BYLINES[report.attributedTo];
  const own = byline === undefined ? null : resolve(JOURNALISTS[byline], deal);
  return own ?? resolve(OUTLETS[report.sourceId], deal) ?? resolve(JOURNALISTS[reporterName(report)], deal);
}

/** "최근 3일 소식" 캐러셀에 실을 만큼 믿을 만한가 — 🎖️ 매체 또는 🌕·🌖 기자 */
export function isTopCredibility(c: Credibility | null): boolean {
  return c !== null && (c.kind === "medal" || c.level >= 4);
}

/**
 * 공신력의 **순위 값** — 클수록 믿을 만하다(🎖️ > 🌕 … 🌑 > 등재되지 않은 출처). 정렬(`sortReports`)과 범위 등급의 고르기가 쓴다.
 * 🎖️는 달 5단계 위다 — "오피셜에 육박하는 매체"라 어떤 기자 등급보다 앞에 둔다.
 */
export function credibilityRank(c: Credibility | null): number {
  if (c === null) return 0;
  return c.kind === "medal" ? 6 : c.level;
}

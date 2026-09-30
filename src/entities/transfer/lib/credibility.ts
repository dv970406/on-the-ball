import reporters from "../../../../scripts/lib/transfer/reporters.json";
import type { TransferReport } from "../model/types";
import { BYLINES, citedOutletOf, reporterName } from "./reporter";

/**
 * 출처의 공신력 — 🎖️(오피셜에 육박하는 매체에만), 또는 달 5단계(🌑 1 ~ 🌕 5 — 그 밖의 매체와 기자).
 * 등급의 단일 소스는 `scripts/lib/transfer/reporters.json`의 `credibility`다(보도 주체 표기와 같은 파일).
 */
export type Credibility = { kind: "medal" } | { kind: "moon"; level: 1 | 2 | 3 | 4 | 5 };

const OUTLETS: Record<string, string | number> = reporters.credibility.outlets;
const JOURNALISTS: Record<string, number> = reporters.credibility.journalists;

function toCredibility(v: string | number | undefined): Credibility | null {
  if (v === "medal") return { kind: "medal" };
  if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5) return { kind: "moon", level: v };
  return null;
}

/**
 * 보도 한 건의 공신력. 가십 칼럼이 인용한 신문의 보도(`cited`)면 **그 신문**, 등재된 기자의 byline이면 그 기자,
 * 아니면 **매체(소스 id)**, 없으면 보도 주체(기자) 표기로 찾는다.
 * ⚠ 매체를 소스 id로 매기는 이유: "BBC"라는 표기를 BBC Sport(🎖️)와 BBC 이적 가십(타블로이드 모음)이 함께 쓴다.
 * ⚠ 인용 귀속을 소스 id보다 먼저 보는 이유: 칼럼 항목의 소스는 BBC Sport 피드일 수 있는데 그 등급(🎖️)은 칼럼의
 *   것이지 칼럼이 옮겨 적은 타블로이드의 것이 아니다. 인용된 신문의 등급은 1~5뿐이다(`reporters.json`).
 * ⚠ 등재되지 않은 출처는 `null` — 모르는 출처에 등급을 지어내지 않는다(표시하지 않는다).
 */
export function credibilityOf(report: Pick<TransferReport, "sourceId" | "attribution" | "attributedTo">): Credibility | null {
  if (report.attribution === "cited") {
    // 등급이 비어 있으면 표기로 기자 등급을 찾는다(디 마르지오처럼 기자를 인용한 항목)
    return toCredibility(citedOutletOf(report)?.credibility) ?? toCredibility(JOURNALISTS[reporterName(report)]);
  }
  // 지역지 RSS의 기사라도 등재된 기자(byline)가 썼으면 **그 기자의 등급**이다(football.london의 골드 기사 = 🌕)
  const byline = report.attributedTo === null ? undefined : BYLINES[report.attributedTo];
  const own = byline === undefined ? null : toCredibility(JOURNALISTS[byline]);
  return own ?? toCredibility(OUTLETS[report.sourceId]) ?? toCredibility(JOURNALISTS[reporterName(report)]);
}

/** "최근 3일 소식" 캐러셀에 실을 만큼 믿을 만한가 — 🎖️ 매체 또는 🌕·🌖 기자 */
export function isTopCredibility(c: Credibility | null): boolean {
  return c !== null && (c.kind === "medal" || c.level >= 4);
}

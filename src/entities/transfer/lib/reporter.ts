import reporters from "../../../../scripts/lib/transfer/reporters.json";
import type { TransferReport } from "../model/types";

/**
 * 보도 주체 표기의 **단일 소스는 `scripts/lib/transfer/reporters.json`**이다 — 파이프라인(요약 등)과
 * 이 화면이 같은 파일을 읽는다(창 일정 `windows.json`과 같은 형태: 파이프라인이 TS를 못 읽으므로
 * JSON이 원본이다).
 *
 * ⚠ 우선순위는 bylines → sources → journalists → attributed_to 원문 → source_id다.
 *   byline이 먼저인 이유: 지역지 RSS(소스 = 매체)의 기사라도 등재된 기자가 쓴 것이면 그 기자의 보도다.
 */
const JOURNALISTS: Record<string, string> = reporters.journalists;
const SOURCES: Record<string, string> = reporters.sources;
/** RSS 기사의 기자 이름(byline) → 표기. 등재된 기자면 매체보다 먼저다 */
export const BYLINES: Record<string, string> = reporters.bylines;

/**
 * 보도 주체 — 기자의 한국어 전체 이름("벤 제이콥스") 또는 매체명("BBC"). Google News 소스는 그 기자의 보도를 모은
 * 피드라 보도 주체가 기자다(재인용 매체가 아니다 — JSON 주석).
 */
export function reporterName(report: Pick<TransferReport, "sourceId" | "attributedTo">): string {
  const byline = report.attributedTo === null ? undefined : BYLINES[report.attributedTo];
  return (
    byline ??
    SOURCES[report.sourceId] ??
    (report.attributedTo === null ? undefined : JOURNALISTS[report.attributedTo]) ??
    report.attributedTo ??
    report.sourceId
  );
}

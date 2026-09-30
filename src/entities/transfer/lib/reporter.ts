import reporters from "../../../../scripts/lib/transfer/reporters.json";
import type { TransferReport } from "../model/types";

/**
 * 보도 주체 표기의 **단일 소스는 `scripts/lib/transfer/reporters.json`**이다 — 파이프라인(요약 등)과
 * 이 화면이 같은 파일을 읽는다(창 일정 `windows.json`과 같은 형태: 파이프라인이 TS를 못 읽으므로
 * JSON이 원본이다).
 *
 * ⚠ 우선순위는 (인용 귀속이면 `cited` 표기 → 원문 표기) → bylines → sources → journalists → attributed_to 원문 → source_id다.
 *   byline이 먼저인 이유: 지역지 RSS(소스 = 매체)의 기사라도 등재된 기자가 쓴 것이면 그 기자의 보도다.
 *   인용 귀속이 그보다도 먼저인 이유: 가십 칼럼의 항목은 소스가 BBC Sport 피드여도 **BBC의 보도가 아니다** —
 *   소스 표기로 떨어뜨리면 팀토크의 이적설이 "BBC"로 그려진다(운영에서 실제로 그랬다).
 */
const JOURNALISTS: Record<string, string> = reporters.journalists;
const SOURCES: Record<string, string> = reporters.sources;
/** RSS 기사의 기자 이름(byline) → 표기. 등재된 기자면 매체보다 먼저다 */
export const BYLINES: Record<string, string> = reporters.bylines;

/** 인용된 신문 한 곳의 표기·등급 — 등급이 비면 `credibility.journalists`를 표기로 찾는다(기자를 인용한 항목) */
export interface CitedOutlet {
  ko: string;
  credibility?: number;
}
const CITED: Record<string, CitedOutlet> = reporters.cited;

/**
 * 인용 매체 표기 → `cited` 키. 칼럼이 같은 신문을 "TeamTalk"·"Teamtalk"·"The Sun"·"Sun"으로 달리 적으므로
 * 소문자로 접고 앞의 "the"와 영숫자 아닌 글자를 걷는다. **이 규칙은 여기 하나뿐이다** — JSON 키가 이미
 * 접힌 형태라 파이프라인 쪽에 짝이 없다(`reporters.json`의 주석).
 */
function citedKey(outlet: string): string {
  return outlet
    .toLowerCase()
    .replace(/^the\s+/u, "")
    .replace(/[^a-z0-9]/gu, "");
}

/** 인용 귀속 보도가 인용한 신문의 등재 항목 — 인용 귀속이 아니거나 등재되지 않았으면 `undefined` */
export function citedOutletOf(report: Pick<TransferReport, "attribution" | "attributedTo">): CitedOutlet | undefined {
  if (report.attribution !== "cited" || report.attributedTo === null) return undefined;
  // "Gazzetta dello Sport via Glasgow Times"는 앞 신문의 보도를 뒤 매체가 옮긴 것 — 원 보도 주체는 앞이다
  return CITED[citedKey(report.attributedTo)] ?? CITED[citedKey(report.attributedTo.split(/\s+via\s+/iu)[0])];
}

/**
 * 보도 주체 — 기자의 한국어 전체 이름("벤 제이콥스") 또는 매체명("BBC"). Google News 소스는 그 기자의 보도를 모은
 * 피드라 보도 주체가 기자다(재인용 매체가 아니다 — JSON 주석). 가십 칼럼의 항목(`cited`)은 **칼럼이 인용한 신문**이다 —
 * 등재되지 않은 신문은 칼럼이 적은 표기 그대로("Open Goal podcast").
 */
export function reporterName(report: Pick<TransferReport, "sourceId" | "attribution" | "attributedTo">): string {
  if (report.attribution === "cited" && report.attributedTo !== null) {
    return citedOutletOf(report)?.ko ?? report.attributedTo;
  }
  const byline = report.attributedTo === null ? undefined : BYLINES[report.attributedTo];
  return (
    byline ??
    SOURCES[report.sourceId] ??
    (report.attributedTo === null ? undefined : JOURNALISTS[report.attributedTo]) ??
    report.attributedTo ??
    report.sourceId
  );
}

import type { TransferReport } from "../model/types";
import { credibilityOf, isTopCredibility } from "./credibility";

/** 보도 흐름의 기간 — 화면 안 토글이라 URL에 싣지 않는다(보도 정렬과 같은 성격) */
export type ReportFlowRange = "1w" | "3w" | "all";

const DAY_MS = 86_400_000;
/**
 * 날짜 경계는 **한국 시각 고정**이다(UTC+9 — 서머타임이 없다).
 * ⚠ `Date`의 지역 시각 메서드를 쓰지 않는다 — 서버(UTC)와 브라우저(기기 시간대)가 다른 날짜로 묶어 하이드레이션이 갈린다.
 */
const KST_OFFSET_MS = 9 * 3_600_000;
/**
 * "전체"가 그리는 날 수의 상한 — 넘으면 막대가 1px보다 가늘어진다. 넘을 때는 **보도가 있는 쪽**을 그린다(아래 `reportFlow`).
 */
const MAX_DAYS = 180;
const RANGE_DAYS: Record<Exclude<ReportFlowRange, "all">, number> = { "1w": 7, "3w": 21 };

export const REPORT_FLOW_RANGE_LABEL: Record<ReportFlowRange, string> = {
  "1w": "1주",
  "3w": "3주",
  all: "전체",
};

export interface ReportFlowDay {
  /** 한국 시각 날짜의 일련번호(1970-01-01부터) */
  day: number;
  /** `10/2` */
  label: string;
  /** 믿을 만한 출처(🎖️·🌕·🌖 — `isTopCredibility`)의 보도 수 */
  top: number;
  /** 그 밖의 출처(등재되지 않은 출처 포함)의 보도 수 */
  other: number;
}

export interface ReportFlow {
  days: ReportFlowDay[];
  total: number;
  top: number;
  /** 보도가 가장 많았던 날 — 보도가 없으면 `null` */
  peak: ReportFlowDay | null;
}

const kstDay = (ms: number) => Math.floor((ms + KST_OFFSET_MS) / DAY_MS);

// 일련번호 × 하루를 UTC로 읽으면 곧 한국 시각의 날짜다(위에서 오프셋을 더해 셌다)
const monthDay = (day: number) => {
  const date = new Date(day * DAY_MS);
  return { month: date.getUTCMonth() + 1, date: date.getUTCDate() };
};

function dayLabel(day: number): string {
  const { month, date } = monthDay(day);
  return `${month}/${date}`;
}

/** 읽어 주는 날짜 — `10/2`는 스크린리더가 "10 슬래시 2"로 읽는다 */
function spokenDay(day: number): string {
  const { month, date } = monthDay(day);
  return `${month}월 ${date}일`;
}

/**
 * 보도를 **하루 단위**로 세고 출처의 공신력으로 둘로 가른다 — 보도 흐름 차트의 데이터.
 *
 * ⚠ **보도의 단계·이적료는 싣지 않는다.** 공개된 `transfer_news.stage`·`fee_amount`는 규칙 판정이고 딜 단계는 비공개
 *   LLM 판정이 정한다 — 보도별 단계로 흐름선을 그리면 뱃지와 다른 말을 한다. 그래서 날짜(`publishedAt`)와 출처 등급
 *   (배지와 같은 `credibilityOf`)만 쓴다.
 * - 기간의 끝은 기준 시각의 날이다(`nowMs` — 호출부가 `serverNowMs ?? useNowMs()`로 준다). 아직 모르면 가장 최근 보도의 날.
 * - "전체"의 시작은 가장 이른 보도의 날이되 최소 1주는 그린다(점 하나짜리 차트는 흐름이 아니다).
 * - ⚠ "전체"가 상한(`MAX_DAYS`)을 넘으면 **끝을 가장 최근 보도의 날로 당긴다** — 기준 시각에 묶어 두면 반년 넘게 조용한 딜은
 *   그린 구간에 보도가 하나도 없어 막대가 전부 0으로 빈다. 1주·3주는 "최근"이라는 뜻이라 끝을 옮기지 않는다.
 * ⚠ 시각은 `nowMs` 인자와 보도의 `publishedAt`뿐이다 — 서버와 클라이언트가 같은 날짜로 묶는다.
 */
export function reportFlow(
  reports: TransferReport[],
  range: ReportFlowRange,
  nowMs: number | null,
): ReportFlow {
  const stamped = reports.map((r) => ({ r, day: kstDay(Date.parse(r.publishedAt)) }));
  const latest = stamped.reduce((max, s) => Math.max(max, s.day), -Infinity);
  const earliest = stamped.reduce((min, s) => Math.min(min, s.day), Infinity);
  const today = nowMs !== null ? kstDay(nowMs) : Number.isFinite(latest) ? latest : 0;
  const end =
    range === "all" && Number.isFinite(earliest) && today - earliest + 1 > MAX_DAYS && latest < today
      ? latest
      : today;
  const span =
    range === "all"
      ? Math.min(MAX_DAYS, Math.max(RANGE_DAYS["1w"], Number.isFinite(earliest) ? end - earliest + 1 : 0))
      : RANGE_DAYS[range];
  const start = end - span + 1;

  const days: ReportFlowDay[] = Array.from({ length: span }, (_, i) => ({
    day: start + i,
    label: dayLabel(start + i),
    top: 0,
    other: 0,
  }));
  for (const { r, day } of stamped) {
    const slot = days[day - start];
    if (!slot) continue;
    if (isTopCredibility(credibilityOf(r))) slot.top += 1;
    else slot.other += 1;
  }

  let total = 0;
  let top = 0;
  let peak: ReportFlowDay | null = null;
  for (const d of days) {
    total += d.top + d.other;
    top += d.top;
    if (d.top + d.other > 0 && (peak === null || d.top + d.other > peak.top + peak.other)) peak = d;
  }
  return { days, total, top, peak };
}

/**
 * 차트 전체를 읽어 주는 한 문장 — 기간마다 자연스러운 말로("최근 3주 동안 보도 12건", "6월 2일부터 9월 30일까지 보도 39건").
 * "전체"를 "전체 동안"으로 옮기지 않는다 — 기간 이름이 아니라 실제로 그린 날짜를 말한다.
 */
export function reportFlowSummary(flow: ReportFlow, range: ReportFlowRange): string {
  const first = flow.days[0];
  const last = flow.days.at(-1);
  const period =
    range === "all"
      ? first && last
        ? `${spokenDay(first.day)}부터 ${spokenDay(last.day)}까지`
        : "전체 기간"
      : `최근 ${REPORT_FLOW_RANGE_LABEL[range]} 동안`;
  if (flow.total === 0) return `${period} 보도가 없어요`;
  const peak = flow.peak ? `. 가장 많은 날은 ${spokenDay(flow.peak.day)}, ${flow.peak.top + flow.peak.other}건` : "";
  return `${period} 보도 ${flow.total}건, 그중 믿을 만한 출처 ${flow.top}건${peak}`;
}

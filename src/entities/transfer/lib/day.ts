import type { TransferDayEntry } from "../model/types";
import { type TransferGroup, groupDeals } from "./sort";

/**
 * 하루의 소식을 보드의 구간(오피셜 → 합의 완료 → 진행 중 → 루머 → 결렬·부인)으로 가른다 — 빈 구간은 뺀다.
 * 구간은 딜의 **지금** 단계다(그 날의 단계가 아니다 — 보도별 단계는 공개 컬럼이 규칙 판정이라 뱃지와 갈린다, `report-flow.ts` 주석).
 * 구간 안은 들어온 순서 그대로다 — `buildTransferDay`가 그 날 가장 늦은 보도순으로 만든다.
 */
export function groupDayEntries(entries: readonly TransferDayEntry[]): TransferGroup<TransferDayEntry>[] {
  return groupDeals(entries.map((entry) => ({ stage: entry.deal.stage, entry }))).map((group) => ({
    key: group.key,
    label: group.label,
    deals: group.deals.map((d) => d.entry),
  }));
}

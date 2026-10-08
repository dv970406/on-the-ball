import {
  splitHotRumors,
  splitProgress,
  type TransferDealListItem,
  type TransferSort,
} from "@/entities/transfer";
import type { BoardGroup } from "../model/use-transfer-board";

/** 진행 중 구간의 소구간 하나(합의 임박·협상 중) — `splitProgress`의 반환 원소 */
export type ProgressSubgroup = ReturnType<typeof splitProgress<TransferDealListItem>>[number];

/** 구간 하나가 화면에 놓이는 모양 — `BoardSections`가 이대로 그리고, 오른쪽 판의 기본 선택이 `ordered`를 본다 */
export interface GroupLayout {
  group: BoardGroup;
  /** 화면 순서 — 진행 중은 소구간 순(합의 임박 → 협상 중), 루머는 열기 상위 → 나머지, 그 밖은 정렬된 순서 그대로 */
  ordered: TransferDealListItem[];
  /** 진행 중 구간의 소구간 — **둘 이상일 때만**(하나뿐이면 뱃지가 이미 같은 말을 한다). 그 밖은 `null` */
  subgroups: ProgressSubgroup[] | null;
  /** 루머 구간에서 처음부터 펼쳐 두는 건수(열기 상위) — 그 밖의 구간은 `null`(호출부의 페이지 단위 접기) */
  hotCount: number | null;
}

/**
 * 구간 하나의 **화면 배치** — 소구간 분리(`splitProgress`)와 루머 열기 순(`splitHotRumors`)을 **여기 한 곳에서** 판정한다.
 * 그리는 쪽(`BoardSections`)과 기본 선택("화면 순서상 첫 딜", `useDealSelection`)이 같은 결과를 받는다 — 각자 판정하면
 * 배치를 바꿀 때 한쪽만 고쳐져 판이 화면 맨 위가 아닌 딜을 연다.
 */
export function groupLayout(group: BoardGroup, nowMs: number | null, sort: TransferSort): GroupLayout {
  if (group.key === "prog") {
    const subgroups = splitProgress(group.deals);
    if (subgroups.length > 1) {
      return { group, ordered: subgroups.flatMap((sub) => sub.deals), subgroups, hotCount: null };
    }
  }
  if (group.key === "rumor") {
    const split = splitHotRumors(group.deals, nowMs, sort);
    return { group, ordered: [...split.hot, ...split.rest], subgroups: null, hotCount: split.hot.length };
  }
  return { group, ordered: group.deals, subgroups: null, hotCount: null };
}

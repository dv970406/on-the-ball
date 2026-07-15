import { readTmiOptionMeta, type PollListItem, type PollOption } from "@/entities/poll";

/** TMI 판정 면 — 옵션 meta.verdict 값과 동일 */
export type TmiSide = "true" | "false";

/** side에 해당하는 옵션 (meta.verdict 기준) */
export function tmiSideOption(poll: PollListItem, side: TmiSide): PollOption | null {
  return poll.options.find((o) => readTmiOptionMeta(o).verdict === side) ?? null;
}

/** optionId → 판정 면 */
export function tmiSideOfOption(poll: PollListItem, optionId: string): TmiSide | null {
  const option = poll.options.find((o) => o.id === optionId);
  if (!option) return null;
  return readTmiOptionMeta(option).verdict;
}

/** 해당 면이 다수 의견인지 (ratio >= 0.5 기준) */
export function isMajoritySide(poll: PollListItem, side: TmiSide): boolean {
  return (tmiSideOption(poll, side)?.ratio ?? 0) >= 0.5;
}

/** 카드의 "진실" 비율을 정수 %로 (거짓 = 100 - 진실) */
export function truePctOf(poll: PollListItem): number {
  return Math.round((tmiSideOption(poll, "true")?.ratio ?? 0) * 100);
}

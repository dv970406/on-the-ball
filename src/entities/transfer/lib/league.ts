import type { TransferDeal, TransferLeague, TransferSort } from "../model/types";
import { TRANSFER_LEAGUES } from "../model/types";

/**
 * URL `?league=` → 리그. 모르는 값·없음은 `null`(= 전체 리그).
 * ⚠ **모르는 값에 404를 내지 않는다** — 정렬과 같은 "파라미터 오염이 404를 양산하면 안 된다"
 *   쪽이다(`nextjs.md`). 리그는 path가 아니라 query라 색인 착지점이 아니다.
 * ⚠ 판정을 호출부(서버 page·시트)가 각자 짜지 않는다 — `parsePostSort`와 같은 이유.
 */
export function parseTransferLeague(value: string | undefined): TransferLeague | null {
  if (!value) return null;
  return (TRANSFER_LEAGUES as readonly string[]).includes(value) ? (value as TransferLeague) : null;
}

const TRANSFER_SORTS = ["latest", "fee"] as const satisfies readonly TransferSort[];

/** URL `?sort=` → 정렬. 모르는 값은 기본값(`latest`)으로 폴백한다 */
export function parseTransferSort(value: string | undefined): TransferSort {
  return (TRANSFER_SORTS as readonly string[]).includes(value ?? "")
    ? (value as TransferSort)
    : "latest";
}

/**
 * 리그 필터 — **출발 또는 도착** 구단의 리그가 일치하면 포함(handoff §6). `null`은 전체.
 * ⚠ 구단이 `null`(미확인)이거나 5대 리그 밖(`league` null)이면 그 쪽으로는 일치하지 않는다.
 */
export function dealInLeague(
  deal: Pick<TransferDeal, "fromClub" | "toClub">,
  league: TransferLeague | null,
): boolean {
  if (league === null) return true;
  return deal.fromClub?.league === league || deal.toClub?.league === league;
}

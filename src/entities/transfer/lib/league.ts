import type { TransferDeal, TransferLeague, TransferSort } from "../model/types";
import { TRANSFER_LEAGUES } from "../model/types";

/**
 * URL `?league=` → 리그. 모르는 값·없음은 `null`(= 전체 리그).
 * ⚠ **모르는 값에 404를 내지 않는다** — 정렬과 같은 "파라미터 오염이 404를 양산하면 안 된다"
 *   쪽이다(`nextjs.md`). 리그는 path가 아니라 query라 색인 착지점이 아니다.
 * ⚠ 판정을 호출부(보드 뷰의 주소 해석)가 각자 짜지 않는다 — 링크가 만드는 값과 해석이 갈리면 조용히 어긋난다.
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
 * 리그 필터 — **출발 또는 도착** 구단의 리그가 일치하면 포함. `null`은 전체.
 * ⚠ 구단이 `null`(미확인)이거나 5대 리그 밖(`league` null)이면 그 쪽으로는 일치하지 않는다.
 */
export function dealInLeague(
  deal: Pick<TransferDeal, "fromClub" | "toClub">,
  league: TransferLeague | null,
): boolean {
  if (league === null) return true;
  return deal.fromClub?.league === league || deal.toClub?.league === league;
}

/** 구단 코드의 형식 — `transfer_club.code`(엠블럼 파일명과 같은 slug) */
const CLUB_CODE = /^[a-z0-9-]{1,60}$/u;

/**
 * URL `?club=` → 구단 코드. 형식이 아니면 `null`(= 전체). 실제로 보드에 있는 구단인지는 뷰가 딜 목록으로 대조한다 —
 * 없는 코드는 빈 보드가 아니라 전체로 폴백한다(공유 링크의 구단이 창을 지나 사라졌을 때).
 */
export function parseTransferClub(value: string | undefined): string | null {
  return value !== undefined && CLUB_CODE.test(value) ? value : null;
}

/** 구단 필터 — 출발·행선지·관심 구단(`suitorCodes`) 어느 자리에든 그 구단이 있으면 포함. `null`은 전체 */
export function dealHasClub(
  deal: Pick<TransferDeal, "fromClub" | "toClub" | "suitors">,
  club: string | null,
): boolean {
  if (club === null) return true;
  return deal.fromClub?.code === club || deal.toClub?.code === club || deal.suitors.some((c) => c.code === club);
}

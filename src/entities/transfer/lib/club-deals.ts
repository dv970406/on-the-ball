import type { TransferDeal } from "../model/types";
import { groupDeals, sortDeals } from "./sort";
import { isDeadStage } from "./stage";

/** 구단 화면에서 딜이 놓이는 자리 — 그 구단이 데려오려는 선수 · 내보내는 선수 · 지금 임대로 데리고 있는 선수 */
export type ClubDealSide = "in" | "out" | "loan";

/** 구단 화면의 구역 순서 — 팬이 먼저 찾는 것(누가 오는가)이 앞이다 */
export const CLUB_DEAL_SIDES = ["in", "out", "loan"] as const satisfies readonly ClubDealSide[];
// 구역을 더하면 순서 배열에서 빠뜨린 값이 컴파일 에러가 된다
const _SIDES_EXHAUSTIVE: Exclude<ClubDealSide, (typeof CLUB_DEAL_SIDES)[number]> extends never ? true : never = true;

export const CLUB_DEAL_SIDE_LABEL: Record<ClubDealSide, string> = {
  in: "영입",
  out: "방출",
  loan: "임대로 뛰는 선수",
};

type ClubDealFields = Pick<TransferDeal, "fromClub" | "toClub" | "suitors" | "loanClub">;

/** 구단이 걸리는 자리 — 코드만 있으면 판정할 수 있다(사이트맵은 구단 행 없이 코드만 받는다) */
interface ClubRef {
  code: string;
}
interface ClubSlots {
  fromClub: ClubRef | null;
  toClub: ClubRef | null;
  suitors: readonly ClubRef[];
  loanClub: ClubRef | null;
}

/**
 * 그 구단에게 이 딜이 어느 쪽인가 — 사이트맵의 구단 lastModified도 이 판정으로 센다(화면과 같은 딜을 본다). — 출발이면 방출, 행선지·관심 구단이면 영입, 지금 임대로 뛰는 구단이면 임대 선수. 걸리지 않으면 `null`.
 * ⚠ 걸리는 자리는 보드의 구단 필터(`dealHasClub`)와 **같다** — 구단 화면에 있는 딜과 보드에서 그 구단을 고른 목록이 갈리지 않는다.
 * ⚠ 출발을 먼저 본다 — 조기 복귀는 출발이 임대 구단이라(`api-and-db.md` 임대 절) 그 구단에게 내보내는 일이고, 보유 구단에게는
 *   행선지라 영입(복귀)이다. 임대 구단이 행선지인 딜(완전 영입 전환)은 영입이다(행선지를 임대 자리보다 먼저 본다).
 */
export function clubDealSide(deal: ClubSlots, code: string): ClubDealSide | null {
  if (deal.fromClub?.code === code) return "out";
  if (deal.toClub?.code === code || deal.suitors.some((c) => c.code === code)) return "in";
  if (deal.loanClub?.code === code) return "loan";
  return null;
}

export interface ClubDealGroup<T> {
  side: ClubDealSide;
  label: string;
  deals: T[];
}

/**
 * 구단 하나의 딜을 영입 · 방출 · 임대 선수로 가른다 — **빈 구역은 뺀다.** 구역 안은 보드의 구간 순서(오피셜 → 합의 완료 →
 * 진행 중 → 루머)이고, 같은 구간 안은 최신 보도순이다(`sortDeals` → `groupDeals`를 그대로 쓴다 — 보드와 같은 순서).
 * ⚠ 결렬·부인 딜은 싣지 않는다 — 부인된 이적설이 "영입" 아래 서면 그 구단이 데려오는 선수로 읽힌다. 구단 화면의 설명(건수·대표 선수)도
 *   이 결과로 만들어 함께 빠진다. 죽은 딜은 보드의 "결렬·부인" 구간(구단 필터)이 갖는다.
 * ⚠ 원본 배열을 바꾸지 않는다 — 쿼리 캐시의 배열이 그대로 들어온다.
 */
export function splitClubDeals<T extends ClubDealFields & Pick<TransferDeal, "stage" | "latestReportedAt" | "feeAmount">>(
  deals: readonly T[],
  code: string,
): ClubDealGroup<T>[] {
  const buckets = new Map<ClubDealSide, T[]>(CLUB_DEAL_SIDES.map((side) => [side, []]));
  for (const deal of deals) {
    const side = isDeadStage(deal.stage) ? null : clubDealSide(deal, code);
    if (side) buckets.get(side)?.push(deal);
  }
  return CLUB_DEAL_SIDES.flatMap((side) => {
    const list = buckets.get(side) ?? [];
    if (list.length === 0) return [];
    return [{ side, label: CLUB_DEAL_SIDE_LABEL[side], deals: groupDeals(sortDeals(list, "latest")).flatMap((g) => g.deals) }];
  });
}

/**
 * 딜에 걸린 **5대 리그 구단**(구단 화면이 있는 구단) — 출발 → 행선지 → 관심 구단(유력한 순) → 지금 임대로 뛰는 구단, 겹치면 한 번.
 * 딜 상세가 구단 화면으로 잇는 링크의 목록이다. 5대 리그 밖 구단은 구단 화면이 없다(404) → 뺀다.
 */
export function dealLeagueClubs(deal: ClubDealFields): NonNullable<TransferDeal["fromClub"]>[] {
  const seen = new Map<string, NonNullable<TransferDeal["fromClub"]>>();
  for (const club of [deal.fromClub, deal.toClub, ...deal.suitors, deal.loanClub]) {
    if (club?.league && !seen.has(club.code)) seen.set(club.code, club);
  }
  return [...seen.values()];
}

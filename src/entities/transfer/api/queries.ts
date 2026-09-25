"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type {
  TransferDeal,
  TransferDealListItem,
  TransferReport,
} from "../model/types";
import { transferKeys } from "./keys";
import { buildDealListQuery, buildDealQuery, buildReportsQuery } from "./list-query";
import { buildDeal, buildDealListItem, buildReport } from "./mappers";

/**
 * 보드의 딜 목록 — 범위 시작 이후 전부(≤`TRANSFER_DEAL_LIMIT`). 리그·정렬은 뷰가 계산한다.
 *
 * ⚠ **세션이 확정되기 전에는 부르지 않는다**(`enabled`). 키가 userId로 스코프돼 있어서,
 *   복원 중에 `undefined`로 한 번 조회하면 세션이 선 뒤 키가 바뀌며 목록이 통째로
 *   다시 마운트된다. **단 프리페치가 있으면 열어 둔다** — 서버가 준 userId로 이미 키가
 *   맞춰져 있는데 게이트를 닫아 두면 서버가 그린 목록을 첫 프레임에 스켈레톤이 덮는다
 *   (`useMatchListQuery`와 같은 규약이라 호출부가 그 판정을 갖는다).
 * ⚠ `initialData`의 **키 `userId`·`scopeStartIso`도 서버가 준 값이어야 한다.**
 */
export function useTransferDealListQuery(
  userId: string | undefined,
  scopeStartIso: string,
  enabled = true,
  initialData?: TransferDealListItem[],
) {
  return useQuery<TransferDealListItem[], Error>({
    initialData,
    queryKey: transferKeys.list(userId, scopeStartIso),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      // ⚠ 조립은 `buildDealListQuery`가 단독으로 소유한다 — SSR 페이지가 같은 함수를 부른다
      const { data, error } = await buildDealListQuery(supabase, scopeStartIso);
      if (error) {
        console.error("[transfer] 딜 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildDealListItem);
    },
    enabled,
  });
}

/**
 * 딜 하나 — 없으면 `null`.
 *
 * ⚠ 존재 판정은 서버(`app/transfers/[id]/page.tsx`)가 이미 하고 404를 낸다. 여기서 `null`이
 *   되는 것은 그 사이에 지워졌을 때뿐이라, 화면은 그 경우만 안내하면 된다.
 * ⚠ `initialData`의 **키 `userId`도 서버가 준 값이어야 한다** — 세션 복원 전 `undefined`로
 *   찾으면 캐시에 닿지 못해 화면이 스켈레톤으로 되돌아간다(호출부가 그 값을 넘긴다).
 */
export function useTransferDealQuery(
  dealId: number,
  userId: string | undefined,
  enabled = true,
  initialData?: TransferDeal | null,
) {
  return useQuery<TransferDeal | null, Error>({
    initialData,
    queryKey: transferKeys.detail(dealId, userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await buildDealQuery(supabase, dealId);
      if (error) {
        console.error("[transfer] 딜 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildDeal(data) : null;
    },
    enabled: enabled && Number.isSafeInteger(dealId) && dealId > 0,
  });
}

/**
 * 상세의 보도 타임라인 — 최신순 전부.
 * ⚠ "나"에 종속되지 않아 키에 유저가 없다 — `initialData`가 있으면 세션 복원을 기다릴 이유도 없다.
 */
export function useTransferReportsQuery(
  dealId: number,
  enabled = true,
  initialData?: TransferReport[],
) {
  return useQuery<TransferReport[], Error>({
    initialData,
    queryKey: transferKeys.reports(dealId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await buildReportsQuery(supabase, dealId);
      if (error) {
        console.error("[transfer] 보도 타임라인 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildReport);
    },
    enabled: enabled && Number.isSafeInteger(dealId) && dealId > 0,
  });
}

"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type {
  TransferClub,
  TransferDeal,
  TransferDealListItem,
  TransferReport,
} from "../model/types";
import { transferKeys } from "./keys";
import {
  buildClubListQuery,
  buildDealListQuery,
  buildDealQuery,
  buildFollowedClubsQuery,
  buildReportsQuery,
} from "./list-query";
import {
  buildClubList,
  buildDeal,
  buildDealListItem,
  buildFollowedClubs,
  buildReport,
} from "./mappers";

/**
 * 서버 프리페치의 신선도 — 세 조회가 같은 뜻으로 받는다.
 *
 * ⚠ **`initialDataUpdatedAt`을 빼지 않는다.** 넣지 않으면 initialData가 **지금 받은 것**으로 취급되는데,
 *   뒤로가기는 Next가 보관한 옛 서버 페이로드를 되살린다 — 그 옛 데이터가 신선한 것으로 캐시에 앉아
 *   staleTime 동안 다시 받지 않았다(`useCommentListQuery`와 같은 사고 — `nextjs.md`의 서버 프리페치 절).
 *   호출부는 서버 시각을 기기 시계로 옮겨 넣는다(`serverToClientTime`).
 */
interface PrefetchFreshness {
  initialDataUpdatedAt?: number | (() => number | undefined);
}

interface UseTransferDealListQueryArgs extends PrefetchFreshness {
  userId: string | undefined;
  scopeStartIso: string;
  enabled?: boolean;
  /** 서버 프리페치 — ⚠ 서버가 **같은 사용자**로 그린 것만 넣는다(`useTransferBoard`) */
  initialData?: TransferDealListItem[];
  /**
   * 캐시에 넣지 않고 조회가 끝날 때까지만 보여 줄 목록 — 서버가 **다른 사용자**로 그린 목록을 관심 표시를
   * 지워 넘긴다(`withoutWatches`). 없으면 키가 바뀌는 동안 이전 키의 목록을 그대로 보인다(`keepPreviousData`).
   */
  placeholderData?: TransferDealListItem[];
}

/**
 * 보드의 딜 목록 — 범위 시작 이후 전부(≤`TRANSFER_DEAL_LIMIT`). 리그·정렬은 뷰가 계산한다.
 *
 * ⚠ **세션이 확정되기 전에는 부르지 않는다**(`enabled`). 키가 userId로 스코프돼 있어서,
 *   복원 중에 `undefined`로 한 번 조회하면 세션이 선 뒤 키가 바뀌며 목록이 통째로
 *   다시 마운트된다. **단 프리페치가 있으면 열어 둔다** — 서버가 준 userId로 이미 키가
 *   맞춰져 있는데 게이트를 닫아 두면 서버가 그린 목록을 첫 프레임에 스켈레톤이 덮는다
 *   (호출부가 그 판정을 갖는다).
 * ⚠ `initialData`의 **키 `userId`·`scopeStartIso`도 서버가 준 값이어야 한다.**
 */
export function useTransferDealListQuery({
  userId,
  scopeStartIso,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
  placeholderData,
}: UseTransferDealListQueryArgs) {
  return useQuery<TransferDealListItem[], Error>({
    initialData,
    initialDataUpdatedAt,
    queryKey: transferKeys.list(userId, scopeStartIso),
    placeholderData: placeholderData ?? keepPreviousData,
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

interface UseTransferDealQueryArgs extends PrefetchFreshness {
  dealId: number;
  userId: string | undefined;
  enabled?: boolean;
  initialData?: TransferDeal | null;
}

/**
 * 딜 하나 — 없으면 `null`.
 *
 * ⚠ 존재 판정은 서버(`app/transfers/[id]/page.tsx`)가 이미 하고 404를 낸다. 여기서 `null`이
 *   되는 것은 그 사이에 지워졌을 때뿐이라, 화면은 그 경우만 안내하면 된다.
 * ⚠ `initialData`의 **키 `userId`도 서버가 준 값이어야 한다** — 세션 복원 전 `undefined`로
 *   찾으면 캐시에 닿지 못해 화면이 스켈레톤으로 되돌아간다(호출부가 그 값을 넘긴다).
 */
export function useTransferDealQuery({
  dealId,
  userId,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
}: UseTransferDealQueryArgs) {
  return useQuery<TransferDeal | null, Error>({
    initialData,
    initialDataUpdatedAt,
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

interface UseTransferReportsQueryArgs extends PrefetchFreshness {
  dealId: number;
  enabled?: boolean;
  initialData?: TransferReport[];
}

/**
 * 상세의 보도 타임라인 — 최신순 전부.
 * ⚠ "나"에 종속되지 않아 키에 유저가 없다 — `initialData`가 있으면 세션 복원을 기다릴 이유도 없다.
 */
export function useTransferReportsQuery({
  dealId,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
}: UseTransferReportsQueryArgs) {
  return useQuery<TransferReport[], Error>({
    initialData,
    initialDataUpdatedAt,
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

/** 구단 표는 파생이 표시 프리셋에서 채우는 운영 데이터다 — 한 세션 안에서 바뀔 일이 없어 길게 잡는다 */
const CLUB_LIST_STALE_MS = 60 * 60_000;

/**
 * 5대 리그 구단 전부(정식명순) — 응원 구단을 고르는 화면이 연다.
 * ⚠ "나"에 종속되지 않는다 — 누가 불러도 같은 목록이라 키에 유저가 없다.
 */
export function useTransferClubListQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<TransferClub[], Error>({
    queryKey: transferKeys.clubs(),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await buildClubListQuery(supabase);
      if (error) {
        console.error("[transfer] 구단 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return buildClubList(data ?? []);
    },
    enabled,
    staleTime: CLUB_LIST_STALE_MS,
  });
}

interface UseFollowedClubsQueryArgs extends PrefetchFreshness {
  /** 로그인 사용자 — 없으면 조회하지 않는다(비로그인에게는 응원 구단이 없다) */
  userId: string | undefined;
  enabled?: boolean;
  /** 서버 프리페치 — ⚠ 서버가 **같은 사용자**로 읽은 것만 넣는다(키가 userId로 스코프된다) */
  initialData?: TransferClub[];
}

/**
 * 내 응원 구단(정식명순).
 *
 * ⚠ `userId`를 인자로 받는다 — entities끼리는 import할 수 없어 세션을 아는 상위 레이어가 넘긴다(`useProfileQuery`와 같다).
 * ⚠ 보드는 이 값으로 구단 칩의 순서를 정한다 → 클라이언트에서만 받으면 하이드레이션 뒤에 칩이 자리를 바꾼다.
 *   그래서 보드 page가 쿠키 세션으로 함께 읽어 `initialData`로 내린다(`nextjs.md` "사용자별 상태도 끝까지 서버가 그린다").
 */
export function useFollowedClubsQuery({
  userId,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
}: UseFollowedClubsQueryArgs) {
  return useQuery<TransferClub[], Error>({
    initialData,
    initialDataUpdatedAt,
    queryKey: transferKeys.follows(userId ?? ""),
    queryFn: async () => {
      // ⚠ `!`를 쓰지 않는다 — 아래 `enabled`와 떨어져 있어 한쪽만 고치면 조용히 깨진다
      if (!userId) throw new Error("로그인이 필요해요.");
      const supabase = requireBrowserSupabase();
      const { data, error } = await buildFollowedClubsQuery(supabase);
      if (error) {
        console.error("[transfer] 응원 구단 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return buildFollowedClubs(data ?? []);
    },
    enabled: enabled && !!userId,
  });
}

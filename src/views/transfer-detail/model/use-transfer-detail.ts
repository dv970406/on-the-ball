"use client";

import {
  type TransferDeal,
  type TransferReport,
  useTransferDealQuery,
  useTransferReportsQuery,
} from "@/entities/transfer";
import { useSessionStore } from "@/entities/session";

interface UseTransferDetailArgs {
  dealId: number;
  /**
   * 서버가 미리 조회한 딜.
   * ⚠ `null`과 `undefined`가 다른 뜻이다 — `null`은 "없는 딜"(서버가 이미 404를 냈으므로 실제로는
   *   오지 않는다), `undefined`는 "프리페치 안 함"(클라이언트가 조회한다).
   */
  initialDeal?: TransferDeal | null;
  /** 서버가 미리 조회한 보도 타임라인 — `undefined`면 클라이언트가 조회한다 */
  initialReports?: TransferReport[];
  initialUserId?: string;
}

/**
 * 이적 상세의 **조회·대기 판정**을 소유한다.
 *
 * 세션 상태와 서버가 내려준 prop이 서로를 조건으로 삼고, 어긋나면 서버가 그린 HTML이 스켈레톤에
 * 덮인다 — 그 판정을 뷰에 두면 다른 상세와 갈린다.
 */
export function useTransferDetail({
  dealId,
  initialDeal,
  initialReports,
  initialUserId,
}: UseTransferDetailArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 **서버가 알려준 사용자**를 키로 쓴다 — `transferKeys.detail`이 userId로
  // 스코프돼 있어(관심 임베딩이 "내 행만") 키가 갈리면 서버가 채운 캐시에 닿지 못한다.
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  const dealQuery = useTransferDealQuery(
    dealId,
    userId,
    // ⚠ 프리페치가 있으면 복원을 기다리지 않는다 — 기다리면 서버가 그린 HTML을 스켈레톤이 덮는다
    initialDeal !== undefined || sessionStatus !== "loading",
    initialDeal,
  );

  /**
   * 보도 타임라인은 "나"에 종속되지 않아(키에 유저가 없다) 세션 복원을 기다릴 이유가 없다 —
   * 항상 켜 둔다. 프리페치가 있으면 `initialData`가 곧바로 캐시에 앉는다.
   */
  const reportsQuery = useTransferReportsQuery(dealId, true, initialReports);

  return {
    deal: dealQuery.data,
    /**
     * ⚠ **`undefined`와 `[]`를 접지 않는다.** `undefined`는 "아직 조회하지 않았다 / 실패했다",
     *   `[]`는 "받았는데 보도가 없다"(재파생이 `deal_id`를 되돌린 창)로 뜻이 다르다.
     */
    reports: reportsQuery.data,
    /**
     * 타임라인 조회 실패 — 곁다리라 본문(선수·경로·이적료)을 가리지 않고 **그 자리에서만** 알린다
     * (`nextjs.md`의 "곁다리 조회가 실패해도 본문은 그대로 내보낸다").
     */
    reportsError: reportsQuery.error,
    isLoading:
      dealQuery.isPending || (initialDeal === undefined && sessionStatus === "loading"),
    error: dealQuery.error,
    // 재시도는 둘 다 다시 받는다 — 딜이 실패한 상황이면 같은 원인으로 타임라인도 실패했을 공산이 크다
    refetch: () => Promise.all([dealQuery.refetch(), reportsQuery.refetch()]),
  };
}

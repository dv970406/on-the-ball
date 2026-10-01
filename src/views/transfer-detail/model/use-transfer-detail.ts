"use client";

import { useMemo } from "react";
import { serverToClientTime } from "@/shared/lib";
import {
  type TransferDeal,
  type TransferReport,
  useTransferDealQuery,
  useTransferReportsQuery,
} from "@/entities/transfer";
import { type CommentList, useCommentListQuery, withoutMyVotes } from "@/entities/comment";
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
  /** 서버가 미리 조회한 댓글 — `undefined`면 클라이언트가 조회한다 */
  initialComments?: CommentList;
  /** 서버가 그 데이터를 읽은 시각 — 뒤로가기가 되살린 옛 페이로드를 stale로 보게 한다(딜·타임라인·댓글 공통) */
  serverNowMs?: number;
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
  initialComments,
  initialUserId,
  serverNowMs,
}: UseTransferDetailArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 **서버가 알려준 사용자**를 키로 쓴다 — `transferKeys.detail`이 userId로
  // 스코프돼 있어(관심 임베딩이 "내 행만") 키가 갈리면 서버가 채운 캐시에 닿지 못한다.
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  // 서버 시각을 기기 시계로 옮겨 넣는다 — 기기 시계와 빼서 신선도를 재기 때문이다(`serverToClientTime`).
  // ⚠ 세 조회가 같은 값을 쓴다 — 뒤로가기가 되살린 옛 서버 페이로드를 신선한 것으로 앉히지 않는다
  const initialDataUpdatedAt = () =>
    serverNowMs === undefined ? undefined : serverToClientTime(serverNowMs);

  /**
   * ⚠ 딜 단건은 `ownsPrefetch`로 가르지 않는다 — 개인화 값이 `isWatched` 하나뿐이고 그 값을 그리는
   *   `WatchToggle`이 세션으로 3분기한다(`nextjs.md` 서버 프리페치 절의 예외).
   */
  const dealQuery = useTransferDealQuery({
    dealId,
    userId,
    // ⚠ 프리페치가 있으면 복원을 기다리지 않는다 — 기다리면 서버가 그린 HTML을 스켈레톤이 덮는다
    enabled: initialDeal !== undefined || sessionStatus !== "loading",
    initialData: initialDeal,
    initialDataUpdatedAt,
  });

  /**
   * 보도 타임라인은 "나"에 종속되지 않아(키에 유저가 없다) 세션 복원을 기다릴 이유가 없다 —
   * 항상 켜 둔다. 프리페치가 있으면 `initialData`가 곧바로 캐시에 앉는다.
   */
  const reportsQuery = useTransferReportsQuery({
    dealId,
    initialData: initialReports,
    initialDataUpdatedAt,
  });

  /**
   * 댓글 — 키가 userId로 스코프된다(내 표 임베딩이 "내 행만"). 딜과 같은 규약이다:
   * ⚠ 복원 전에는 서버가 본 사용자를 키로 쓰고, 프리페치가 있으면 복원을 기다리지 않는다
   *   (닫아 두면 서버가 그린 댓글을 첫 프레임에 스켈레톤이 덮는다 — `nextjs.md`).
   */
  /**
   * ⚠ **서버가 본 사용자와 지금 사용자가 다르면 서버 데이터를 캐시에 넣지 않는다.** 상세를 연 채
   *   로그아웃(다른 탭·세션 부정)하면 키가 비로그인으로 옮겨 가는데, 그 새 키에 이전 사용자의 목록을
   *   initialData로 넣으면 그 사람의 👍가 조회 왕복 동안 "내 표"로 남았다(QA 실측). 그때는 내 표를 지운
   *   사본을 자리 표시로만 쓰고 새로 받는다.
   */
  const ownsPrefetch = userId === initialUserId;
  const commentsPlaceholder = useMemo(
    () => (!ownsPrefetch && initialComments ? withoutMyVotes(initialComments) : undefined),
    [ownsPrefetch, initialComments],
  );
  const commentsQuery = useCommentListQuery({
    dealId,
    userId,
    enabled: initialComments !== undefined || sessionStatus !== "loading",
    initialData: ownsPrefetch ? initialComments : undefined,
    initialDataUpdatedAt,
    placeholderData: commentsPlaceholder,
  });

  /*
   * ⚠ 반환값을 조회별 묶음으로 둔다 — 낱값으로 펼치면 여섯 개를 넘는다(`code-quality.md`).
   */
  return {
    deal: {
      data: dealQuery.data,
      isLoading:
        dealQuery.isPending || (initialDeal === undefined && sessionStatus === "loading"),
      error: dealQuery.error,
    },
    /**
     * 보도 타임라인 — 곁다리라 실패해도 본문(선수·경로·이적료)을 가리지 않고 **그 자리에서만** 알린다
     * (`nextjs.md`의 "곁다리 조회가 실패해도 본문은 그대로 내보낸다").
     * ⚠ **`undefined`와 `[]`를 접지 않는다.** `undefined`는 "아직 조회하지 않았다 / 실패했다",
     *   `[]`는 "받았는데 보도가 없다"(재파생이 `deal_id`를 되돌린 창)로 뜻이 다르다.
     */
    reports: { list: reportsQuery.data, error: reportsQuery.error },
    /** 댓글 목록 — 타임라인과 같은 곁다리 규약이다 */
    comments: {
      list: commentsQuery.data,
      /**
       * `list`가 아직 **자리 표시**(다른 사용자로 그린 SSR 목록)인가 — 그동안은 "목록에 없다 = 지워졌다"로
       * 읽으면 안 된다(그 뒤에 달린 댓글이 빠져 있다). 대상 소실 판정은 이게 false일 때만 한다.
       */
      isPlaceholder: commentsQuery.isPlaceholderData,
      error: commentsQuery.error,
      refetch: () => commentsQuery.refetch(),
    },
    /**
     * 세션 — 댓글 입력·표·답글이 3분기하고, `나` 뱃지·삭제 버튼은 **캐시 키와 같은 사용자**를 본다
     * (복원 전에는 서버가 본 사용자라 서버가 그린 HTML과 첫 렌더가 갈리지 않는다).
     */
    session: { status: sessionStatus, userId },
    // 재시도는 전부 다시 받는다 — 딜이 실패한 상황이면 같은 원인으로 곁다리도 실패했을 공산이 크다
    refetch: () =>
      Promise.all([dealQuery.refetch(), reportsQuery.refetch(), commentsQuery.refetch()]),
  };
}

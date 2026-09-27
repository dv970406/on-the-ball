"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { CommentList } from "../model/types";
import { commentKeys } from "./keys";
import { buildCommentListQuery } from "./list-query";
import { buildCommentList } from "./mappers";
import { applyPendingVotes } from "./pending-votes";

/**
 * 한 딜의 댓글 — 화면에는 오래된 순으로 넘기지만 **최신 것부터 잘라 온다**(`buildCommentList` 주석).
 *
 * ⚠ `initialData`는 서버 프리페치의 결과다 — 서버가 **같은 조립**을 써야 한다
 *   (`buildCommentListQuery`·`buildCommentList`가 그 단일 소스다).
 * ⚠ 키가 userId로 스코프된다 — 프리페치가 있으면 **서버가 본 userId**로 불러야 캐시에 닿는다
 *   (호출부가 세션 복원 전 그 값을 넘긴다 — `useTransferDetail`).
 * ⚠ 받은 목록에 **아직 끝나지 않은 내 표**를 입혀서 돌려준다(`applyPendingVotes`) — 표가 날아가는 동안의
 *   조회가 방금 누른 표를 되돌리지 않게.
 */
interface UseCommentListQueryArgs {
  dealId: number;
  userId: string | undefined;
  enabled?: boolean;
  /** 서버 프리페치 — ⚠ 서버가 **같은 사용자**로 그린 것만 넣는다(`useTransferDetail`) */
  initialData?: CommentList;
  /**
   * 서버가 그 데이터를 읽은 시각(ms). ⚠ 넣지 않으면 initialData가 **지금 받은 것**으로 취급된다 —
   * 뒤로가기는 Next가 보관한 옛 서버 페이로드를 되살리는데, 그게 신선한 데이터로 앉아 staleTime 동안
   * 다시 받지 않았다(QA 실측: 닉네임을 바꾸고 돌아와도 옛 표기가 남았다). 서버 시각을 주면 오래된
   * 페이로드는 곧바로 stale이라 마운트하면서 다시 받는다.
   */
  initialDataUpdatedAt?: number | (() => number | undefined);
  /**
   * 캐시에 넣지 않고 조회가 끝날 때까지만 보여 줄 값 — 서버가 **다른 사용자**로 그린 목록을 내 표를 지워
   * 넘긴다(`useTransferDetail`). initialData로 넣으면 그 사람의 표가 새 키에 사실처럼 앉는다.
   */
  placeholderData?: CommentList;
}

export function useCommentListQuery({
  dealId,
  userId,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
  placeholderData,
}: UseCommentListQueryArgs) {
  const queryClient = useQueryClient();
  return useQuery<CommentList, Error>({
    initialData,
    initialDataUpdatedAt,
    placeholderData,
    queryKey: commentKeys.list(dealId, userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      // 요청을 보내는 시각 — 이 뒤에 커밋된 표는 응답에 빠져 있을 수 있다(`applyPendingVotes`)
      // ⚠ 단조 시계다 — 벽시계는 NTP 보정·수동 변경으로 뒤로 점프해 "조회 뒤 커밋" 판정이 뒤집힌다
      const startedAt = performance.now();
      // ⚠ 조립은 `buildCommentListQuery`가 단독으로 소유한다 — SSR 페이지가 같은 함수를 부른다
      const { data, error } = await buildCommentListQuery(supabase, dealId);
      if (error) {
        console.error("[comment] 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return applyPendingVotes(buildCommentList(data ?? []), queryClient, dealId, userId, startedAt);
    },
    enabled: enabled && Number.isSafeInteger(dealId) && dealId > 0,
  });
}

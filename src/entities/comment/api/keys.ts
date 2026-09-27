import { userScope } from "@/shared/lib/query-scope";

/**
 * 댓글 쿼리 키 — 딜 단위로 목록을 캐시한다.
 *
 * ⚠ **userId로 스코프한다.** 행마다 "내 표"(`my_vote` 임베딩 — 정책상 내 행만)를 담으므로 응답
 *   자체가 "나"에 종속된다. 키에 유저가 없으면 계정이 바뀐 뒤에도 이전 사용자의 표가 남는다.
 * ⚠ 정렬은 키에 넣지 않는다 — 받아 온 목록을 뷰가 정렬한다(보드의 리그·정렬과 같은 이유:
 *   키가 서버 프리페치와 하나라도 어긋나면 `initialData`가 캐시에 닿지 못한다).
 */
export const commentKeys = {
  all: ["comment"] as const,
  lists: () => [...commentKeys.all, "list"] as const,
  /** 한 딜의 목록 전부(사용자 무관) — 쓰기 뒤 무효화가 이 prefix로 잡는다(낙관적 갱신은 내 키 `list`만 고친다) */
  deal: (dealId: number) => [...commentKeys.lists(), dealId] as const,
  list: (dealId: number, userId: string | undefined) =>
    [...commentKeys.deal(dealId), userScope(userId)] as const,
  /**
   * 표 뮤테이션 키(쿼리 키가 아니다) — 표 훅이 달고, 목록 조회가 "아직 끝나지 않은 표"를 찾는 데 쓴다
   * (`applyPendingVotes`). 줄 끝 판정(`isMutating`)도 이 키로 센다.
   */
  voteMutation: (dealId: number) => ["comment-vote", dealId] as const,
} as const;

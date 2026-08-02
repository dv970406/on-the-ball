/**
 * 게시글 쿼리 키 — 낙관적 업데이트가 prefix 매칭에 의존하므로 계층을 지킨다.
 * (좋아요 토글이 postKeys.lists()로 목록 캐시 전체를 한 번에 갱신한다)
 */
export const postKeys = {
  all: ["post"] as const,
  lists: () => [...postKeys.all, "list"] as const,
  list: () => [...postKeys.lists()] as const,
  details: () => [...postKeys.all, "detail"] as const,
  detail: (id: number) => [...postKeys.details(), id] as const,
} as const;

/** 댓글 쿼리 키 — 글 단위로 목록을 캐시한다 */
export const commentKeys = {
  all: ["comment"] as const,
  lists: () => [...commentKeys.all, "list"] as const,
  list: (postId: number) => [...commentKeys.lists(), postId] as const,
} as const;

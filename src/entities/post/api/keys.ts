import type { PostListFilters } from "../model/types";

/**
 * 게시글 쿼리 키 — 낙관적 업데이트가 prefix 매칭에 의존하므로 계층을 지킨다.
 * (좋아요 토글이 postKeys.lists()로 필터별 목록 캐시 **전부**를 한 번에 갱신한다)
 */
export const postKeys = {
  all: ["post"] as const,
  lists: () => [...postKeys.all, "list"] as const,
  /**
   * 필터 객체가 그대로 키에 들어간다. TanStack의 hashKey는 plain object의 키를 정렬해
   * 직렬화하므로 프로퍼티 순서는 문제되지 않는다(값의 undefined는 문제된다 — PostListFilters 주석).
   */
  list: (filters: PostListFilters) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, "detail"] as const,
  detail: (id: number) => [...postKeys.details(), id] as const,
  /** 어드민 목록·단건 — 사유는 `matchKeys.adminLists` 주석과 같다 */
  adminLists: () => [...postKeys.all, "admin", "list"] as const,
  adminList: (deleted: boolean | null) => [...postKeys.adminLists(), deleted] as const,
  adminDetail: (id: number) => [...postKeys.all, "admin", "detail", id] as const,
} as const;

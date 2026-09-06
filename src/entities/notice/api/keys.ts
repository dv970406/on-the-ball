/**
 * 공지 쿼리 키.
 *
 * ⚠ **`userScope`를 붙이지 않는다.** 공지에는 "나"에 종속된 값이 없다(참여도 좋아요도 없다) —
 *   `surveyKeys`가 목록까지 스코프하는 것은 카드가 참여 표시를 담기 때문이고, 여기는 그 이유가
 *   성립하지 않는다. 다만 **어드민 목록은 관리자에게만 행이 오므로** 키를 갈라 둔다(`admin`).
 *   그래야 로그아웃 뒤 남은 어드민 캐시가 일반 목록으로 새지 않는다.
 */
export const noticeKeys = {
  all: ["notice"] as const,
  lists: () => [...noticeKeys.all, "list"] as const,
  adminLists: () => [...noticeKeys.all, "admin", "list"] as const,
  /** deleted: null=전부 / true=삭제됨 / false=살아 있는 것 */
  adminList: (deleted: boolean | null) => [...noticeKeys.adminLists(), deleted] as const,
  adminDetail: (id: number) => [...noticeKeys.all, "admin", "detail", id] as const,
} as const;

import type { Database } from "@/types/database.types";

export type NoticeRow = Database["public"]["Tables"]["notice"]["Row"];

/**
 * 공지 타입 — **DB enum에서 생성된 타입**이라 목록을 손으로 다시 적지 않는다.
 *
 * ⚠ 값이 곧 라벨이다(배지에 이 단어가 그대로 나간다) → 라벨맵을 두지 않는다.
 *   `post_category`와 같은 판단이고 `report_reason`(영문 키 + 라벨맵)과 반대다.
 */
export type NoticeType = Database["public"]["Enums"]["notice_type"];

/**
 * 노출 순서 배열 — 값을 더하면 **양방향 컴파일 에러**가 난다.
 *   `as const satisfies` : 없는 값을 적으면 실패
 *   `_EXHAUSTIVE`        : 빠뜨린 값이 있으면 실패
 */
export const NOTICE_TYPES = ["필독", "공지"] as const satisfies readonly NoticeType[];

// ⚠ 타입 별칭만 선언하면 아무것도 검사하지 못한다 — 실제 값에 할당해야 컴파일러가 대조한다.
const _NOTICE_TYPES_EXHAUSTIVE: Exclude<NoticeType, (typeof NOTICE_TYPES)[number]> extends never
  ? true
  : never = true;

/**
 * 목록·배너가 쓰는 형태 — **본문이 없다.**
 *
 * ⚠ `body`는 20,000자까지 갈 수 있어 목록 50건이면 그대로 응답이 부풀고, 피드 최상단
 *   배너는 제목 한 줄만 그리는데 본문을 통째로 받는 셈이 된다 → select를 갈랐다
 *   (`POST_LIST_SELECT` ↔ `POST_DETAIL_SELECT`와 같은 판단).
 */
export interface NoticeListItem {
  id: NoticeRow["id"];
  type: NoticeType;
  title: NoticeRow["title"];
  opensAt: NoticeRow["opens_at"];
  /** null이면 무기한 */
  closesAt: NoticeRow["closes_at"];
  createdAt: NoticeRow["created_at"];
  updatedAt: NoticeRow["updated_at"];
}

export interface Notice extends NoticeListItem {
  body: NoticeRow["body"];
  /** 소프트 삭제 시각. 일반 조회에는 애초에 오지 않고 어드민 조회에만 실린다 */
  deletedAt: NoticeRow["deleted_at"];
}

/**
 * 노출 상태 — 화면이 배지로 그린다.
 *
 * ⚠ **`nowMs`를 인자로 받는다**(`isSurveyOpen`·`isMatchOpen`과 같은 형태·같은 이유).
 *   렌더 중에 시계를 읽으면 서버 렌더와 하이드레이션이 다른 값을 만든다.
 * ⚠ `null`은 "아직 판정 전"이다 — `"종료"`로 접으면 첫 프레임에 멀쩡한 공지가 끝난 것으로 보인다.
 * ⚠ 이 판정은 **안내일 뿐이다.** 실제 노출 차단은 `notice_select_live` 정책이 한다.
 */
export type NoticeVisibility = "scheduled" | "live" | "closed";

export function noticeVisibility(
  notice: Pick<Notice, "opensAt" | "closesAt">,
  nowMs: number | null,
): NoticeVisibility | null {
  if (nowMs === null) return null;
  if (new Date(notice.opensAt).getTime() > nowMs) return "scheduled";
  if (notice.closesAt !== null && new Date(notice.closesAt).getTime() <= nowMs) return "closed";
  return "live";
}

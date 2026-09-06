import type { Notice, NoticeListItem, NoticeRow } from "../model/types";

/**
 * ⚠ 상한·select 문자열은 `"use client"`가 없는 이 파일에 둔다 — 서버(공지 화면·어드민)가
 *   같은 값을 써야 하기 때문이다(`POST_LIST_LIMIT`이 여기 있는 것과 같은 이유).
 */
export const NOTICE_LIST_LIMIT = 50;

/**
 * ⚠ **한 템플릿 리터럴로 둔다.** 조각을 `+`로 이으면 supabase-js가 보는 리터럴 타입이
 *   `string`으로 넓어져 결과 추론이 통째로 `GenericStringError`가 된다(match에서 실측).
 */
export const NOTICE_SELECT =
  "id, type, title, body, opens_at, closes_at, created_at, updated_at, deleted_at" as const;

/**
 * 목록·배너용 — **본문을 싣지 않는다.**
 *
 * ⚠ `deleted_at`도 뺐다. 일반 조회에는 `notice_select_live` 정책 때문에 애초에 살아 있는
 *   행만 오므로 값이 항상 `null`이고, 실으면 화면이 "여기서도 판정할 수 있다"고 오해한다.
 */
export const NOTICE_LIST_SELECT =
  "id, type, title, opens_at, closes_at, created_at, updated_at" as const;

type NoticeListRow = Pick<
  NoticeRow,
  "id" | "type" | "title" | "opens_at" | "closes_at" | "created_at" | "updated_at"
>;

export function buildNoticeListItem(row: NoticeListRow): NoticeListItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildNotice(row: NoticeRow): Notice {
  return {
    ...buildNoticeListItem(row),
    body: row.body,
    deletedAt: row.deleted_at,
  };
}

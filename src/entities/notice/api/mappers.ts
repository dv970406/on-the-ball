import type { Notice, NoticeRow } from "../model/types";

/**
 * ⚠ 상한·select 문자열은 `"use client"`가 없는 이 파일에 둔다 — 서버(어드민 페이지)가
 *   같은 값을 써야 하기 때문이다(`POST_LIST_LIMIT`이 여기 있는 것과 같은 이유).
 */
export const NOTICE_LIST_LIMIT = 50;

/**
 * ⚠ **한 템플릿 리터럴로 둔다.** 조각을 `+`로 이으면 supabase-js가 보는 리터럴 타입이
 *   `string`으로 넓어져 결과 추론이 통째로 `GenericStringError`가 된다(match에서 실측).
 */
export const NOTICE_SELECT =
  "id, type, title, body, opens_at, closes_at, created_at, updated_at, deleted_at" as const;

export function buildNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

// ⚠ "use client" 훅을 포함한다 — 서버는 model/types·api/keys·api/mappers를 직접 import한다.
// ⚠ **배럴에는 다른 레이어가 소비하는 것만 담는다.** `Notice`·`NoticeRow`·`NOTICE_LIST_LIMIT`·
//   `NoticeVisibility`는 슬라이스 밖 호출부가 0이라 올리지 않는다(훅의 반환을 그대로 쓴다).
//   `check:conventions`는 상대 경로 소비를 "현역"으로 세어 **이 유형을 잡지 못하므로** 손으로 지킨다.
export { NOTICE_TYPES, noticeVisibility, type NoticeType } from "./model/types";
export { noticeKeys } from "./api/keys";
export { useAdminNoticeListQuery, useAdminNoticeQuery } from "./api/queries";

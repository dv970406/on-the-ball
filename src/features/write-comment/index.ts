// 조회는 `@/entities/comment`, 쓰기는 여기 — `entities/transfer` ↔ `features/watch-transfer`와 같은 분업.
// ⚠ 가드(`useDuplicateGuard`)는 여기 없다 — 실패 시 입력창·답글 대상을 되돌리는 것은 화면의 상태라
//   뮤테이션을 조립하는 화면 슬라이스의 model이 갖는다(`views/transfer-detail/model/use-comment-composer`).
export { isReplyTargetMissing, useWriteComment, validateComment } from "./model/use-write-comment";

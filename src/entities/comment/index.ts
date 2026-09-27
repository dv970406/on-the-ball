// ⚠ "use client" 모듈 포함 — 서버에서는 model/types·api/mappers·api/keys·api/list-query를 직접 import한다.
export type {
  Comment,
  CommentList,
  CommentSort,
  CommentVote,
} from "./model/types";
export { commentKeys } from "./api/keys";
// ⚠ 상한은 서버 안전한 api/mappers에 있다 — SSR 프리페치가 같은 값을 쓰고 화면이 잘림을 말한다
export { COMMENT_LIST_LIMIT } from "./api/mappers";
export { useCommentListQuery } from "./api/queries";
// 쓰기 뒤 목록을 다시 받을 때까지(상한 있음) 기다린다 — 성공 토스트와 목록 변경이 같은 순간이 되게(그 파일 주석)
export { refreshCommentLists } from "./api/refresh";
export { buildCommentThreads } from "./lib/build-comment-threads";
export { sortThreads } from "./lib/sort-threads";
// 표의 낙관적 갱신과 목록 조회가 **같은 계산**으로 표를 입힌다(조회는 아직 끝나지 않은 표를 덮는다)
export { applyVote, withoutMyVotes } from "./lib/apply-vote";
export { recordSettledVote } from "./api/pending-votes";
export { CommentItem } from "./ui/comment-item";

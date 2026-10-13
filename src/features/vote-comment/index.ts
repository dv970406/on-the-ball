// 조회(합계·내 표)는 `@/entities/comment`, 쓰기는 여기.
// 목록이 표 보내기를 **한 벌** 만들어(`useCommentVote`) 행마다 버튼에 내려보낸다 — 버튼마다 뮤테이션을 두지 않는다.
// ⚠ 뮤테이션 훅(`useVoteComment`)은 올리지 않는다 — `useCommentVote`가 유일한 호출부다.
export { CommentVoteButtons } from "./ui/comment-vote-buttons";
export { useCommentVote, type CommentVoteFn } from "./model/use-comment-vote";

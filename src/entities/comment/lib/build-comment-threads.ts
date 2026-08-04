import type { Comment, CommentThread } from "../model/types";

/**
 * 평면 댓글 목록 → 깊이 1 스레드. 순수 함수라 서버에서도 import할 수 있다("use client" 없음).
 *
 * 입력은 **오래된 순**(useCommentListQuery가 그 순서로 돌려준다).
 * 출력도 루트·답글 모두 오래된 순을 유지한다.
 *
 * ⚠ **부모를 못 찾은 답글은 버리지 않고 루트로 승격한다.**
 *   COMMENT_LIST_LIMIT(200)을 최신순으로 잘라 오는 구조라 고아는 실제로 생긴다 —
 *   댓글 250개짜리 글에서 3번 댓글에 달린 답글이 240번이면 부모만 잘려나간다.
 *   버리면 (a) 내용이 화면에서 증발하고 (b) "최근 200개만 표시하고 있어요" 문구가
 *   그 이유를 설명하지 못한다. 승격이 가장 싸고 데이터를 잃지 않는다.
 */
export function buildCommentThreads(comments: Comment[]): CommentThread[] {
  const threads: CommentThread[] = [];
  const byId = new Map<Comment["id"], CommentThread>();

  // 1차: 루트를 순서대로 자리잡는다
  for (const comment of comments) {
    if (comment.parentId !== null) continue;
    const thread: CommentThread = { comment, replies: [] };
    threads.push(thread);
    byId.set(comment.id, thread);
  }

  // 2차: 답글을 부모에 붙인다. 부모가 없으면 루트로 승격(위 주석 참고).
  for (const comment of comments) {
    if (comment.parentId === null) continue;
    const parent = byId.get(comment.parentId);
    if (parent) parent.replies.push(comment);
    else threads.push({ comment, replies: [] });
  }

  return threads;
}

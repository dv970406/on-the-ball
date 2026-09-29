import type { Comment, CommentSort, CommentThread } from "../model/types";

/** 최신이 앞으로 — 같은 시각이면 id가 큰(나중에 들어온) 쪽이 앞이다(조회의 2차 정렬키와 같다) */
function newerFirst(a: Comment, b: Comment) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return b.id - a.id;
}

/**
 * 루트 댓글의 표시 순서. **답글은 건드리지 않는다**(작성순 그대로).
 *
 * - 인기순: `좋아요 − 싫어요` 내림차순. 같으면 최신이 앞이다 — 오래된 0점 댓글이 새 댓글을 덮지 않게.
 * - 최신순: 작성 시각 내림차순.
 *
 * ⚠ **인기순 점수에서 "이번에 누른 변화분"만 뺀다**(`myVote − fetchedVote`). 합계에는 낙관적 갱신이
 *   들어 있어서, 그대로 쓰면 좋아요를 누르는 순간 그 댓글이 손가락 밑에서 튀어 **읽던 자리를 잃는다.**
 *   ⚠ 내 표 **전체**를 빼지 않는다 — 그러면 새로고침한 뒤에도 내가 좋아요한 댓글이 표시된 점수보다
 *   아래에 놓여, 같은 딜의 순서가 보는 사람마다 달라진다(QA 실측). 다시 받으면 변화분이 0이 되어
 *   화면의 숫자와 순서가 맞는다.
 * ⚠ 원본 배열을 바꾸지 않는다(캐시 객체다).
 */
export function sortThreads(threads: CommentThread[], sort: CommentSort): CommentThread[] {
  const score = (c: Comment) => c.upCount - c.downCount - (c.myVote - c.fetchedVote);
  return [...threads].sort((a, b) => {
    if (sort === "top") {
      const diff = score(b.comment) - score(a.comment);
      if (diff !== 0) return diff;
    }
    return newerFirst(a.comment, b.comment);
  });
}

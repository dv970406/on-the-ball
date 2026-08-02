"use client";

import { formatCount } from "@/shared/lib";
import { EmptyState, Skeleton } from "@/shared/ui";
import { COMMENT_LIST_LIMIT, CommentItem, useCommentListQuery } from "@/entities/comment";
import { useSessionStore } from "@/entities/session";
import { useDeleteComment } from "@/features/delete-comment";
import { CommentForm } from "./comment-form";

interface CommentSectionProps {
  postId: number;
  /** 글의 comment_count (DB 트리거가 관리하는 진실값) */
  commentCount: number;
}

export function CommentSection({ postId, commentCount }: CommentSectionProps) {
  const { data: comments, isPending, error, refetch } = useCommentListQuery(postId);
  const user = useSessionStore((s) => s.user);
  const deleteComment = useDeleteComment(postId);

  // 목록은 최근 COMMENT_LIST_LIMIT개만 가져오므로 헤딩 카운트는 글의 값(트리거가 관리)을 쓴다 —
  // comments.length를 쓰면 상단 헤딩과 하단 footer 숫자가 어긋난다.
  //
  // ⚠ 잘림 판정은 **목록 길이만으로** 한다. `commentCount > comments.length`로 하면,
  //   댓글 작성 후 글 상세와 댓글 목록이 병렬로 무효화되는 사이 상세가 먼저 도착했을 때
  //   (카운트 6 / 목록 5) 댓글 6개짜리 글에 "최근 200개만 표시" 문구가 잘못 뜬다.
  const truncated = (comments?.length ?? 0) >= COMMENT_LIST_LIMIT;

  return (
    <section className="px-5 pb-10" aria-labelledby="comment-heading">
      <h2 id="comment-heading" className="mb-3 text-[15px] font-semibold text-ink">
        댓글 {formatCount(commentCount)}
      </h2>

      <CommentForm postId={postId} />

      {isPending && (
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {error && (
        <EmptyState
          title="댓글을 불러오지 못했어요"
          description={error.message}
          onRetry={() => void refetch()}
        />
      )}

      {comments && comments.length === 0 && (
        <p className="py-8 text-center text-[13px] text-ink-mute-2">
          첫 댓글을 남겨보세요.
        </p>
      )}

      {comments && comments.length > 0 && truncated && (
        <p className="mt-3 text-center text-[12px] text-ink-mute-2">
          최근 {formatCount(COMMENT_LIST_LIMIT)}개만 표시하고 있어요.
        </p>
      )}

      {comments && comments.length > 0 && (
        <ul className="mt-2">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              action={
                comment.userId === user?.id ? (
                  <button
                    type="button"
                    onClick={() => deleteComment.mutate(comment.id)}
                    // 훅은 하나지만 variables로 "지금 지우는 중인 댓글"을 특정한다 →
                    // 한 개를 지우는 동안 나머지 삭제 버튼까지 잠기지 않는다
                    disabled={deleteComment.isPending && deleteComment.variables === comment.id}
                    className="text-[12px] text-ink-mute-2 underline underline-offset-2 disabled:opacity-40"
                  >
                    {deleteComment.isPending && deleteComment.variables === comment.id
                      ? "삭제 중…"
                      : "삭제"}
                  </button>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}

      {deleteComment.error && (
        <p role="alert" className="mt-2 text-[12px] text-crimson">
          {deleteComment.error.message}
        </p>
      )}
    </section>
  );
}

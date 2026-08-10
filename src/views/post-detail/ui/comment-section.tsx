"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { formatCount } from "@/shared/lib";
import { useToast } from "@/shared/lib";
import { Dialog, EmptyState, Skeleton } from "@/shared/ui";
import {
  COMMENT_LIST_LIMIT,
  CommentItem,
  buildCommentThreads,
  useCommentListQuery,
  type Comment,
} from "@/entities/comment";
import { useSessionStore } from "@/entities/session";
import { useDeleteComment } from "@/features/delete-comment";
import type { ReplyTarget } from "./comment-bar";

interface CommentSectionProps {
  postId: number;
  /** 글의 comment_count (DB 트리거가 관리하는 진실값 — 답글 포함 총합) */
  commentCount: number;
  /** 글 작성자 — `작성자` 배지 판정용 */
  postAuthorId: string;
  onReply: (target: ReplyTarget) => void;
}

export function CommentSection({
  postId,
  commentCount,
  postAuthorId,
  onReply,
}: CommentSectionProps) {
  const { data: comments, isPending, error, refetch } = useCommentListQuery(postId);
  const user = useSessionStore((s) => s.user);
  const deleteComment = useDeleteComment(postId);
  const toast = useToast();
  /** 답글이 달린 루트 댓글은 cascade로 남의 답글까지 지우므로 확인을 받는다 */
  const [confirmTarget, setConfirmTarget] = useState<{ id: number; replyCount: number } | null>(
    null,
  );

  // 목록은 최근 COMMENT_LIST_LIMIT개만 가져오므로 헤딩 카운트는 글의 값(트리거가 관리)을 쓴다 —
  // comments.length를 쓰면 상단 헤딩과 액션 바 숫자가 어긋난다.
  //
  // ⚠ 잘림 판정은 **두 조건을 **함께** 본다. 목록 길이만 보면 정확히 200개일 때(잘린 게 없는데)도 뜨고,
  //   카운트만 보면 위 레이스에서 잘못 뜬다. 상한에 닿았고 **동시에** 실제 총합이 더 클 때만 참이다.
  const truncated =
    (comments?.length ?? 0) >= COMMENT_LIST_LIMIT && commentCount > (comments?.length ?? 0);
  const threads = comments ? buildCommentThreads(comments) : undefined;

  /**
   * 삭제 중복 실행 동기 가드 — PostForm·CommentBar·글 삭제와 같은 패턴.
   *
   * ⚠ `disabled={busy}`만으로는 못 막는다 — isPending은 렌더 이후에야 DOM에 반영되는데
   *   같은 tick의 두 번째 클릭은 아직 enabled인 버튼을 누른다. 두 번째 DELETE는 이미 지워진
   *   행이라 0행이 되고, use-delete-comment가 에러로 승격해 잘못된 배너가 뜬다(실측).
   */
  /**
   * **삭제를 보낸 댓글 id 집합**. boolean 하나도, id 하나도 아니어야 한다.
   *
   * ⚠ 세 번 갈아엎은 자리라 이유를 남긴다.
   *   - boolean 하나: A를 지우는 동안 B가 **활성인데 클릭이 무시되는 무증상 잠금**이 됐다.
   *   - id 하나: `useDeleteComment`는 **훅이 하나뿐**이라 B를 누르면 `variables`가 B로 갈아탄다
   *     → A의 버튼이 다시 활성화되고(`busy=false`) A의 per-call `onSuccess`(토스트)가 버려진다.
   *     그 상태로 A를 또 누르면 이미 지워진 행에 DELETE → 0행 → **"삭제 권한이 없어요."**
   *   - Set: 보낸 것은 전부 기억하므로 위 두 가지가 동시에 닫힌다.
   *
   * ⚠ 성공하면 그 댓글은 목록에서 사라지므로 집합에서 지울 필요가 없다. 실패했을 때만
   *   다시 시도할 수 있게 비운다(그 경우 화면에 에러가 떠 있다).
   */
  const sentRef = useRef<Set<number>>(new Set());
  /**
   * 시각 표시는 **state**로 따로 둔다 — ref는 렌더 중에 읽을 수 없고(리렌더도 유발하지 않는다),
   * 반대로 state는 비동기라 동기 가드로 쓸 수 없다. 두 역할을 한 값에 겹치지 않는다.
   */
  const [sentIds, setSentIds] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    // 뮤테이션이 끝나면(성공·실패 무관) 다시 시도할 수 있게 연다.
    // 성공한 댓글은 목록에서 사라지므로 재클릭 대상이 아니다.
    if (!deleteComment.isPending) sentRef.current.clear();
  }, [deleteComment.isPending]);

  const removeComment = (commentId: number) => {
    if (sentRef.current.has(commentId)) return;
    sentRef.current.add(commentId);
    setSentIds((prev) => new Set(prev).add(commentId));
    deleteComment.mutate(commentId, {
      onSuccess: () => toast("댓글을 삭제했어요"),
    });
  };

  /** 삭제 버튼 — 답글이 달린 루트면 확인 다이얼로그를 거친다 */
  const deleteAction = (comment: Comment, replyCount: number) => {
    if (comment.userId !== user?.id) return undefined;
    // ⚠ `variables === comment.id`로 판정하면 안 된다 — 훅이 하나라 다른 댓글을 누르는 순간
    //   갈아타서, 아직 처리 중인 댓글의 버튼이 다시 활성화된다(위 sentRef 주석 참고).
    // ⚠ `isPending`을 함께 보므로 남은 id를 따로 지울 필요가 없다 — 뮤테이션이 끝나는 렌더에서
    //   모든 버튼이 한 번에 풀린다(그때 sentRef도 비워져 재시도가 열린다).
    const busy = deleteComment.isPending && sentIds.has(comment.id);
    return (
      <button
        type="button"
        onClick={() =>
          replyCount > 0
            ? setConfirmTarget({ id: comment.id, replyCount })
            : removeComment(comment.id)
        }
        disabled={busy}
        // 시각 크기는 그대로 두고 히트 영역만 44px까지 넓힌다(ActionChip과 같은 방식)
        className="relative py-1.5 text-[11px] text-ink-faint after:absolute after:-inset-x-3.5 after:-inset-y-2 after:content-[''] disabled:opacity-40"
      >
        {busy ? "삭제 중…" : "삭제"}
      </button>
    );
  };

  return (
    <section aria-labelledby="comment-heading">
      <div className="flex items-baseline gap-1.5 px-5 pb-1 pt-[18px]">
        <h2 id="comment-heading" className="text-[15px] font-semibold tracking-[-0.3px] text-ink">
          댓글
        </h2>
        <span className="font-mono text-xs tabular-nums text-primary-deep">
          {formatCount(commentCount)}
        </span>
      </div>

      {isPending && (
        <div className="flex flex-col gap-3 px-5 py-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {/*
        ⚠ 에러 화면은 보여줄 댓글이 없을 때만 띄운다.
          TanStack Query는 성공 후 리페치가 실패해도 data를 유지하므로, 조건을 나누지 않으면
          "불러오지 못했어요" 박스와 정상 댓글 목록이 한 화면에 공존한다.
          (댓글 작성·삭제가 매번 무효화를 걸어서 이 경로가 실제로 자주 열린다)
          목록·상세 화면도 같은 규약을 쓴다.
      */}
      {error && !comments && (
        <EmptyState
          live
          title="댓글을 불러오지 못했어요"
          description={error.message}
          onRetry={() => void refetch()}
        />
      )}

      {error && comments && (
        <p role="status" className="px-5 py-3 text-center text-[12px] text-ink-mute-2">
          최신 댓글을 불러오지 못했어요.{" "}
          <button
            type="button"
            onClick={() => void refetch()}
            className="underline underline-offset-2"
          >
            다시 시도
          </button>
        </p>
      )}

      {threads && threads.length === 0 && (
        <p className="py-8 text-center text-[13px] text-ink-mute-2">첫 댓글을 남겨보세요.</p>
      )}

      {threads && threads.length > 0 && truncated && (
        <p className="px-5 py-2 text-center text-[12px] text-ink-mute-2">
          최근 {formatCount(COMMENT_LIST_LIMIT)}개만 표시하고 있어요.
        </p>
      )}

      {threads && threads.length > 0 && (
        <ul>
          {threads.map(({ comment, replies }) => (
            // ⚠ 루트와 답글은 **형제 <li>** 로 나열한다. CommentItem이 자기 <li>를 그리므로
            //   여기서 <li>로 한 번 더 감싸면 li 안의 li가 되어 잘못된 HTML + 하이드레이션
            //   에러가 난다(실측). 중첩 <ul>을 만들지 않는 이유는 답글의 좌측 패딩이
            //   프로토타입(44px 고정)과 어긋나고, 깊이가 1뿐이라 계층을 표현할 이유가 적어서다.
            <Fragment key={comment.id}>
              <CommentItem
                comment={comment}
                isAuthor={comment.userId === postAuthorId}
                isMine={comment.userId === user?.id}
                onReply={() =>
                  onReply({ commentId: comment.id, nickname: comment.authorNickname })
                }
                deleteAction={deleteAction(comment, replies.length)}
              />
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  reply
                  isAuthor={reply.userId === postAuthorId}
                  isMine={reply.userId === user?.id}
                  deleteAction={deleteAction(reply, 0)}
                />
              ))}
            </Fragment>
          ))}
        </ul>
      )}

      {deleteComment.error && (
        <p role="alert" className="px-5 py-2 text-[12px] text-crimson">
          {deleteComment.error.message}
        </p>
      )}

      {/*
        ⚠ 답글이 달린 루트 댓글의 삭제는 **cascade가 RLS를 우회해** 남이 단 답글까지 지운다.
          포럼 관례로 수용한 동작이지만(마이그레이션 주석), 사용자에게는 반드시 알려야 한다.
      */}
      <Dialog
        open={confirmTarget !== null}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) removeComment(confirmTarget.id);
          setConfirmTarget(null);
        }}
        title="이 댓글을 삭제할까요?"
        description={`답글 ${formatCount(confirmTarget?.replyCount ?? 0)}개도 함께 삭제돼요. 되돌릴 수 없습니다.`}
        cancelLabel="취소"
        confirmLabel="삭제"
        destructive
      />
    </section>
  );
}

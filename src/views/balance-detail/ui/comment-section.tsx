"use client";

import { useState } from "react";
import { ArrowUp, MessageCircle } from "lucide-react";
import { Avatar, Button, EmptyState, Icon, Skeleton } from "@/shared/ui";
import { cn, formatCount, formatRelativeTime } from "@/shared/lib";
import { usePollCommentsQuery, type PollComment } from "@/entities/poll";
import { useWriteComment } from "@/features/write-comment";
import { useToggleCommentLike } from "@/features/like-comment";

interface CommentSectionProps {
  pollId: string;
  /** 목록 로드 전 노출할 서버 집계 댓글 수 */
  commentCount: number;
}

/** "한 줄 거들기" — 댓글 입력 + 댓글 리스트 (결과 공개 후에만 마운트) */
export function CommentSection({ pollId, commentCount }: CommentSectionProps) {
  const { data: comments, isPending, error } = usePollCommentsQuery(pollId);
  const writeComment = useWriteComment(pollId);
  const toggleLike = useToggleCommentLike(pollId);
  const [body, setBody] = useState("");

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed || writeComment.isPending) return;
    writeComment.mutate(trimmed, { onSuccess: () => setBody("") });
  };

  return (
    <section className="mt-7">
      <h2 className="mb-1 text-[16px] font-semibold text-ink">
        한 줄 거들기{" "}
        <span className="text-[13px] font-normal text-ink-mute-2">
          {comments ? comments.length : commentCount}
        </span>
      </h2>

      {/* 입력 카드 */}
      <div className="mb-3.5 rounded-lg border border-hairline p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="결과 보고 한 줄 거들고 가요."
          aria-label="댓글 입력"
          className="min-h-[50px] w-full resize-none border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-mute-2"
        />
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-mute-2">24h 안에 수정 가능</span>
          <Button
            variant="dark"
            size="sm"
            className="ml-auto"
            disabled={body.trim().length === 0 || writeComment.isPending}
            onClick={handleSubmit}
          >
            남기기
          </Button>
        </div>
        {/* 작성 실패 인라인 메시지 (예: "투표한 뒤에 댓글을 남길 수 있어요.") */}
        {writeComment.error ? (
          <p role="alert" className="mt-2 text-[12px] text-crimson">
            {writeComment.error.message}
          </p>
        ) : null}
      </div>

      {/* 댓글 리스트 */}
      {error ? (
        <EmptyState icon={MessageCircle} title="댓글을 불러오지 못했어요" description={error.message} />
      ) : isPending ? (
        <CommentListSkeleton />
      ) : comments.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="아직 댓글이 없어요"
          description="첫 번째로 한 줄 거들어 보세요."
        />
      ) : (
        <ul className="list-none">
          {comments.map((comment, i) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              index={i}
              onToggleLike={() => toggleLike.mutate(comment.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface CommentRowProps {
  comment: PollComment;
  /** 아바타 파스텔 배경 회전용 인덱스 */
  index: number;
  onToggleLike: () => void;
}

function CommentRow({ comment, index, onToggleLike }: CommentRowProps) {
  return (
    <li className="border-b border-hairline-cool last:border-b-0">
      <article className="flex gap-2.5 py-3.5">
        <Avatar
          label={comment.author.name}
          size={28}
          style={{ background: `hsl(${(index * 60) % 360},35%,92%)` }}
        />
        <div className="min-w-0 flex-1">
          <header className="mb-0.5 flex items-baseline gap-1.5">
            <span className="text-[13px] font-medium text-ink">{comment.author.name}</span>
            {comment.author.tag ? (
              <span className="whitespace-nowrap rounded-full border border-hairline-cool bg-canvas-soft px-1.5 py-px text-[10px] text-ink-mute">
                {comment.author.tag}
              </span>
            ) : null}
            <span className="whitespace-nowrap text-[11px] text-ink-mute-2">
              · <time dateTime={comment.createdAt}>{formatRelativeTime(comment.createdAt)}</time>
            </span>
          </header>
          <p className="text-[13px] leading-normal text-ink">{comment.body}</p>
          <footer className="mt-1.5">
            <button
              type="button"
              onClick={onToggleLike}
              aria-pressed={comment.likedByMe}
              aria-label={`동감 ${formatCount(comment.likes)}개${comment.likedByMe ? " — 동감 취소" : ""}`}
              className={cn(
                "inline-flex items-center gap-[3px] text-[11px]",
                comment.likedByMe ? "font-medium text-primary-deep" : "text-ink-mute",
              )}
            >
              <Icon as={ArrowUp} size={11} />
              동감 <span className="tnum font-mono">{formatCount(comment.likes)}</span>
            </button>
          </footer>
        </div>
      </article>
    </li>
  );
}

/** 댓글 로딩 스켈레톤 — 리스트 구조 유지 */
function CommentListSkeleton() {
  return (
    <div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-2.5 border-b border-hairline-cool py-3.5 last:border-b-0">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1">
            <Skeleton className="mb-1.5 h-3 w-24" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

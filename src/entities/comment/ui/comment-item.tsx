"use client";

import type { ReactNode } from "react";
import { formatRelativeTime } from "@/shared/lib";
import type { Comment } from "../model/types";

/**
 * 댓글 한 개 — 독립 콘텐츠라 article을 쓰고 header를 동반한다.
 * (링크로 감싼 리스트 행이 아니므로 게시글 카드와 판단이 다르다)
 */
export function CommentItem({ comment, action }: { comment: Comment; action?: ReactNode }) {
  return (
    <li>
      <article className="border-b border-hairline-cool py-3.5 last:border-b-0">
        <header className="flex items-center gap-2 text-[12px] text-ink-mute-2">
          <span className="font-medium text-ink-mute">{comment.authorNickname}</span>
          <time dateTime={comment.createdAt}>{formatRelativeTime(comment.createdAt)}</time>
          {action && <span className="ml-auto">{action}</span>}
        </header>
        {/* 댓글은 마크다운이 아니라 평문이다 — 줄바꿈만 보존한다 */}
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-[1.7] text-ink-secondary">
          {comment.content}
        </p>
      </article>
    </li>
  );
}

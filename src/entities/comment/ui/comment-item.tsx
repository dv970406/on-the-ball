"use client";

import type { ReactNode } from "react";
import { CornerDownRight } from "lucide-react";
// ⚠ avatarUrl은 shared에 있다 — entities끼리 import할 수 없어서다(shared/config/avatar.ts 주석)
import { avatarUrl } from "@/shared/config";
import { cn, formatRelativeTime, useNowMs } from "@/shared/lib";
import { Avatar, Icon } from "@/shared/ui";
import type { Comment } from "../model/types";

interface CommentItemProps {
  comment: Comment;
  /** 답글이면 좌측 들여쓰기 + 옅은 배경, 아바타 24px. 그리고 `답글` 버튼이 없다 */
  reply?: boolean;
  /** 글 작성자가 쓴 댓글 — `작성자` 배지(뉴트럴) */
  isAuthor?: boolean;
  /** 내가 쓴 댓글 — `내 댓글` 배지(에메랄드 톤) */
  isMine?: boolean;
  /** 답글 달기 — 루트 댓글에만 전달한다(깊이 1 제한) */
  onReply?: () => void;
  /** 삭제 — 내 댓글에만 전달한다 */
  deleteAction?: ReactNode;
  /**
   * 서버가 렌더한 시점의 시각(SSR 화면에서만 내려온다).
   *
   * ⚠ **없으면 첫 렌더가 절대시각이 되어 마운트 직후 상대시각으로 바뀐다** — 글자 폭이
   *   달라 눈에 띄는 시프트가 된다. 서버 시각을 받아 첫 렌더부터 상대시각을 그리면
   *   서버 HTML과 하이드레이션이 **같은 문자열**이라 시프트도 불일치도 없다.
   *   (목록처럼 SSR하지 않는 화면은 마운트 후에 그려지므로 이 값이 필요 없다.)
   */
  serverNowMs?: number;
}

/**
 * 댓글 한 개 (프로토타입 `.cm-cmt`) — 독립 콘텐츠라 article을 쓰고 header를 동반한다.
 * (링크로 감싼 리스트 행이 아니므로 게시글 카드와 판단이 다르다)
 *
 * 댓글 좋아요는 DB에 데이터가 없어 렌더하지 않는다 — 동작을 발명하지 않는다.
 */
export function CommentItem({
  serverNowMs,
  comment,
  reply,
  isAuthor,
  isMine,
  onReply,
  deleteAction,
}: CommentItemProps) {
  // ⚠ 렌더 중 시계를 읽지 않는다 — SSR HTML과 하이드레이션이 갈린다(format.ts 주석).
  //   마운트 전에는 서버가 준 시각을 쓴다(위 serverNowMs 주석).
  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 모듈 스코프에 세션당 한 번 고정되어 앱을
  //   처음 연 순간에 굳는다(사유는 `use-now.ts`). 그 값을 앞에 두면 갓 받은 서버 시각을
  //   낡은 클라 시계가 이긴다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs ?? null;
  return (
    <li>
      <article
        className={cn(
          "border-b border-hairline-cool px-5 py-3.5",
          reply && "bg-canvas-soft pl-11",
        )}
      >
        <div className="flex gap-2.5">
          <Avatar
            label={comment.authorNickname}
            src={avatarUrl(comment.authorAvatarPath)}
            size={reply ? 24 : 28}
            className={reply ? "text-[11px]" : "text-xs"}
          />
          <div className="min-w-0 flex-1">
            <header className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-medium text-ink">
                {comment.authorNickname}
              </span>
              {isAuthor && (
                <span className="shrink-0 rounded-xs border border-hairline px-1 py-px font-mono text-[9px] tracking-[0.3px] text-ink-mute">
                  작성자
                </span>
              )}
              {isMine && (
                <span className="shrink-0 rounded-xs border border-primary/35 px-1 py-px font-mono text-[9px] tracking-[0.3px] text-primary-deep">
                  내 댓글
                </span>
              )}
              <time
                dateTime={comment.createdAt}
                className="ml-auto shrink-0 font-mono text-[10px] text-ink-faint"
              >
                {formatRelativeTime(comment.createdAt, nowMs)}
              </time>
            </header>

            {/* 댓글은 마크다운이 아니라 평문이다 — 줄바꿈만 보존한다 */}
            <p className="mt-[5px] whitespace-pre-wrap break-words text-pretty text-[14px] leading-[1.6] text-ink-secondary">
              {comment.content}
            </p>

            {(onReply || deleteAction) && (
              <footer className="mt-2 flex items-center gap-3.5 text-[11px] text-ink-mute-2">
                {/* 답글에는 `답글` 버튼이 없다 — 깊이 1까지만(DB 트리거도 같은 제한) */}
                {onReply && (
                  <button
                    type="button"
                    onClick={onReply}
                    // 시각 크기는 그대로 두고 히트 영역만 44px까지 넓힌다(ActionChip과 같은 방식)
                    className="relative inline-flex items-center gap-1 py-1.5 after:absolute after:-inset-x-2 after:-inset-y-2 after:content-['']"
                  >
                    <Icon as={CornerDownRight} size={12} />
                    답글
                  </button>
                )}
                {deleteAction && <span className="ml-auto">{deleteAction}</span>}
              </footer>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

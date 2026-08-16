"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, CornerDownRight, X } from "lucide-react";
import { signInWithNext } from "@/shared/config";
import { Icon, buttonClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { useCommentComposer } from "../model/use-comment-composer";
import type { ReplyTarget } from "../model/reply-target";

interface CommentBarProps {
  postId: number;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  /**
   * 전송 실패로 되돌릴 때 답글 대상을 복원한다.
   * ⚠ 입력창 복구만 있으면 재전송이 **루트 댓글로 등록된다** — use-comment-composer 주석 참고.
   */
  onRestoreReply: (target: ReplyTarget) => void;
}

/**
 * 하단 고정 댓글 입력 (프로토타입 `.cm-cmt-input`).
 *
 * 알약형 인풋은 "버튼 6px 라운드" 규칙의 명시적 예외 중 하나다.
 * 답글 모드면 입력창 바로 위에 대상 표시 바가 뜬다.
 */
export function CommentBar({
  postId,
  replyTo,
  onCancelReply,
  onRestoreReply,
}: CommentBarProps) {
  const status = useSessionStore((s) => s.status);
  const pathname = usePathname();
  // ⚠ 아래 early return보다 위에 둔다 — 훅은 조건부로 호출할 수 없다.
  const composer = useCommentComposer(postId, replyTo, onCancelReply, onRestoreReply);

  const shell = (children: ReactNode) => (
    <footer className="absolute inset-x-0 bottom-0 z-[60] border-t border-hairline-cool bg-canvas px-3.5 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
      {children}
    </footer>
  );

  // 세션 판정 전에는 자리를 비워 둔다 — 로그인 안내가 깜빡였다가 폼으로 바뀌지 않게
  if (status === "loading") return shell(<div className="h-10" />);

  if (status === "guest") {
    return shell(
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-mute">댓글을 쓰려면 로그인이 필요해요.</p>
        <Link
          href={signInWithNext(pathname)}
          className={buttonClassName({ variant: "secondary", size: "sm" })}
        >
          로그인
        </Link>
      </div>,
    );
  }

  return shell(
    <>
      {replyTo && (
        <div className="-mx-3.5 -mt-2.5 mb-2.5 flex items-center gap-1.5 border-b border-hairline-cool bg-canvas-soft px-4 py-[7px] text-[11px] text-ink-mute">
          <Icon as={CornerDownRight} size={12} />
          <span>
            <b className="font-medium text-ink">{replyTo.nickname}</b> 에게 답글
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="답글 취소"
            className="-my-2 ml-auto flex size-8 items-center justify-center text-ink-mute"
          >
            <Icon as={X} size={13} />
          </button>
        </div>
      )}

      <form onSubmit={composer.onSubmit} className="flex items-end gap-2">
        <label htmlFor="comment-input" className="sr-only">
          {replyTo ? `${replyTo.nickname}에게 답글 입력` : "댓글 입력"}
        </label>
        <input
          id="comment-input"
          {...composer.inputProps}
          placeholder={replyTo ? "답글을 남겨보세요" : "한 줄 거들기"}
          className="h-10 flex-1 rounded-full border border-hairline bg-canvas-soft px-3.5 text-[14px] text-ink outline-none transition-colors duration-150 ease-otb placeholder:text-ink-faint focus:border-ink focus:bg-canvas"
        />
        <button
          type="submit"
          aria-label={replyTo ? "답글 등록" : "댓글 등록"}
          disabled={!composer.canSubmit}
          // 40px 원형은 프로토타입 치수다 — 히트 영역만 투명 의사요소로 44px까지 넓힌다
          className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors duration-150 ease-otb after:absolute after:-inset-0.5 after:content-[''] disabled:bg-hairline disabled:text-ink-faint"
        >
          <Icon as={ArrowUp} size={18} />
        </button>
      </form>

      {composer.error && (
        <p className="mt-1.5 text-[12px] text-crimson">{composer.error}</p>
      )}
    </>,
  );
}

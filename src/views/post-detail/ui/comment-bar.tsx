"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, CornerDownRight, X } from "lucide-react";
import { signInWithNext } from "@/shared/config";
import { codePointLength, hasVisibleChar } from "@/shared/lib";
import { Icon, buttonClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { COMMENT_MAX, useWriteComment } from "@/features/write-comment";

export interface ReplyTarget {
  commentId: number;
  nickname: string;
}

interface CommentBarProps {
  postId: number;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
}

/**
 * 하단 고정 댓글 입력 (프로토타입 `.cm-cmt-input`).
 *
 * 알약형 인풋은 "버튼 6px 라운드" 규칙의 명시적 예외 4곳 중 하나다.
 * 답글 모드면 입력창 바로 위에 대상 표시 바가 뜬다.
 */
export function CommentBar({ postId, replyTo, onCancelReply }: CommentBarProps) {
  const status = useSessionStore((s) => s.status);
  const pathname = usePathname();
  const writeComment = useWriteComment(postId);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 중복 제출 동기 가드.
   * ⚠ `disabled={isPending}`는 렌더 이후에야 적용되므로 같은 tick의 두 번째 클릭을
   *   막지 못한다(실측: 3연타 → 댓글 3개). ref는 렌더를 기다리지 않는다.
   * ⚠ 아래 early return보다 위에 둔다 — 훅은 조건부로 호출할 수 없다.
   */
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!writeComment.isPending) submittingRef.current = false;
  }, [writeComment.isPending]);

  // 답글 모드로 들어가면 바로 쓸 수 있게 포커스를 옮긴다
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

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

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const trimmed = content.trim();
    // 제로폭 문자만 있는 댓글도 걸러낸다(화면에 아무것도 안 보이는 댓글이 등록됐다).
    // ⚠ 조용히 return하지 않는다 — 버튼 활성 조건은 `content.trim()`이라 눌리기는 하는데
    //   아무 일도 안 일어나면 고장으로 읽힌다.
    if (!hasVisibleChar(trimmed)) {
      setError("내용을 입력해 주세요.");
      return;
    }

    /**
     * 길이·빈 값 판정은 게시글 폼과 **같은 기준**을 쓴다(DB CHECK와도 같은 단위).
     * ⚠ input에 maxLength를 걸면 브라우저가 UTF-16 코드유닛으로 세어
     *   이모지 댓글이 한도의 절반에서 **아무 안내 없이 잘린다.**
     */
    if (codePointLength(trimmed) > COMMENT_MAX) {
      setError(`댓글은 ${COMMENT_MAX}자까지 쓸 수 있어요.`);
      return;
    }
    setError(undefined);

    submittingRef.current = true;
    const parentId = replyTo?.commentId ?? null;

    /**
     * ⚠ 입력창은 **제출 즉시** 비운다.
     *   `mutate(..., { onSuccess })`의 콜백은 훅의 onSuccess(무효화 3건 Promise)를 await한
     *   **뒤에** 실행된다. 거기서 비우면 느린 회선에서 리페치가 끝나는 순간, 그 사이
     *   사용자가 타이핑해 둔 다음 댓글이 통째로 지워졌다.
     *   답글 대상도 함께 초기화하고, 실패하면 **둘 다** 되돌린다.
     */
    setContent("");
    onCancelReply();
    writeComment.mutate(
      { content: trimmed, parentId },
      {
        onError: () => setContent((current) => (current === "" ? trimmed : current)),
      },
    );
  };

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

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label htmlFor="comment-input" className="sr-only">
          {replyTo ? `${replyTo.nickname}에게 답글 입력` : "댓글 입력"}
        </label>
        <input
          id="comment-input"
          ref={inputRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setError(undefined);
          }}
          aria-invalid={error ? true : undefined}
          placeholder={replyTo ? "답글을 남겨보세요" : "한 줄 거들기"}
          className="h-10 flex-1 rounded-full border border-hairline bg-canvas-soft px-3.5 text-[14px] text-ink outline-none transition-colors duration-150 ease-otb placeholder:text-ink-faint focus:border-ink focus:bg-canvas"
        />
        <button
          type="submit"
          aria-label={replyTo ? "답글 등록" : "댓글 등록"}
          // isPending은 무효화 리페치가 끝날 때까지 유지된다 → 연타로 중복 등록되지 않는다
          disabled={writeComment.isPending || !content.trim()}
          // 40px 원형은 프로토타입 치수다 — 히트 영역만 투명 의사요소로 44px까지 넓힌다
          className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-colors duration-150 ease-otb after:absolute after:-inset-0.5 after:content-[''] disabled:bg-hairline disabled:text-ink-faint"
        >
          <Icon as={ArrowUp} size={18} />
        </button>
      </form>

      {(error ?? writeComment.error) && (
        <p role="alert" className="mt-1.5 text-[12px] text-crimson">
          {error ?? writeComment.error?.message}
        </p>
      )}
    </>,
  );
}

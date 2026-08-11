"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, CornerDownRight, X } from "lucide-react";
import { signInWithNext } from "@/shared/config";
import { Icon, buttonClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { useWriteComment, validateComment } from "@/features/write-comment";

export interface ReplyTarget {
  commentId: number;
  nickname: string;
}

interface CommentBarProps {
  postId: number;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  /**
   * 전송 실패로 되돌릴 때 답글 대상을 복원한다.
   * ⚠ 입력창 복구만 있으면 재전송이 **루트 댓글로 등록된다** — 아래 handleSubmit 주석 참고.
   */
  onRestoreReply: (target: ReplyTarget) => void;
}

/**
 * 하단 고정 댓글 입력 (프로토타입 `.cm-cmt-input`).
 *
 * 알약형 인풋은 "버튼 6px 라운드" 규칙의 명시적 예외 4곳 중 하나다.
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
  const writeComment = useWriteComment(postId);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 최신 입력값 — 전송 실패 콜백이 "그 사이 사용자가 새로 입력했는지"를 판정하는 데 쓴다.
   * 콜백은 렌더 밖(뮤테이션 완료 시점)에서 도므로 클로저의 content로는 알 수 없다.
   */
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

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

    /**
     * 빈 값·길이 판정은 전부 features의 validateComment가 소유한다
     * (게시글의 validatePost·닉네임의 validateNickname과 같은 형태).
     *
     * ⚠ 조용히 return하지 않는다 — 버튼 활성 조건은 `content.trim()`이라 눌리기는 하는데
     *   아무 일도 안 일어나면 고장으로 읽힌다.
     * ⚠ input에 maxLength를 걸면 브라우저가 UTF-16 코드유닛으로 세어
     *   이모지 댓글이 한도의 절반에서 **아무 안내 없이 잘린다.**
     * ⚠ 여기는 handleSubmit 안(제출 1회)이라 그래핌 계산의 렌더 성능 영향이 없다.
     */
    const invalid = validateComment(trimmed);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(undefined);

    submittingRef.current = true;
    const target = replyTo;
    const parentId = target?.commentId ?? null;

    /**
     * ⚠ 입력창은 **제출 즉시** 비운다.
     *   `mutate(..., { onSuccess })`의 콜백은 훅의 onSuccess(무효화 3건 Promise)를 await한
     *   **뒤에** 실행된다. 거기서 비우면 느린 회선에서 리페치가 끝나는 순간, 그 사이
     *   사용자가 타이핑해 둔 다음 댓글이 통째로 지워졌다.
     *   답글 대상도 함께 초기화하고, 실패하면 **둘 다** 되돌린다.
     *
     * ⚠⚠ **답글 대상 복원을 빠뜨리면 안 된다.** 전에는 입력창만 되돌려서,
     *   답글 전송이 실패한 뒤 사용자가 그대로 다시 보내면 parentId가 null이 되어
     *   **답글이 루트 댓글로 등록됐다**(화면에도 아무 단서가 없다).
     */
    setContent("");
    // ⚠ ref도 **동기로** 비운다. 뮤테이션이 즉시 실패하면(예: env 미설정으로 클라이언트 생성
    //   실패) onError가 위 setContent의 커밋보다 먼저 돌아, 동기화 effect가 아직 안 뛴
    //   ref에는 옛 값이 남아 "사용자가 새로 입력했다"로 오판한다.
    contentRef.current = "";
    onCancelReply();
    writeComment.mutate(
      { content: trimmed, parentId },
      {
        onError: () => {
          // 그 사이 사용자가 새로 입력했다면 덮지 않는다 — 대상도 **같은 기준으로 함께** 판단한다.
          // ⚠ 판정을 setContent 업데이터 안에서 하면 안 된다. 업데이터는 순수해야 하고
          //   StrictMode에서 두 번 불릴 수 있어 onRestoreReply가 중복 실행된다 → ref로 읽는다.
          if (contentRef.current !== "") return;
          setContent(trimmed);
          if (target) onRestoreReply(target);
        },
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
            // ⚠ 뮤테이션 에러는 다음 mutate까지 남는다 — 다시 입력하는 순간 지워야
            //   이미 해소된 실패 문구가 계속 떠 있지 않다.
            if (writeComment.error) writeComment.reset();
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

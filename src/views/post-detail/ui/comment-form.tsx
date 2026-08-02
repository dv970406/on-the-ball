"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signInWithNext } from "@/shared/config";
import { Button, buttonClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { COMMENT_MAX, useWriteComment } from "@/features/write-comment";

export function CommentForm({ postId }: { postId: number }) {
  const status = useSessionStore((s) => s.status);
  const pathname = usePathname();
  const writeComment = useWriteComment(postId);
  const [content, setContent] = useState("");

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

  if (status === "loading") return null;

  if (status === "guest") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-sm border border-hairline bg-canvas-soft px-4 py-3">
        <p className="text-[13px] text-ink-mute">댓글을 쓰려면 로그인이 필요해요.</p>
        <Link
          href={signInWithNext(pathname)}
          className={buttonClassName({ variant: "secondary", size: "sm" })}
        >
          로그인
        </Link>
      </div>
    );
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const trimmed = content.trim();
    if (!trimmed) return;

    submittingRef.current = true;
    writeComment.mutate(trimmed, { onSuccess: () => setContent("") });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="comment-input" className="sr-only">
        댓글 입력
      </label>
      <textarea
        id="comment-input"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={COMMENT_MAX}
        rows={3}
        placeholder="댓글을 남겨보세요"
        className="w-full resize-y rounded-sm border border-hairline-strong bg-canvas px-3 py-2.5 text-[14px] leading-[1.6] text-ink transition-colors duration-150 ease-otb placeholder:text-ink-faint focus:border-ink focus:outline-none"
      />

      {writeComment.error && (
        <p role="alert" className="text-[12px] text-crimson">
          {writeComment.error.message}
        </p>
      )}

      <Button
        type="submit"
        size="sm"
        className="self-end"
        // isPending은 무효화 리페치가 끝날 때까지 유지된다 → 연타로 중복 등록되지 않는다
        disabled={writeComment.isPending || !content.trim()}
      >
        {writeComment.isPending ? "등록 중…" : "댓글 등록"}
      </Button>
    </form>
  );
}

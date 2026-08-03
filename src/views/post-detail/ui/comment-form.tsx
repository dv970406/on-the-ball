"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signInWithNext } from "@/shared/config";
import { codePointLength, hasVisibleChar } from "@/shared/lib";
import { Button, Skeleton, buttonClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { COMMENT_MAX, useWriteComment } from "@/features/write-comment";

export function CommentForm({ postId }: { postId: number }) {
  const status = useSessionStore((s) => s.status);
  const pathname = usePathname();
  const writeComment = useWriteComment(postId);
  const [content, setContent] = useState("");
  const [lengthError, setLengthError] = useState<string>();

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

  // 세션 판정 전에 null을 돌려주면 폼 자리가 0px였다가 나중에 나타나 레이아웃이 튄다
  if (status === "loading") return <Skeleton className="h-[124px] w-full rounded-sm" />;

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
    // 제로폭 문자만 있는 댓글도 걸러낸다(화면에 아무것도 안 보이는 댓글이 등록됐다).
    // ⚠ 조용히 return하지 않는다 — 버튼 활성 조건은 `content.trim()`이라 눌리기는 하는데
    //   아무 일도 안 일어나면 고장으로 읽힌다.
    if (!hasVisibleChar(trimmed)) {
      setLengthError("내용을 입력해 주세요.");
      return;
    }

    /**
     * 길이·빈 값 판정은 게시글 폼과 **같은 기준**을 쓴다(DB CHECK와도 같은 단위).
     * ⚠ textarea에 maxLength를 걸면 브라우저가 UTF-16 코드유닛으로 세어
     *   이모지 댓글이 한도의 절반에서 **아무 안내 없이 잘린다.**
     */
    if (codePointLength(trimmed) > COMMENT_MAX) {
      setLengthError(`댓글은 ${COMMENT_MAX}자까지 쓸 수 있어요.`);
      return;
    }
    setLengthError(undefined);

    submittingRef.current = true;
    /**
     * ⚠ 입력창은 **제출 즉시** 비운다.
     *   `mutate(..., { onSuccess })`의 콜백은 훅의 onSuccess(무효화 3건 Promise)를 await한
     *   **뒤에** 실행된다(query-core 2.101 mutation → mutationObserver 순서). 거기서 비우면
     *   느린 회선에서 리페치가 끝나는 순간, 그 사이 사용자가 타이핑해 둔 다음 댓글이
     *   통째로 지워졌다. 등록된 내용은 이미 목록에 뜨므로 남겨 둘 이유도 없다.
     * 실패하면 되돌려준다 — 단, 그 사이 새로 쓴 게 있으면 그쪽을 지키지 않는다.
     */
    setContent("");
    writeComment.mutate(trimmed, {
      onError: () => setContent((current) => (current === "" ? trimmed : current)),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="comment-input" className="sr-only">
        댓글 입력
      </label>
      <textarea
        id="comment-input"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setLengthError(undefined);
        }}
        aria-invalid={lengthError ? true : undefined}
        rows={3}
        placeholder="댓글을 남겨보세요"
        className="w-full resize-y rounded-sm border border-hairline-strong bg-canvas px-3 py-2.5 text-[14px] leading-[1.6] text-ink transition-colors duration-150 ease-otb placeholder:text-ink-faint focus:border-ink focus:outline-none"
      />

      {(lengthError ?? writeComment.error) && (
        <p role="alert" className="text-[12px] text-crimson">
          {lengthError ?? writeComment.error?.message}
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

"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useDuplicateGuard } from "@/shared/lib";
import { useWriteComment, validateComment } from "@/features/write-comment";
import type { ReplyTarget } from "./reply-target";

/**
 * 댓글·답글 입력 조립 — 입력값, 검증, 낙관적 초기화와 실패 롤백.
 *
 * ⚠ **`content`를 그대로 노출하지 않는다.** 아래 `contentRef`와의 동기성 규약이 호출부로
 *   새면 안 되기 때문이다. 입력창에는 `inputProps`를 그대로 펼친다.
 *
 * ⚠ **가드가 `useWriteComment`가 아니라 여기 있는 이유**: 실패 롤백이 입력창 값·답글 대상
 *   같은 **화면의 상태**를 되돌린다. features로 내리면 하위 레이어가 상위의 UI를 알게 된다.
 */
export function useCommentComposer(
  postId: number,
  replyTo: ReplyTarget | null,
  onCancelReply: () => void,
  onRestoreReply: (target: ReplyTarget) => void,
) {
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

  const guard = useDuplicateGuard(writeComment.isPending);

  // 답글 모드로 들어가면 바로 쓸 수 있게 포커스를 옮긴다
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    setError(undefined);
    // ⚠ 뮤테이션 에러는 다음 mutate까지 남는다 — 다시 입력하는 순간 지워야
    //   이미 해소된 실패 문구가 계속 떠 있지 않다.
    if (writeComment.error) writeComment.reset();
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (guard.isLocked()) return;

    const trimmed = content.trim();

    /**
     * 빈 값·길이 판정은 전부 features의 validateComment가 소유한다
     * (게시글의 validatePost·닉네임의 validateNickname과 같은 형태).
     *
     * ⚠ 조용히 return하지 않는다 — 버튼 활성 조건은 `content.trim()`이라 눌리기는 하는데
     *   아무 일도 안 일어나면 고장으로 읽힌다.
     * ⚠ input에 maxLength를 걸면 브라우저가 UTF-16 코드유닛으로 세어
     *   이모지 댓글이 한도의 절반에서 **아무 안내 없이 잘린다.**
     * ⚠ 여기는 제출 1회라 그래핌 계산의 렌더 성능 영향이 없다.
     * ⚠ **검증 실패에서는 잠그지 않는다** — 잠그면 mutate가 없어 `isPending`이 돌지 않고
     *   자물쇠가 영영 풀리지 않는다(use-duplicate-guard 주석).
     */
    const invalid = validateComment(trimmed);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(undefined);

    guard.lock();
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

  return {
    /** 입력창에 그대로 펼친다 (`use-sheet-drag`의 grabberProps와 같은 형태) */
    inputProps: {
      ref: inputRef,
      value: content,
      onChange: handleChange,
      // ⚠ 로컬 검증 실패에만 붙인다 — 서버 에러는 아래 error 문구가 알린다
      "aria-invalid": error ? true : undefined,
    },
    /** 로컬 검증 문구 ?? 서버 에러 문구 */
    error: error ?? writeComment.error?.message,
    /** isPending은 무효화 리페치가 끝날 때까지 유지된다 → 연타로 중복 등록되지 않는다 */
    canSubmit: !writeComment.isPending && content.trim().length > 0,
    onSubmit: handleSubmit,
  };
}

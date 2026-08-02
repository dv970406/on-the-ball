"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, MarkdownEditor, TextField } from "@/shared/ui";
import {
  CONTENT_MAX,
  TITLE_MAX,
  validatePost,
  type PostFieldErrors,
  type PostInput,
} from "../model/post-schema";

interface PostFormProps {
  initial?: PostInput;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  /** 훅이 한국어로 바꿔 던진 서버 에러 */
  error?: Error | null;
  /**
   * ⚠ **반드시 `isPending`을 토글하는 뮤테이션을 시작해야 한다.**
   *   중복 제출 가드가 자기가 잠근 자물쇠를 `isPending`이 false로 돌아올 때 푼다.
   *   mutate하지 않고 반환하면 버튼은 활성인데 클릭이 무시되는 무증상 잠금이 된다.
   */
  onSubmit: (input: PostInput) => void;
}

/** 작성·수정 공용 폼 — 두 화면이 같은 필드·같은 검증을 쓰므로 한 곳에 둔다 */
export function PostForm({
  initial,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  onSubmit,
}: PostFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [fieldErrors, setFieldErrors] = useState<PostFieldErrors>({});

  /**
   * 중복 제출 동기 가드.
   *
   * ⚠ `disabled={isPending}`만으로는 못 막는다. isPending은 **렌더 이후에야** DOM에
   *   반영되는데, TanStack Query의 상태 변경은 마이크로태스크로 배치되므로
   *   첫 클릭과 거의 동시에 들어온 두 번째 클릭은 아직 enabled인 버튼을 누른다.
   *   실측에서 3연타 → 같은 글 3개가 실제로 생성됐다.
   *   ref는 렌더를 기다리지 않으므로 같은 tick의 연타도 막는다.
   */
  const submittingRef = useRef(false);

  // 제출이 끝나면(성공·실패 무관) 다시 열어준다
  useEffect(() => {
    if (!isPending) submittingRef.current = false;
  }, [isPending]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const result = validatePost({ title, content });
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setFieldErrors({});
    submittingRef.current = true;
    onSubmit(result.value);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 py-5">
      <TextField
        label="제목"
        name="title"
        maxLength={TITLE_MAX}
        placeholder="제목을 입력하세요"
        value={title}
        error={fieldErrors.title}
        onChange={(e) => {
          setTitle(e.target.value);
          setFieldErrors((prev) => ({ ...prev, title: undefined }));
        }}
      />

      <MarkdownEditor
        label="내용 (마크다운)"
        value={content}
        maxLength={CONTENT_MAX}
        placeholder={"# 제목\n\n**굵게**, *기울임*, `코드`\n\n- 목록\n- 항목"}
        error={fieldErrors.content}
        onChange={(next) => {
          setContent(next);
          setFieldErrors((prev) => ({ ...prev, content: undefined }));
        }}
      />

      {error && (
        <p role="alert" className="text-[13px] leading-[1.5] text-crimson">
          {error.message}
        </p>
      )}

      <Button type="submit" block disabled={isPending}>
        {isPending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

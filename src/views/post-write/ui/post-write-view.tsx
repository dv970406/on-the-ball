"use client";

import { PostForm } from "@/features/write-post";
import { usePostSubmit } from "../model/use-post-submit";

/**
 * 글쓰기 화면. 헤더·툴바·이탈 방어까지 PostForm이 한 덩어리로 갖는다
 * (헤더의 `등록` 버튼이 곧 폼의 submit이라 분리하면 form 밖의 버튼이 된다).
 *
 * ⚠ **뮤테이션 조립·중복 제출 가드·성공 후 이동은 `usePostSubmit`이 갖는다.** 폼도 이 뷰도
 *   아닌 이유는 그 훅 주석에 모여 있다(`code-quality.md`: 뮤테이션과 그 방어, 성공 이후의
 *   부수효과 조립은 컴포넌트에 두지 않는다).
 */
export function PostWriteView() {
  const { submit, cancel, isPending, error } = usePostSubmit();

  return (
    <PostForm
      mode="create"
      isPending={isPending}
      error={error}
      onCancel={cancel}
      onSubmit={submit}
    />
  );
}

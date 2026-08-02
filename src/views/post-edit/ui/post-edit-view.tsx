"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { EmptyState, Skeleton } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { usePostQuery } from "@/entities/post";
import { useSessionStore } from "@/entities/session";
import { PostForm, useUpdatePost } from "@/features/write-post";

export function PostEditView({ postId }: { postId: number }) {
  const router = useRouter();
  const { data: post, isPending, error } = usePostQuery(postId);
  const updatePost = useUpdatePost(postId);
  const user = useSessionStore((s) => s.user);

  /**
   * 분기가 5개라 껍데기를 각 분기에 복붙하지 않는다.
   * SubHeader의 타이틀은 heading이 아니라 크롬이므로 페이지 heading을 따로 둔다.
   */
  const shell = (body: ReactNode) => (
    <>
      <SubHeader title="글 수정" fallbackHref={ROUTES.post(postId)} />
      <main>
        <h1 className="sr-only">글 수정</h1>
        {body}
      </main>
    </>
  );

  if (isPending) {
    return shell(
      <div className="flex flex-col gap-5 px-5 py-5">
        <Skeleton className="h-[72px] w-full" />
        <Skeleton className="h-[320px] w-full" />
      </div>,
    );
  }

  if (error) {
    return shell(<EmptyState title="글을 불러오지 못했어요" description={error.message} />);
  }

  if (!post) {
    return shell(<EmptyState title="글을 찾을 수 없어요" description="삭제되었을 수 있어요." />);
  }

  // 화면 차단은 안내용이다 — 실제 방어는 RLS이고, 우회해도 update가 0행이 되어 훅이 에러로 승격한다
  if (post.authorId !== user?.id) {
    return shell(
      <EmptyState title="수정 권한이 없어요" description="본인이 쓴 글만 수정할 수 있어요." />,
    );
  }

  return shell(
    <PostForm
      initial={{ title: post.title, content: post.content }}
      submitLabel="수정하기"
      pendingLabel="수정 중…"
      isPending={updatePost.isPending}
      error={updatePost.error}
      onSubmit={(input) =>
        updatePost.mutate(input, {
          onSuccess: () => router.replace(ROUTES.post(postId)),
        })
      }
    />,
  );
}

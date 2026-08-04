"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { EmptyState, Skeleton, useToast } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { usePostQuery } from "@/entities/post";
import { useSessionStore } from "@/entities/session";
import { PostForm, useUpdatePost } from "@/features/write-post";

export function PostEditView({ postId }: { postId: number }) {
  const router = useRouter();
  const { data: post, isPending, error } = usePostQuery(postId);
  const updatePost = useUpdatePost(postId);
  const user = useSessionStore((s) => s.user);
  const toast = useToast();

  /**
   * 폼을 그리지 못하는 분기(로딩·에러·권한)의 껍데기.
   * 정상 경로에서는 PostForm이 자체 헤더를 갖지만, 이 분기들에는 폼이 없어
   * 뒤로 갈 수단이 필요하므로 SubHeader를 쓴다.
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

  /**
   * ⚠ 캐시에 글이 있으면 에러 화면으로 갈아치우지 않는다.
   *   여기서 PostForm이 언마운트되면 **작성 중이던 제목·본문이 복구 불가능하게 사라진다**
   *   (PostForm이 useState로 들고 있다). 리페치 실패는 폼을 유지한 채 배너로만 알린다.
   */
  if (error && !post) {
    return shell(<EmptyState live title="글을 불러오지 못했어요" description={error.message} />);
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

  return (
    <>
      {error && (
        <p
          role="status"
          className="absolute inset-x-0 top-0 z-30 border-b border-hairline bg-canvas-soft px-5 py-2.5 text-[12px] text-ink-mute"
        >
          최신 내용을 불러오지 못했어요. 그대로 저장하면 다른 곳에서 수정된 내용을 덮어쓸 수 있어요.
        </p>
      )}
      <PostForm
        mode="edit"
        initial={{ category: post.category, title: post.title, content: post.content }}
        isPending={updatePost.isPending}
        error={updatePost.error}
        // 수정 모드는 이탈 확인 없이 바로 상세로 복귀한다(원본이 남아 있다)
        onCancel={() => router.replace(ROUTES.post(postId))}
        onSubmit={(input) =>
          updatePost.mutate(input, {
            onSuccess: () => {
              router.replace(ROUTES.post(postId));
              toast("수정했어요");
            },
          })
        }
      />
    </>
  );
}

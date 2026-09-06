"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { useDuplicateGuard, useToast } from "@/shared/lib";
import {
  useAdminDeletePost,
  useAdminRestorePost,
  useEditPostPoll,
  useMaskPost,
  useStripPostImages,
  useUnmaskPost,
} from "@/features/admin-post";

/**
 * 글 관리의 부수효과 조립.
 *
 * ⚠ **어느 것이 되돌릴 수 있는지가 다르다.**
 *   이미지 제거는 Storage 파일까지 지워 되돌릴 수 없고, 본문 가리기는 원본이
 *   `post_moderation`에 남아 되돌릴 수 있으며, 삭제는 소프트라 복구된다.
 *   화면이 그 차이를 문구로 말해야 해서 확인 대화상자의 소유도 여기가 아니라 뷰다.
 * ⚠ 가드는 **뮤테이션을 조립하는 이 자리**가 갖는다(행이 사라지는 조치들이다).
 * ⚠ 액션을 `actions` **묶음 하나로** 돌려준다 — 여섯 개를 그대로 펼치면 반환값이 여덟이 되어
 *   "반환값은 여섯 개를 넘지 않는다"에 걸린다(`code-quality.md`). 여섯이 한 화면의 조치
 *   목록이라 한 값을 두고 다투지 않으므로 묶는 것이 맞고, 훅을 쪼갤 자리는 아니다.
 */
export function usePostModeration(postId: number) {
  const strip = useStripPostImages(postId);
  const mask = useMaskPost(postId);
  const unmask = useUnmaskPost(postId);
  const remove = useAdminDeletePost();
  const restore = useAdminRestorePost();
  const editPoll = useEditPostPoll(postId);

  const stripGuard = useDuplicateGuard(strip);
  const maskGuard = useDuplicateGuard(mask);
  const unmaskGuard = useDuplicateGuard(unmask);
  const removeGuard = useDuplicateGuard(remove);
  const restoreGuard = useDuplicateGuard(restore);
  const pollGuard = useDuplicateGuard(editPoll);

  const toast = useToast();
  const router = useRouter();
  const [error, setError] = useState<Error | null>(null);

  const actions = {
    stripImages: (urls: string[] | null) => {
      if (stripGuard.isLocked()) return;
      stripGuard.lock();
      setError(null);
      strip.mutate(urls, {
        onSuccess: (removed) => toast(`이미지 ${removed.length}장을 뺐어요`),
        onError: setError,
      });
    },
    mask: (reason: string) => {
      if (maskGuard.isLocked()) return;
      maskGuard.lock();
      setError(null);
      mask.mutate(reason, {
        onSuccess: () => toast("본문을 가렸어요"),
        onError: setError,
      });
    },
    unmask: () => {
      if (unmaskGuard.isLocked()) return;
      unmaskGuard.lock();
      setError(null);
      unmask.mutate(undefined, {
        onSuccess: () => toast("본문을 되돌렸어요"),
        onError: setError,
      });
    },
    remove: () => {
      if (removeGuard.isLocked()) return;
      removeGuard.lock();
      setError(null);
      remove.mutate(postId, {
        onSuccess: () => {
          // 삭제하면 이 화면에 남을 이유가 없다 — 목록으로 옮긴다(이동 자체가 성공 표시다)
          router.replace(ROUTES.adminPostList);
          toast("글을 삭제했어요");
        },
        onError: setError,
      });
    },
    restore: () => {
      if (restoreGuard.isLocked()) return;
      restoreGuard.lock();
      setError(null);
      restore.mutate(postId, {
        onSuccess: () => toast("글을 되돌렸어요"),
        onError: setError,
      });
    },
    editPoll: (question: string, options: { id: number; label: string }[]) => {
      if (pollGuard.isLocked()) return;
      pollGuard.lock();
      setError(null);
      editPoll.mutate({ question, options }, {
        onSuccess: () => toast("투표 문구를 저장했어요"),
        onError: setError,
      });
    },
  };

  return {
    actions,
    isPending:
      strip.isPending ||
      mask.isPending ||
      unmask.isPending ||
      remove.isPending ||
      restore.isPending ||
      editPoll.isPending,
    error,
  };
}

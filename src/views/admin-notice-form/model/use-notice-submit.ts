"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { useDuplicateGuard, useToast } from "@/shared/lib";
import { type NoticeInput, useCreateNotice, useUpdateNotice } from "@/features/admin-notice";

export function useNoticeCreate() {
  const create = useCreateNotice();
  const guard = useDuplicateGuard(create);
  const toast = useToast();
  const router = useRouter();

  return {
    submit: (input: NoticeInput) => {
      if (guard.isLocked()) return;
      guard.lock();
      create.mutate(input, {
        onSuccess: () => {
          // 이동 자체가 성공 표시다 — 리페치를 기다릴 이유가 없다
          router.replace(ROUTES.adminNoticeList);
          toast("공지를 등록했어요");
        },
      });
    },
    isPending: create.isPending,
    error: create.error,
  };
}

export function useNoticeUpdate(noticeId: number) {
  const update = useUpdateNotice(noticeId);
  const guard = useDuplicateGuard(update);
  const toast = useToast();

  return {
    // 수정은 화면에 머무른다 — 저장한 값이 그대로 보이는 편이 확인에 낫다
    submit: (input: NoticeInput) => {
      if (guard.isLocked()) return;
      guard.lock();
      update.mutate(input, { onSuccess: () => toast("공지를 저장했어요") });
    },
    isPending: update.isPending,
    error: update.error,
  };
}

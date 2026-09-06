"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { noticeKeys } from "@/entities/notice";
import type { NoticeInput } from "../lib/notice-schema";

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: noticeKeys.all });
}

/** ⚠ 비운 값은 키를 빼서 DB 기본값(지금부터 / 무기한)을 쓰게 한다 */
function timeArgs(input: NoticeInput) {
  return {
    ...(input.opensAt === null ? {} : { p_opens_at: input.opensAt }),
    ...(input.closesAt === null ? {} : { p_closes_at: input.closesAt }),
  };
}

export function useCreateNotice() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: NoticeInput): Promise<number> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase.rpc("admin_create_notice", {
        p_type: input.type,
        p_title: input.title,
        p_body: input.body,
        ...timeArgs(input),
      });
      if (error) {
        console.error("[admin-notice] 공지 등록 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data;
    },
    // 성공하면 목록으로 떠나므로 Promise를 반환하지 않는다(이동 자체가 성공 표시다)
    onSuccess: () => {
      invalidate(queryClient);
    },
    onError: (error) => toast(error.message),
  });
}

/**
 * ⚠ **전체 치환이다.** 부분 갱신(null=안 바꿈)으로 두면 `closesAt`을 무기한으로 되돌릴
 *   방법이 사라진다 — RPC 시그니처가 그 결정을 담고 있다.
 */
export function useUpdateNotice(noticeId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: NoticeInput) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_update_notice", {
        p_id: noticeId,
        p_type: input.type,
        p_title: input.title,
        p_body: input.body,
        ...timeArgs(input),
      });
      if (error) {
        console.error("[admin-notice] 공지 수정 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

export function useDeleteNotice() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (noticeId: number) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_soft_delete_notice", { p_id: noticeId });
      if (error) {
        console.error("[admin-notice] 공지 삭제 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

export function useRestoreNotice() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (noticeId: number) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_restore_notice", { p_id: noticeId });
      if (error) {
        console.error("[admin-notice] 공지 복구 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

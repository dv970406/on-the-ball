"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { postKeys } from "@/entities/post";
import type { PostInput } from "./post-schema";

/** 글 수정 — 본인 글만. updated_at은 DB 트리거가 찍는다(클라가 보내지 않는다) */
export function useUpdatePost(postId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, content }: PostInput) => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("post")
        .update({ title, content })
        .eq("id", postId)
        .select("id");

      if (error) {
        console.error("[post] 수정 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      // ⚠ RLS 위반은 에러가 아니라 0행으로 조용히 지나간다(UPDATE의 USING은 필터로 동작).
      //   영향 행 수를 직접 확인해 에러로 승격하지 않으면 "수정됐다"고 거짓말하게 된다.
      //   (수정은 새 행도 SELECT 정책을 통과하므로 returning이 정상 동작한다 —
      //    소프트 삭제가 RPC여야 했던 것과 대비되는 지점)
      if (data.length === 0) throw new Error("수정 권한이 없거나 삭제된 글이에요.");
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) }),
      ]),
  });
}

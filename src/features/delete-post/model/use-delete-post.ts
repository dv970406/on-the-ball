"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { postKeys } from "@/entities/post";

/**
 * 게시글 삭제 — 소프트 삭제(deleted_at)다.
 *
 * ⚠ 클라이언트가 직접 `update({ deleted_at })`을 할 수 없다.
 *   Postgres가 UPDATE의 새 행에도 SELECT 정책을 적용하는데, deleted_at을 채운 행은
 *   post_select_alive("deleted_at is null")를 통과하지 못해 거부된다.
 *   그래서 SECURITY DEFINER RPC로 내렸고, 덕분에 권한 없음이 0행 침묵이 아니라
 *   예외(P0001 + 한국어 메시지)로 올라온다.
 *   (42501은 Postgres 자신의 영어 권한 거부용이다 — api-and-db.md의 에러 코드 규약 참고)
 */
export function useDeletePost(postId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("soft_delete_post", { p_post_id: postId });
      if (error) {
        console.error("[post] 삭제 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    // ⚠ 무효화 Promise를 반환하지 않는다. 반환하면 상세 쿼리가 먼저 리페치되어 null이 되고,
    //   그 사이 "글을 찾을 수 없어요"가 깜빡인 뒤에야 화면 이동이 일어난다.
    //   여기서는 이동이 곧 성공 표시라 리페치 완료를 기다릴 이유가 없다.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: postKeys.all });
    },
    // 실패는 앱의 유일한 알림 채널로 보낸다 — 화면의 빨간 문구는 조건부로 마운트되는
    // 평문이라 스크린리더에 닿지 않는다(code-quality.md의 라이브 리전 절)
    onError: (error) => toast(error.message),
  });
}

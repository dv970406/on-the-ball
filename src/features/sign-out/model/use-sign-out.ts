"use client";

import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { toAuthErrorMessage } from "@/entities/session";

/**
 * 로그아웃.
 * 캐시 무효화는 SIGNED_OUT 이벤트를 받은 AuthProvider가 처리하므로 여기서 하지 않는다.
 */
export function useSignOut() {
  return useMutation({
    mutationFn: async () => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("[auth] 로그아웃 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
  });
}

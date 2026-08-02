"use client";

import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { toAuthErrorMessage } from "@/entities/session";

/**
 * 새 비밀번호 저장.
 *
 * 재설정 링크를 타고 들어오면 createBrowserClient의 detectSessionInUrl이 URL의 ?code=를
 * 자동 교환해 세션을 만들어 둔 상태다 — updateUser는 그 세션으로 동작한다.
 * ⚠ ?code=를 직접 파싱해 exchangeCodeForSession을 부르면 이중 교환으로 실패한다.
 */
export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (password: string) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error("[auth] 비밀번호 변경 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
  });
}

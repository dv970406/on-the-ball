"use client";

import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { toAuthErrorMessage } from "@/entities/session";

/**
 * 비밀번호 재설정 메일 요청.
 *
 * PKCE 흐름이라 code_verifier가 **이 브라우저의 쿠키**에 저장된다 →
 * 메일 링크도 같은 브라우저에서 열어야 교환이 성립한다(다른 브라우저면 bad_code_verifier).
 *
 * ⚠ redirectTo가 config.toml의 additional_redirect_urls에 없으면 supabase가 조용히
 *   site_url로 되돌려 보낸다("링크를 눌렀는데 홈으로 간다" 증상).
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (email: string) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${ROUTES.resetPassword}`,
      });
      if (error) {
        console.error("[auth] 재설정 메일 요청 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
  });
}

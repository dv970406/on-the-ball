"use client";

import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { toAuthErrorMessage } from "@/entities/session";

/**
 * 로그아웃.
 * 캐시 무효화는 SIGNED_OUT 이벤트를 받은 AuthProvider가 처리하므로 여기서 하지 않는다.
 *
 * ⚠ `scope: "local"`을 **명시한다.** supabase의 기본값은 `"global"`이라
 *   (auth-js 2.110 `signOut(options = { scope: 'global' })`) 폰에서 로그아웃하면
 *   데스크톱 세션까지 서버에서 revoke된다 — 사용자가 기대하지 않는 동작이고,
 *   남은 기기의 토큰은 만료 전이라 클라이언트만 로그인 상태로 남아
 *   서버 가드와 판정이 갈리는 상태(AuthProvider의 세션 검증 주석 참고)를 만든다.
 */
export function useSignOut() {
  return useMutation({
    mutationFn: async () => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        console.error("[auth] 로그아웃 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
  });
}

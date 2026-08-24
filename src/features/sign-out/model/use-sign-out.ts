"use client";

import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { clearSignOutIntent, markSignOutIntent, toAuthErrorMessage } from "@/entities/session";

/**
 * 로그아웃.
 * 캐시 무효화는 SIGNED_OUT 이벤트를 받은 `useSessionSync`가 처리하므로 여기서 하지 않는다.
 *
 * ⚠ `scope: "local"`을 **명시한다.** supabase의 기본값은 `"global"`이라
 *   (auth-js 2.110 `signOut(options = { scope: 'global' })`) 폰에서 로그아웃하면
 *   데스크톱 세션까지 서버에서 revoke된다 — 사용자가 기대하지 않는 동작이고,
 *   남은 기기의 토큰은 만료 전이라 클라이언트만 로그인 상태로 남아
 *   서버 가드와 판정이 갈리는 상태(`entities/session`의 `use-server-session-check` 주석)를 만든다.
 */
export function useSignOut() {
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const supabase = requireBrowserSupabase();
      // ⚠ **signOut을 부르기 전에** 찍는다 — SIGNED_OUT이 먼저 나가면 가드가 신호를 놓쳐
      //   로그인 필수 화면(`/profile`)에서 로그아웃한 사용자가 로그인 화면으로 되돌아간다.
      markSignOutIntent();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        // 세션이 그대로 남았으므로 신호도 버린다 — 두면 나중의 세션 만료가 로그아웃으로 오인된다
        clearSignOutIntent();
        console.error("[auth] 로그아웃 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
    /**
     * ⚠ 실패를 반드시 알린다. 로그아웃은 **성공하면 화면이 통째로 바뀌므로**, 실패했을 때
     *   버튼이 잠깐 흐려졌다 돌아오는 것 말고는 단서가 없어 "됐는지 안 됐는지 알 수 없는"
     *   상태가 된다. 공용 기기에서는 그 오해의 대가가 크다.
     */
    onError: (error) => toast(error.message),
  });
}

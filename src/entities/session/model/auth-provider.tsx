"use client";

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getBrowserSupabase } from "@/shared/api";
import { useSessionStore } from "./session-store";

/**
 * supabase 세션 ↔ zustand 스토어 동기화.
 *
 * onAuthStateChange는 구독 즉시 INITIAL_SESSION 이벤트를 발행하므로
 * getSession()을 따로 호출하지 않아도 "복원 완료" 시점을 알 수 있다.
 * (@supabase/auth-js 2.110 GoTrueClient 구현 확인)
 *
 * ⚠ QueryClientProvider 안쪽에 있어야 한다 — useQueryClient를 쓴다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const applySession = useSessionStore((s) => s.applySession);
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      // env 미설정 — loading에 갇히면 모든 화면이 영원히 스켈레톤이 된다. guest로 확정.
      applySession(null);
      return;
    }

    // ⚠ 콜백을 async로 만들지 않는다.
    //   @supabase/auth-js 2.110에서 async 오버로드는 @deprecated이며,
    //   TOKEN_REFRESHED 처리 중 중첩 리프레시가 나면 데드락된다.
    //   콜백 안에서 supabase.auth.*를 다시 호출하는 것도 같은 이유로 금지.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      applySession(session);

      // 로그인·로그아웃 시 개인화된 데이터(isLiked, 내 글 여부)를 전량 리싱크한다.
      // TOKEN_REFRESHED·INITIAL_SESSION은 유저가 바뀐 게 아니므로 제외 — 무효화하면
      // 토큰 갱신마다 화면 전체가 리페치된다.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void queryClient.invalidateQueries();
      }
    });

    return () => subscription.unsubscribe();
  }, [applySession, queryClient]);

  return children;
}

"use client";

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAuthApiError } from "@supabase/supabase-js";
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
  const userId = useSessionStore((s) => s.user?.id);
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
      applySession(session, event);

      // 로그인·로그아웃 시 개인화된 데이터(isLiked, 내 글 여부)를 전량 리싱크한다.
      // TOKEN_REFRESHED·INITIAL_SESSION은 유저가 바뀐 게 아니므로 제외 — 무효화하면
      // 토큰 갱신마다 화면 전체가 리페치된다.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // ⚠ invalidateQueries만으로는 부족하다. 기본 refetchType이 "active"라
        //   **언마운트된(비활성) 쿼리는 stale 표시만 되고 데이터가 그대로 남는다.**
        //   그래서 A로 보던 글 상세를 떠났다가 B로 로그인하면 A의 isLiked가 한 프레임 노출됐다.
        //   비활성 캐시는 지우고(다시 열 때 새로 받는다), 활성 캐시만 무효화해
        //   화면 깜빡임 없이 리페치한다.
        queryClient.removeQueries({ type: "inactive" });
        void queryClient.invalidateQueries();
      }
    });

    return () => subscription.unsubscribe();
  }, [applySession, queryClient]);

  /**
   * 서버에게 세션이 아직 유효한지 물어본다(로그인 상태가 될 때 1회).
   *
   * ⚠ 이게 없으면 **서버와 클라이언트의 판정이 갈려 무한 리다이렉트에 빠진다.**
   *   proxy는 getUser()로 GoTrue에 물어보지만 클라이언트는 쿠키의 expires_at만 로컬 검사한다.
   *   다른 기기에서 로그아웃하거나 계정이 삭제되면 토큰은 만료 전인데 서버는 403을 준다 →
   *   proxy가 /posts/new → /sign-in으로 보내고, GuestOnly는 여전히 authenticated라 보고
   *   다시 /posts/new로 보낸다. 탈출 수단 없이 계속 왕복한다.
   *
   * getUser()가 session_not_found를 받으면 auth-js가 스스로 세션을 지우고 SIGNED_OUT을
   * 발행하므로(2.110 `_getUser`의 AuthSessionMissingError 분기 — 실측 확인) 대부분은
   * 이 호출만으로 정리된다. 그 밖의 서버 거부(JWT 시크릿 회전 등)는 직접 정리한다.
   *
   * ⚠ **"에러면 로그아웃"으로 넓게 잡으면 안 된다.** 세션을 폐기하는 건
   *   서버가 이 세션을 명시적으로 부정했을 때(401/403)뿐이다. 그 밖의 실패는
   *   세션과 무관한 사정이라 멀쩡한 로그인을 날려버린다:
   *     429 rate limit — 탭을 여러 개 열거나 새로고침을 반복하면 실제로 도달한다
   *     캡티브 포털·사내 프록시의 비-JSON 응답 → AuthUnknownError
   *     WAF의 403 챌린지 페이지 — 이건 걸러지지 않지만 401/403 제한으로도 범위가 훨씬 좁다
   *   (`isAuthRetryableFetchError`는 5xx와 fetch 실패만 커버해서 이것만으로는 부족하다)
   */
  useEffect(() => {
    if (!userId) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    let cancelled = false;
    void supabase.auth.getUser().then(({ error }) => {
      if (cancelled || !error) return;
      const rejectedByServer =
        isAuthApiError(error) && (error.status === 401 || error.status === 403);
      if (!rejectedByServer) return;
      console.error("[auth] 서버가 세션을 거부했습니다 — 로컬 세션을 정리합니다:", error);
      void supabase.auth.signOut({ scope: "local" });
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return children;
}

"use client";

import { useEffect } from "react";
import { isAuthApiError } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/shared/api";
import { useSessionStore } from "./session-store";

/**
 * 서버에게 세션이 아직 유효한지 물어본다(로그인 상태가 될 때 1회).
 *
 * ⚠ 이게 없으면 **화면은 로그인 상태인데 모든 조회가 RLS에 막혀 실패한다.**
 *   서버는 getUser()로 GoTrue에 물어보지만 클라이언트는 쿠키의 expires_at만 로컬 검사한다.
 *   다른 기기에서 로그아웃하거나 계정이 삭제되면 토큰은 만료 전인데 서버는 403을 준다 →
 *   사용자는 자기가 로그인돼 있다고 믿는 채로 아무것도 못 하고, 스스로 빠져나올 방법이 없다.
 *   (proxy에 라우트 가드가 있던 시절에는 이 불일치가 무한 리다이렉트까지 갔다. 가드를
 *   걷어내 루프는 사라졌지만, 판정 불일치 자체는 남아 있어 이 확인이 여전히 필요하다.)
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
 *
 * ⚠ 정리는 `signOut({ scope: "local" })`이다 — 기본값 `"global"`로 두면 서버가 부정한 것이
 *   이 기기의 세션뿐인데 **다른 기기까지 함께 revoke**된다.
 */
export function useServerSessionCheck() {
  const userId = useSessionStore((s) => s.user?.id);

  useEffect(() => {
    if (!userId) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    let cancelled = false;
    supabase.auth.getUser().then(({ error }) => {
      if (cancelled || !error) return;
      const rejectedByServer =
        isAuthApiError(error) && (error.status === 401 || error.status === 403);
      if (!rejectedByServer) return;
      console.error("[auth] 서버가 세션을 거부했습니다 — 로컬 세션을 정리합니다:", error);
      supabase.auth.signOut({ scope: "local" });
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);
}

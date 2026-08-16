"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getBrowserSupabase } from "@/shared/api";
import { useSessionStore } from "./session-store";

/**
 * supabase 세션 ↔ zustand 스토어 동기화, 그리고 **유저가 바뀔 때의 캐시 리싱크**.
 *
 * `onAuthStateChange`는 구독 즉시 INITIAL_SESSION 이벤트를 발행하므로
 * `getSession()`을 따로 호출하지 않아도 "복원 완료" 시점을 알 수 있다.
 * (@supabase/auth-js 2.110 GoTrueClient 구현 확인)
 *
 * ⚠ `AuthProvider`를 통해서만 마운트된다 — 앱 전체에 **하나**여야 한다.
 *   두 번 부르면 구독이 둘이 되어 유저가 바뀔 때 전량 무효화가 두 번 돈다.
 * ⚠ `useQueryClient`를 쓰므로 `QueryClientProvider` 안쪽이어야 한다.
 */
export function useSessionSync() {
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
        // ⚠ invalidateQueries만으로는 부족하다. 기본 refetchType이 "active"라
        //   **언마운트된(비활성) 쿼리는 stale 표시만 되고 데이터가 그대로 남는다.**
        //   그래서 A로 보던 글 상세를 떠났다가 B로 로그인하면 A의 isLiked가 한 프레임 노출됐다.
        //   비활성 캐시는 지우고(다시 열 때 새로 받는다), 활성 캐시만 무효화해
        //   화면 깜빡임 없이 리페치한다.
        // ⚠ 활성 쿼리는 리페치가 끝날 때까지 옛 데이터를 들고 있으므로, 유저별 데이터를
        //   담는 키는 **userId로 스코프**해야 그 창에서도 남의 값이 보이지 않는다
        //   (`identityKeys`·`profileKeys`가 그렇게 되어 있다).
        queryClient.removeQueries({ type: "inactive" });
        void queryClient.invalidateQueries();
      }
    });

    return () => subscription.unsubscribe();
  }, [applySession, queryClient]);
}

"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getBrowserSupabase } from "@/shared/api";
import { rememberAuthProvider } from "../lib/last-auth-provider";
import { clearSignOutIntent } from "../lib/sign-out-intent";
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
  /**
   * 리싱크를 **다음 커밋으로 미루기 위한** 신호. 값 자체에는 뜻이 없고, 이 훅이 사는
   * `AuthProvider`를 한 번 더 렌더시키는 것이 목적이다(아래 리싱크 effect 주석).
   */
  const [resyncNonce, setResyncNonce] = useState(0);

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

      // 이번 세션이 어느 프로바이더로 섰는지 남긴다 — 로그인 화면의 "최근 사용" 배지가 읽는다.
      // ⚠ **이벤트를 가리지 않는다.** SIGNED_IN은 이미 로그인해 둔 사용자에게 다시 발행되지
      //   않고 복원은 INITIAL_SESSION으로 오므로, 그것까지 받아야 값이 채워진다.
      // ⚠ SIGNED_OUT은 session이 null이라 아무 일도 일어나지 않는다 — 로그아웃으로 지우면
      //   정작 필요한 순간(다시 왔을 때)에 값이 없다.
      rememberAuthProvider(session?.user.app_metadata.provider);

      // 가드가 소비하지 못한 로그아웃 신호를 여기서 버린다 — 가드가 없는 화면(목록)에서
      // 로그아웃하면 신호가 남고, 그대로 두면 다음 세션 만료가 "직접 로그아웃"으로 오인된다.
      if (event === "SIGNED_IN") clearSignOutIntent();

      // 로그인·로그아웃 시 개인화된 데이터(isLiked, 내 글 여부)를 전량 리싱크한다.
      // TOKEN_REFRESHED·INITIAL_SESSION은 유저가 바뀐 게 아니므로 제외 — 무효화하면
      // 토큰 갱신마다 화면 전체가 리페치된다.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setResyncNonce((n) => n + 1);
      }
    });

    return () => subscription.unsubscribe();
  }, [applySession]);

  /**
   * 캐시 리싱크 — **세션 변화가 화면에 반영된 다음 커밋에서** 돈다.
   *
   * ⚠ invalidateQueries만으로는 부족하다. 기본 refetchType이 "active"라
   *   **언마운트된(비활성) 쿼리는 stale 표시만 되고 데이터가 그대로 남는다.**
   *   그래서 A로 보던 글 상세를 떠났다가 B로 로그인하면 A의 isLiked가 한 프레임 노출됐다.
   *   비활성 캐시는 지우고(다시 열 때 새로 받는다), 활성 캐시만 무효화해
   *   화면 깜빡임 없이 리페치한다.
   * ⚠ 활성 쿼리는 리페치가 끝날 때까지 옛 데이터를 들고 있으므로, 유저별 데이터를
   *   담는 키는 **userId로 스코프**해야 그 창에서도 남의 값이 보이지 않는다
   *   (`identityKeys`·`profileKeys`가 그렇게 되어 있다).
   *
   * ⚠ **콜백 안에서 바로 부르면 안 된다.** `applySession`이 일으키는 리렌더는 비동기로
   *   배치되므로, 콜백 시점의 화면은 아직 **로그인 상태 그대로**다 — 로그인이 있어야만
   *   성립하는 활성 쿼리에까지 리페치가 나가고, 그 요청은 세션이 이미 사라졌으니 반드시
   *   실패한다(실측: 프로필에서 로그아웃하면 `useLinkedIdentitiesQuery`가
   *   `AuthSessionMissingError`로 죽어 콘솔에 실패로 찍혔다). `enabled`도 소용이 없다 —
   *   옵저버가 아직 낡은 props(userId 있음)로 살아 있기 때문이다.
   *   nonce를 거쳐 한 커밋 뒤로 미루면 그 쿼리들은 이미 언마운트되어(가드가 화면을
   *   스켈레톤으로 갈아치운다) **비활성 정리 대상**이 된다 — 실패할 요청 자체가 사라진다.
   * ⚠ 미뤄도 노출 시간은 늘지 않는다. 어차피 리페치가 끝날 때까지는 옛 데이터가 보이고,
   *   비활성 캐시 삭제는 다음 마운트보다 **먼저** 끝난다(같은 커밋의 정리 단계).
   */
  useEffect(() => {
    if (resyncNonce === 0) return; // 최초 마운트 — 리싱크할 이벤트가 아직 없다
    queryClient.removeQueries({ type: "inactive" });
    queryClient.invalidateQueries();
  }, [resyncNonce, queryClient]);
}

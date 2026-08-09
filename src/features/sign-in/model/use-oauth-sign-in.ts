"use client";

import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { ROUTES, withNext, type OAuthProvider } from "@/shared/config";
import { toAuthErrorMessage } from "@/entities/session";

/**
 * 소셜 로그인 시작 — 프로바이더 동의 화면으로 **페이지를 통째로 넘긴다.**
 *
 * ⚠ 이 훅에는 "성공" 상태가 없다. `signInWithOAuth`는 GoTrue를 호출하지 않고 authorize URL을
 *   만들어 `window.location`을 바꿀 뿐이라(auth-js 2.110 `_handleProviderSignIn`),
 *   성공하면 이 화면 자체가 사라진다. **프로바이더가 거부한 결과는 여기가 아니라 돌아온 URL의
 *   `?error=`로 온다** — 그 처리는 복귀 지점인 SignInView가 한다.
 *
 * ⚠ 돌아올 곳을 `/sign-in`으로 잡는 이유: `?code=` 교환은 createBrowserClient의
 *   detectSessionInUrl이 하고, 세션이 생기면 `GuestOnly`가 목적지를 정한다.
 *   "로그인 후 이동은 가드가 단독으로 소유한다"(data-and-state.md)를 그대로 지키려면
 *   전용 콜백 라우트를 만드는 것보다 이 편이 맞다 — 목적지 계산이 두 곳으로 갈리지 않는다.
 *
 * ⚠ `?next=`는 OAuth 왕복을 건너야 하므로 redirectTo에 실어 보낸다.
 *   돌아온 값의 검증은 `GuestOnly`의 `safeNextPath`가 이미 한다 — 여기서 또 짜지 않는다.
 */
export function useOAuthSignIn(next: string | null) {
  const mutation = useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}${withNext(ROUTES.signIn, next)}`,
        },
      });
      if (error) {
        console.error("[auth] 소셜 로그인 시작 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
  });

  /**
   * 중복 시작 동기 가드.
   *
   * ⚠ `disabled={isPending}`만으로는 막지 못한다 — `isPending`은 **렌더 이후에야** DOM에
   *   반영되는데 TanStack Query의 상태 변경은 마이크로태스크로 배치된다(data-and-state.md).
   *   여기서 겹치면 대가가 크다: `signInWithOAuth`는 호출마다 **새 code_verifier를 저장소에
   *   덮어쓴** 뒤 그 challenge를 담은 URL로 이동한다. 저장된 verifier(마지막 호출)와 실제로
   *   커밋된 내비게이션(다른 호출)이 어긋나면 돌아온 code를 교환할 수 없어 로그인이 실패한다.
   */
  const startingRef = useRef(false);
  useEffect(() => {
    if (!mutation.isPending) startingRef.current = false;
  }, [mutation.isPending]);

  const start = (provider: OAuthProvider) => {
    if (startingRef.current) return;
    startingRef.current = true;
    mutation.mutate(provider);
  };

  return { start, isPending: mutation.isPending, error: mutation.error };
}

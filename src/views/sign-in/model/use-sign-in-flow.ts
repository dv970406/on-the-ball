"use client";

import { useEffect, useState } from "react";
import { useNextParam } from "@/shared/lib";
import { useOAuthSignIn } from "@/features/sign-in";

/**
 * 코드 교환(네트워크 왕복 1회)을 기다릴 최대 시간.
 * ⚠ 상한이 **반드시 필요하다.** supabase는 교환에 실패해도 조용히 빠져나가므로
 *   (auth-js `_initialize`가 에러를 디버그 로그로만 남긴다) 앱이 실패를 알 방법이 이것뿐이다.
 */
const EXCHANGE_TIMEOUT_MS = 8000;

/**
 * 프로바이더가 실패를 돌려준 경우의 문구.
 * ⚠ 원문은 영어다. 사용자가 동의를 취소한 경우(access_denied)가 대부분이라 그것만 따로 옮기고,
 *   나머지는 원문을 함께 보여준다 — 삼키면 지원 문의에 아무 단서도 남지 않는다.
 * ⚠ `views/profile`에 같은 모양의 함수가 있지만 **공용화하지 않는다.** 사용처가 2회이고
 *   문구가 서로 다르다(로그인 vs 연결) — code-quality.md의 "중복 3회 이상일 때만 공용화".
 */
function toOAuthErrorMessage(code: string, description: string | null): string {
  if (code === "access_denied") return "로그인을 취소했어요.";
  return description ? `로그인하지 못했어요. (${description})` : "로그인하지 못했어요.";
}

/**
 * 소셜 로그인 시작과 복귀 판정.
 *
 * ⚠ **인자를 객체로 묶지 않는다** — 인라인 객체는 아래 effect의 deps를 매 렌더 새 참조로
 *   만들어 8초 타이머를 영원히 재시작시킨다.
 *
 * ⚠ 성공 후 이동은 여기서 하지 않는다 — 세션이 생기면 `GuestOnly`가 `?next=`를 읽어 목적지를
 *   정한다(data-and-state.md). 이 훅은 시작과 실패만 책임진다.
 */
export function useSignInFlow(
  hasCode: boolean,
  canExchange: boolean,
  errorCode: string | null,
  errorDescription: string | null,
) {
  // 인증 화면 진입 시 실린 목적지를 OAuth 왕복 너머까지 이어 붙인다.
  // ⚠ 이 값은 **렌더에 쓰이지 않는다**(클릭 시 redirectTo를 만들 때만 쓴다) → 서버/클라 차이가
  //   화면에 드러나지 않아 hasCode와 달리 서버에서 내려받을 이유가 없다.
  const next = useNextParam();
  const oauth = useOAuthSignIn(next);

  /**
   * 교환을 기다리는 시간의 상한.
   *
   * ⚠ 교환이 **시작조차 될 수 없는** 경우(verifier 없음)는 서버가 이미 판정해 내려주므로
   *   여기서 상한을 기다리지 않는다 — 그 8초는 통째로 버리는 시간이었다.
   */
  const [exchangeTimedOut, setExchangeTimedOut] = useState(false);
  useEffect(() => {
    if (!hasCode || !canExchange) return;
    const timer = setTimeout(() => setExchangeTimedOut(true), EXCHANGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hasCode, canExchange]);

  /**
   * ⚠ **`hasCode`가 반드시 앞에 와야 한다.** `canExchange`는 PKCE verifier 쿠키 유무인데,
   *   OAuth를 시작한 적 없는 브라우저에는 그 쿠키가 아예 없다(교환 후에도 삭제된다).
   *   그래서 `!canExchange`만 보면 **첫 방문·로그아웃 후 재방문·`?next=` 진입 전부**
   *   "로그인을 마치지 못했어요"가 떴다. 실패는 **코드를 들고 돌아왔을 때만** 성립한다.
   *   이 순서 의존이 훅 안으로 들어온 것이 이 분리의 핵심 이득이다 — 뷰에서 되섞을 수 없다.
   */
  const exchangeFailed = hasCode && (!canExchange || exchangeTimedOut);

  return {
    start: oauth.start,
    /** 이동이 시작될 때까지의 시각 표시 — 실제 연타 차단은 훅의 동기 가드가 한다 */
    isPending: oauth.isPending,
    /**
     * 코드를 들고 돌아왔다면 교환 결과가 반영될 때까지 기다린다 — 단 무한정은 아니다.
     * (성공하면 GuestOnly가 이 화면을 걷어내므로 여기서 끝을 볼 일이 없다)
     */
    waiting: hasCode && !exchangeFailed,
    errorMessage:
      (errorCode ? toOAuthErrorMessage(errorCode, errorDescription) : null) ??
      (exchangeFailed ? "로그인을 마치지 못했어요. 다시 시도해 주세요." : null) ??
      oauth.error?.message ??
      null,
  };
}

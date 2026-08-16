"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** 교환 결과가 반영되기를 기다릴 상한 — `/sign-in`의 EXCHANGE_TIMEOUT_MS와 같은 취지 */
const LINK_EXCHANGE_TIMEOUT_MS = 8000;

/** URL은 내비게이션 없이 바뀌지 않으므로 구독할 것이 없다 — 리렌더 때 다시 읽힌다(useNextParam과 같다) */
function subscribeToUrl() {
  return () => {};
}
function hasCodeParam() {
  return new URLSearchParams(window.location.search).has("code");
}
/** 서버 판정은 `linkPending` 인자가 대신하므로 여기서는 그와 어긋나지 않게 true를 준다 */
function hasCodeParamOnServer() {
  return true;
}

/**
 * 계정 연결에서 돌아왔을 때 프로바이더가 돌려준 실패 사유.
 * ⚠ 원문은 영어다. 동의 취소(access_denied)가 대부분이라 그것만 따로 옮기고 나머지는 원문을
 *   함께 보여준다 — 삼키면 지원 문의에 아무 단서도 남지 않는다.
 * ⚠ `views/sign-in`에 같은 모양의 함수가 있지만 **공용화하지 않는다.** 사용처가 2회이고
 *   문구가 서로 다르다(로그인 vs 연결) — code-quality.md의 "중복 3회 이상일 때만 공용화".
 */
function toLinkErrorMessage(code: string, description: string | null): string {
  if (code === "access_denied") return "계정 연결을 취소했어요.";
  return description ? `계정을 연결하지 못했어요. (${description})` : "계정을 연결하지 못했어요.";
}

/**
 * 계정 연결(`linkIdentity`) 복귀 판정 — 진행 배너와 실패 문구.
 *
 * ⚠ 서버가 내려준 `linkPending`만 보면 배너가 **영원히 안 사라진다.** 교환이 끝나면 auth-js가
 *   `history.replaceState`로 `?code=`만 지우는데 그건 서버 컴포넌트를 다시 실행하지 않는다
 *   → 인자는 계속 true. 성공·실패 양쪽 모두 "연결하는 중"이 갇혔다.
 * → URL을 **클라이언트에서 직접 읽는다.** 교환이 끝나면 세션이 바뀌어(SIGNED_IN) 화면이
 *   리렌더되고, 그때 스냅샷이 다시 읽혀 배너가 걷힌다. `useNextParam`과 같은 방식이며
 *   effect에서 setState하면 `react-hooks/set-state-in-effect`에 걸린다.
 * ⚠ 상한도 둔다 — supabase는 교환에 실패해도 조용히 빠져나가므로 리렌더가 안 올 수 있다.
 *   `/sign-in`과 달리 상한이 화면을 대체하지 않고 **배너만 걷는다** — 이 화면은 교환이
 *   실패해도 프로필 자체가 정상 동작하기 때문이다.
 *
 * ⚠ **인자를 객체로 묶지 않는다.** 인라인 객체를 넘기면 아래 effect의 deps가 매 렌더 새
 *   참조가 되어 8초 타이머가 영원히 재시작하고, 배너가 절대 걷히지 않는다.
 */
export function useLinkReturn(
  linkPending: boolean,
  errorCode: string | null,
  errorDescription: string | null,
) {
  const codeInUrl = useSyncExternalStore(subscribeToUrl, hasCodeParam, hasCodeParamOnServer);
  const [exchangeTimedOut, setExchangeTimedOut] = useState(false);

  useEffect(() => {
    if (!linkPending) return;
    const timer = setTimeout(() => setExchangeTimedOut(true), LINK_EXCHANGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [linkPending]);

  return {
    /** "계정을 연결하는 중이에요…" 배너를 띄울지 */
    linking: linkPending && codeInUrl && !exchangeTimedOut,
    /** 프로바이더가 거부한 사유 (없으면 null) */
    errorMessage: errorCode ? toLinkErrorMessage(errorCode, errorDescription) : null,
  };
}

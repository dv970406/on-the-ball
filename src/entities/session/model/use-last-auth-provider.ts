"use client";

import { useSyncExternalStore } from "react";
import { type OAuthProvider } from "@/shared/config";
import { readLastAuthProvider } from "../lib/last-auth-provider";

/**
 * 구독할 것이 없다 — 이 값은 **로그인에 성공하는 순간에만** 바뀌는데, 그때 이 값을 읽던
 * 화면(로그인 화면)은 `GuestOnly`가 이미 걷어낸 뒤다.
 */
function subscribe() {
  return () => {};
}

/** 서버·하이드레이션 시점에는 알 수 없다(localStorage가 없다) */
function getServerSnapshot(): OAuthProvider | null {
  return null;
}

/**
 * 마지막으로 로그인에 쓴 프로바이더. 서버 렌더에서는 null이고 하이드레이션 직후 실제 값이 된다.
 *
 * ⚠ **순수 함수(`readLastAuthProvider`)를 배럴에 올리지 않고 이 훅을 올린다.** 그걸 그대로
 *   내보내면 호출부마다 "렌더 중에 부르면 하이드레이션이 깨진다"를 기억해야 하는데,
 *   그런 방어는 방어가 아니다. `useNextParam`이 같은 이유로 같은 형태를 갖는다 —
 *   effect에서 setState해도 결과는 같지만 `react-hooks/set-state-in-effect`에 걸린다.
 *
 * ⚠ `getSnapshot`이 문자열·null만 돌려주므로 참조가 안정적이다. 객체를 만들어 돌려주면
 *   매 호출 새 참조가 되어 무한 렌더가 된다.
 */
export function useLastAuthProvider(): OAuthProvider | null {
  return useSyncExternalStore(subscribe, readLastAuthProvider, getServerSnapshot);
}

"use client";

import type { ReactNode } from "react";
import { useServerSessionCheck } from "./use-server-session-check";
import { useSessionSync } from "./use-session-sync";

/**
 * 세션 동기화의 **마운트 지점** — 로직은 두 훅이 갖는다.
 *
 * - `useSessionSync` — supabase 세션을 스토어에 반영하고, 유저가 바뀌면 캐시를 리싱크한다.
 * - `useServerSessionCheck` — 로그인 상태가 될 때 1회 서버에 세션 유효성을 확인한다.
 *
 * 관심사가 둘이라 훅도 둘이다. 이 컴포넌트는 둘을 앱 수명에 매달아 두는 것 말고는 하는 일이
 * 없고, 그래서 JSX도 만들지 않는다.
 *
 * ⚠ `QueryClientProvider` 안쪽에 있어야 한다 — `useSessionSync`가 `useQueryClient`를 쓴다.
 * ⚠ 앱에 **하나만** 둔다. 두 번 마운트하면 `onAuthStateChange` 구독이 둘이 된다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  useSessionSync();
  useServerSessionCheck();
  return children;
}

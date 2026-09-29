"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/entities/session";
import { ToastViewport } from "@/shared/ui";

/** 전역 프로바이더 — TanStack Query + supabase 세션 동기화 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 앱 전역 캐시 신선도 기본값 — 개별 쿼리는 이 값을 상속한다
            // (프로필처럼 더 길게 잡을 때만 훅에서 staleTime을 오버라이드)
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* AuthProvider가 useQueryClient로 세션 변경 시 캐시를 무효화하므로 반드시 안쪽에 둔다 */}
      <AuthProvider>
        {children}
        {/*
          토스트는 라우트 전환을 넘어 살아남아야 한다 — 화면을 떠나는 동작 뒤에 뜨는 문구는 그 화면이
          언마운트된 뒤에야 보이므로 화면이 아니라 여기(앱의 유일한 라이브 리전)에 둔다.
        */}
        <ToastViewport />
      </AuthProvider>
    </QueryClientProvider>
  );
}

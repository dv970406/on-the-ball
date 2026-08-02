"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/entities/session";

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
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

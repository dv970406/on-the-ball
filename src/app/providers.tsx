"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ensureAnonymousSession } from "@/shared/api";

/** 전역 프로바이더 — TanStack Query + 익명 세션 부트스트랩 */
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

  useEffect(() => {
    // 첫 방문 시 익명 세션 확보 → 세션 생성 전에 조회된 쿼리를 무효화해 내 상태(투표 여부 등) 반영
    ensureAnonymousSession()
      .then(() => queryClient.invalidateQueries())
      .catch(() => {
        // env 미설정/네트워크 오류 — 쓰기 액션 시점에 재시도되므로 여기선 무시
      });
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

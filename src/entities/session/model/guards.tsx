"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/shared/ui";
import { useSessionStore } from "./session-store";
import { useRedirectAfterSignIn, useRedirectGuestToSignIn } from "./use-auth-redirect";

/**
 * 세션 판정 전에 보여줄 자리끼움.
 * 로딩/리다이렉트 직전 모두 이걸 그려 "비로그인 UI가 잠깐 보였다 바뀌는" 깜빡임을 없앤다.
 */
function AuthGateSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-5">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/**
 * 로그인 필수 화면.
 *
 * **인증 판정은 여기가 단독으로 갖는다** — proxy에는 라우트 가드가 없다(사유는 `nextjs.md`:
 * 판정자가 둘이 되면 서버·클라 불일치가 무한 리다이렉트가 된다).
 * 다만 이건 **안내**이고 실제 차단은 DB의 RLS다.
 *
 * 이동은 `useRedirectGuestToSignIn`이, 그 동안 무엇을 그릴지는 여기가 정한다.
 */
export function AuthRequired({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status);
  useRedirectGuestToSignIn(status);

  if (status !== "authenticated") return <AuthGateSkeleton />;
  return children;
}

/**
 * 비로그인 전용 화면(현재는 소셜 로그인 하나).
 *
 * 목적지 계산은 `useRedirectAfterSignIn`이 단독으로 소유한다 — 왜 여기 한 곳뿐인지,
 * `?next=`를 어떤 방식으로 읽는지는 전부 그 훅의 주석에 있다.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status);
  useRedirectAfterSignIn(status);

  // ⚠ AuthRequired와 달리 "loading"에서도 children을 그린다 — 이 화면은 **서버가 이미 걸렀다.**
  //   로그인 상태로 /sign-in에 하드 진입하면 이 가드가 목록으로 보내므로,
  //   여기까지 온 요청은 사실상 비로그인이다. 그리고 status가 "loading"인 순간은
  //   최초 로드뿐이라(useSessionSync가 한 번 확정하면 유지) SPA 전이에는 해당하지 않는다.
  //   앱 안에 로그인 유저에게 노출되는 /sign-in 링크도 없다(전부 guest 분기).
  //   덕분에 로그인 폼이 **서버 HTML에 그대로 담긴다** — 느린 회선에서 백지를 보지 않는다.
  if (status === "authenticated") return <AuthGateSkeleton />;
  return children;
}

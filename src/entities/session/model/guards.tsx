"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ROUTES, safeNextPath, signInWithNext } from "@/shared/config";
import { Skeleton } from "@/shared/ui";
import { useSessionStore } from "./session-store";

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
 * proxy.ts의 서버 가드가 하드 내비게이션을 이미 막지만, SPA 전이나
 * 화면에 머무는 동안의 세션 만료는 서버가 잡지 못한다 — 그 구멍을 이쪽이 메운다.
 * 실제 차단은 두 층 모두 아니고 DB의 RLS다.
 */
export function AuthRequired({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 렌더 중 부작용은 금지고 redirect()는 이벤트 핸들러/effect에서 못 쓰므로 router로 이동한다
    if (status === "guest") router.replace(signInWithNext(pathname));
  }, [status, router, pathname]);

  if (status !== "authenticated") return <AuthGateSkeleton />;
  return children;
}

/**
 * 비로그인 전용 화면(로그인·회원가입·비밀번호 찾기).
 *
 * ⚠ /reset-password는 여기 감싸지 않는다 — 재설정 링크는 세션을 확립한 뒤
 *   그 페이지에 도달하므로, 감싸면 곧바로 튕겨나가 흐름이 깨진다.
 *
 * ⚠ **로그인 후 목적지를 정하는 곳은 여기 하나다.**
 *   로그인 화면의 mutation `onSuccess`에서 이동시키면 안 된다 — supabase가
 *   signInWithPassword 반환 **전에** SIGNED_IN을 발행하므로, status가 바뀌는 순간
 *   이 가드가 children을 스켈레톤으로 갈아치워 로그인 화면이 언마운트된다.
 *   그러면 onSuccess 콜백이 아예 실행되지 않아 `?next=`가 통째로 버려진다(실측 확인).
 *   레이스가 아니라 결정적 파손이라 "둘 다 두고 먼저 이기는 쪽" 같은 건 성립하지 않는다.
 *
 * ⚠ `?next=`를 useSearchParams가 아니라 **effect 안에서 window.location.search로** 읽는다.
 *   useSearchParams는 프리렌더를 CSR로 떨어뜨리는데, 이 컴포넌트가 레이아웃에 있어서
 *   그 폴백이 인증 화면 3개의 **본문 전체를 삼켰다**(빌드 산출물이 빈 body + BAILOUT였다).
 *   목적지 계산은 effect 안에서만 필요하고 effect는 클라이언트에서만 도니 이걸로 충분하다.
 *   덕분에 <Suspense> 경계도 필요 없어진다.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status);
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    // 외부 URL 주입(오픈 리다이렉트)은 safeNextPath가 걸러낸다
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(safeNextPath(next, window.location.origin) ?? ROUTES.postList);
  }, [status, router]);

  // ⚠ AuthRequired와 달리 "loading"에서도 children을 그린다 — 이 화면은 **서버가 이미 걸렀다.**
  //   로그인 상태로 /sign-in에 하드 진입하면 proxy가 목록으로 리다이렉트하므로,
  //   여기까지 온 요청은 사실상 비로그인이다. 그리고 status가 "loading"인 순간은
  //   최초 로드뿐이라(AuthProvider가 한 번 확정하면 유지) SPA 전이에는 해당하지 않는다.
  //   앱 안에 로그인 유저에게 노출되는 /sign-in 링크도 없다(전부 guest 분기).
  //   덕분에 로그인 폼이 **서버 HTML에 그대로 담긴다** — 느린 회선에서 백지를 보지 않는다.
  if (status === "authenticated") return <AuthGateSkeleton />;
  return children;
}

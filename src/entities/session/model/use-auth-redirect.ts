"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ROUTES, safeNextPath, signInWithNext } from "@/shared/config";
import { consumeSignOutIntent } from "../lib/sign-out-intent";
import type { SessionStatus } from "./types";

/**
 * 로그인 필수 화면에서 비로그인 사용자를 로그인 화면으로 돌려보낸다.
 *
 * ⚠ 렌더 중 부작용은 금지고 `redirect()`는 이벤트 핸들러·effect에서 쓸 수 없으므로
 *   `router.replace`로 이동한다.
 * ⚠ 복귀 경로(`?next=`)는 `signInWithNext`가 만든다 — 이 형태를 만드는 다른 곳과 **같은
 *   단일 소스**여야 두 가드의 판정이 갈리지 않는다.
 *
 * ⚠ **직접 로그아웃한 경우만 목적지가 다르다** — 방금 나온 로그인 화면으로 되돌리는 대신
 *   목록으로 보낸다. 판정은 여기 한 곳에 두고 신호만 `features/sign-out`이 남긴다:
 *   호출부에서 `router.replace`를 먼저 걸어 이 이동을 이기려 하면 **순서 보장이 없다**
 *   (사유는 `lib/sign-out-intent` 주석). 세션 만료·비로그인 진입은 그대로 로그인 화면이다 —
 *   그쪽은 `?next=`로 돌아올 자리가 있어야 한다.
 *
 * ⚠ **신호만 보고 판정하지 않는다 — "이 화면에서 세션이 사라졌는가"를 함께 본다.**
 *   신호는 소비되기 전까지 전역에 남고 가드는 이 화면 말고도 둘이 더 있다(`/posts/new`·
 *   `/posts/[id]/edit`). 소비되지 않은 신호가 남아 있으면 **비로그인 사용자가 글쓰기를
 *   눌렀을 때 로그인 화면 대신 목록으로 되튕긴다** — 아무 일도 일어나지 않은 것처럼 보인다.
 *   들어올 때 이미 비로그인이었다면 그 신호는 남의 것이므로 읽고 버리기만 한다.
 *   (덤으로 개발 모드의 StrictMode 이중 effect에서도 판정이 갈리지 않는다.)
 */
export function useRedirectGuestToSignIn(status: SessionStatus) {
  const router = useRouter();
  const pathname = usePathname();
  /** 이 화면에 머무는 동안 로그인 상태였는가 — 로그아웃·만료와 "비로그인 진입"을 가른다 */
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (status === "authenticated") {
      wasAuthenticated.current = true;
      return;
    }
    if (status !== "guest") return;

    // ⚠ 읽으면서 지운다 — 쓰지 않는 경우에도 버려야 다음 가드가 남의 신호를 먹지 않는다
    const signedOut = consumeSignOutIntent() && wasAuthenticated.current;
    router.replace(signedOut ? ROUTES.postList : signInWithNext(pathname));
  }, [status, router, pathname]);
}

/**
 * 로그인 후 목적지 결정 — **앱에서 여기 한 곳이다.**
 *
 * ⚠ 로그인 화면 쪽에서 이동시키면 안 된다. 세션이 서는 순간 `GuestOnly`가 children을
 *   스켈레톤으로 갈아치워 그 화면이 언마운트되므로, 거기 걸어둔 콜백은 아예 실행되지 않는다
 *   (이메일 로그인 시절 실측으로 확인했고, 소셜 로그인은 프로바이더에서 돌아오는 구조라
 *   화면이 한 번 더 갈아엎이므로 더 그렇다).
 *
 * ⚠ 소셜 로그인 복귀 지점이 `/sign-in?code=…` 자기 자신이다. 코드 교환이 끝나 SIGNED_IN이
 *   오면 여기가 `?next=`를 읽어 목적지로 보낸다 — 전용 콜백 라우트를 두지 않는 이유다.
 *
 * ⚠ 외부 URL 주입(오픈 리다이렉트)은 `safeNextPath`가 걸러낸다. 직접 문자열 검사를 짜지 말 것 —
 *   `startsWith("/")` 계열로는 `/\evil.com`도 `//evil.com`도 못 막는다(둘 다 실제로 뚫렸다).
 *
 * ⚠ **`?next=`를 `useSearchParams`로 읽지 않는다.** 그건 프리렌더를 CSR로 떨어뜨리는데,
 *   이 훅을 쓰는 가드가 `(auth)` 레이아웃에 얹혀 있어서 그 폴백이 인증 화면 3개의 **본문
 *   전체를 삼켰다**(빌드 산출물이 빈 body + BAILOUT였다). 덕분에 `<Suspense>` 경계도 필요 없다.
 *
 * ⚠ 그렇다고 `@/shared/lib`의 `useNextParam`으로 바꾸지도 **않는다.** 그건 값을 **렌더 중에**
 *   읽는 훅이라(`useSyncExternalStore`, 서버 스냅샷은 `null`) 레이아웃 레벨 가드에 렌더타임
 *   URL 의존을 새로 만든다. 여기서 값이 필요한 시점은 **리다이렉트하는 순간뿐**이고 effect는
 *   클라이언트에서만 도니 직접 읽는 것으로 충분하다. `reuse.md`가 권하는 `useNextParam`은
 *   **읽은 값을 렌더에 쓰는 화면**(로그인 화면의 `redirectTo` 조립) 이야기다.
 */
export function useRedirectAfterSignIn(status: SessionStatus) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(safeNextPath(next, window.location.origin) ?? ROUTES.postList);
  }, [status, router]);
}

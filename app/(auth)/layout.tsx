import type { ReactNode } from "react";
import { GuestOnly } from "@/entities/session";

/**
 * 비로그인 전용 인증 화면 셸 — 로그인 상태로 들어오면 목적지(?next= 또는 목록)로 돌려보낸다.
 *
 * ⚠ 소셜 로그인 복귀 지점(`/sign-in?code=…`)도 이 그룹 안이다. 복귀 시점에는 아직 쿠키가
 *   없어(교환이 브라우저에서 일어난다) GuestOnly가 children을 그대로 그리고,
 *   교환이 끝나면 그때 목적지로 보낸다.
 *
 * ⚠ <Suspense>를 두지 않는다. 전에는 목적지 계산이 useSearchParams를 쓰느라 경계가 필요했는데,
 *   그 경계가 children까지 감싸는 바람에 인증 화면의 **본문이 통째로 CSR로 떨어져
 *   서버 HTML이 빈 껍데기**가 됐다. 지금은 `useRedirectAfterSignIn`이 effect 안에서 URL을
 *   읽으므로 경계 자체가 필요 없다 — 그 훅을 `useNextParam`으로 바꾸지 말 것(사유는 훅 주석에).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <GuestOnly>{children}</GuestOnly>;
}

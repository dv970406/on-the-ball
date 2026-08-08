import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SignInView } from "@/views/sign-in";
// ⚠ 배럴(@/features/sign-in)이 아니라 직접 경로 — 배럴은 "use client" 훅을 포함한다
import { hasPkceVerifier } from "@/features/sign-in/lib/pkce-verifier";

export const metadata: Metadata = { title: "로그인" };

/**
 * 로그인 후 목적지(?next=)는 SignInView가 아니라 (auth)/layout의 GuestOnly가 정한다.
 *
 * ⚠ **OAuth 복귀 상태를 서버에서 읽어 prop으로 내린다.** 이 화면은 프로바이더에서
 *   `/sign-in?code=…` 로 돌아오는 지점이기도 한데, 내용이 그 쿼리에 따라 완전히 달라진다.
 *   전에는 뷰가 첫 렌더에서 `window.location`을 읽었는데, 이 페이지가 정적 프리렌더라
 *   **서버 HTML(로그인 버튼)과 클라이언트 첫 렌더("로그인 중")가 갈려 하이드레이션이 깨졌다**
 *   (React #418 실측 — 서버 HTML을 버리고 루트를 다시 렌더한다. 로그인 직후 버튼이 번쩍인다).
 *   searchParams·cookies를 읽으면 이 라우트가 동적(ƒ)이 되지만, 내용이 실제로 요청에
 *   의존하므로 그게 정직한 렌더다. `useSearchParams`(CSR 폴백)와 달리 서버 HTML이 정답을 담는다.
 */
export default async function Page(props: PageProps<"/sign-in">) {
  const [params, jar] = await Promise.all([props.searchParams, cookies()]);
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? null;

  return (
    <SignInView
      hasCode={first(params.code) !== null}
      // 교환이 성립할 수 없는 복귀(다른 브라우저·새로고침 등)를 상한 없이 즉시 판정한다
      canExchange={hasPkceVerifier(jar.getAll().map((cookie) => cookie.name))}
      errorCode={first(params.error)}
      errorDescription={first(params.error_description)}
    />
  );
}

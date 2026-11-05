export { useOAuthSignIn } from "./model/use-oauth-sign-in";
// ⚠ 이 배럴은 "use client" 훅을 포함한다 — 서버(`app/(auth)/sign-in/page.tsx`)의 `hasPkceVerifier`는 `lib/pkce-verifier` 직접 경로다.

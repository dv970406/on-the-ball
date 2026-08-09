export { useOAuthSignIn } from "./model/use-oauth-sign-in";
// ⚠ 순수 함수 — 서버(app/(auth)/sign-in/page.tsx)는 배럴이 아니라 직접 경로로 가져간다.
//   이 배럴은 "use client" 훅을 포함한다(architecture.md의 서버/클라이언트 경계 규칙).
export { hasPkceVerifier } from "./lib/pkce-verifier";

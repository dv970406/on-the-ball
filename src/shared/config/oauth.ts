/**
 * 지원하는 소셜 로그인 프로바이더 — **supabase 설정과 갈리면 안 된다.**
 * 값을 늘리려면 `supabase/config.toml`의 `[auth.external.*]`도 함께 켜야 한다.
 *
 * ⚠ `shared`에 두는 이유: 로그인(features/sign-in)과 계정 연결(features/link-identity)이
 *   같은 목록을 써야 하는데, features끼리는 import할 수 없다(architecture.md 단방향 규칙).
 *
 * ⚠ 네이버는 여기 없다. supabase가 naver provider를 지원하지 않는다
 *   (auth-js의 `Provider` 유니온에도, supabase CLI가 아는 external provider 20종에도 없다).
 */
export const OAUTH_PROVIDERS = ["kakao", "google"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** 화면에 쓰는 표시 이름 — Record라 프로바이더가 늘면 컴파일 에러로 드러난다 */
export const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = {
  kakao: "카카오",
  google: "Google",
};

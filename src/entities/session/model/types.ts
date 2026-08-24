/**
 * 세션 상태.
 *
 * ⚠ `user !== null`에서 파생시키지 않고 명시 필드로 둔다.
 *   파생시키면 "스토리지에서 복원하기 전"과 "비로그인"이 구분되지 않아,
 *   로그인한 유저가 새로고침할 때 비로그인 UI가 잠깐 보였다 바뀌는 깜빡임을 막을 수 없다.
 */
export type SessionStatus = "loading" | "authenticated" | "guest";

/**
 * 화면에서 필요한 최소 유저 정보 — supabase User 전체를 들고 다니지 않는다.
 *
 * ⚠ `email`은 **null일 수 있다.** 카카오의 이메일 제공은 별도 심사 항목이라 승인 전에는
 *   오지 않는다(config.toml의 `email_optional = true`). 전에는 `?? ""`로 빈 문자열을 넣어
 *   타입이 "항상 값이 있다"고 거짓말했다 — 이메일을 화면에 쓰는 순간 카카오 유저 전원에게
 *   빈 칸이 렌더된다. 표시 이름이 필요하면 `profiles.nickname`을 쓴다(views/profile).
 */
export interface SessionUser {
  id: string;
  email: string | null;
}

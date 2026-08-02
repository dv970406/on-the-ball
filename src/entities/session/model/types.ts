/**
 * 세션 상태.
 *
 * ⚠ `user !== null`에서 파생시키지 않고 명시 필드로 둔다.
 *   파생시키면 "스토리지에서 복원하기 전"과 "비로그인"이 구분되지 않아,
 *   로그인한 유저가 새로고침할 때 비로그인 UI가 잠깐 보였다 바뀌는 깜빡임을 막을 수 없다.
 */
export type SessionStatus = "loading" | "authenticated" | "guest";

/** 화면에서 필요한 최소 유저 정보 — supabase User 전체를 들고 다니지 않는다 */
export interface SessionUser {
  id: string;
  email: string;
}

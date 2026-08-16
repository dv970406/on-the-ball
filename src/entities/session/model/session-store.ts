import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { SessionStatus, SessionUser } from "./types";

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /**
   * `useSessionSync`의 onAuthStateChange 콜백 전용.
   * 컴포넌트나 features 훅에서 직접 부르지 않는다 — 세션의 단일 소스는 supabase이고
   * 스토어는 그 사본일 뿐이다. 여기서 직접 세팅하면 supabase와 어긋난다.
   */
  applySession: (session: Session | null) => void;
}

/**
 * 세션 전역 상태 — 순수 상태 컨테이너.
 *
 * supabase 호출(로그인·로그아웃 등)은 전부 features 슬라이스의 훅에 둔다.
 * 그래야 이 엔티티가 "세션 상태"라는 한 가지 책임만 갖는다.
 *
 * 구독은 반드시 셀렉터로: useSessionStore((s) => s.user)
 * 스토어 전체를 구독하면 무관한 필드 변경에도 리렌더된다.
 */
export const useSessionStore = create<SessionState>((set) => ({
  status: "loading",
  user: null,
  applySession: (session) =>
    set({
      status: session ? "authenticated" : "guest",
      // ⚠ 빈 문자열로 덮지 않는다 — 없으면 null이다(SessionUser 주석 참고)
      user: session?.user ? { id: session.user.id, email: session.user.email ?? null } : null,
    }),
}));

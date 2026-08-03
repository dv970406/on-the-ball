import { create } from "zustand";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { SessionStatus, SessionUser } from "./types";

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /**
   * 이 세션이 **비밀번호 재설정 링크로 확립된 세션**인지.
   *
   * `/reset-password`가 "기존 비밀번호 없이 새 비밀번호를 설정하는" 화면이라
   * 아무 로그인 세션에나 열어주면 안 된다 — 잠깐 남의 브라우저를 만진 사람이
   * 계정을 영구히 탈취할 수 있다(GoTrue의 `secure_password_change`는 세션 생성 후
   * **24시간이 지난 경우에만** 재인증을 요구한다. 실측 확인).
   *
   * supabase가 복구 링크의 코드를 교환하면 `SIGNED_IN`이 아니라 **`PASSWORD_RECOVERY`** 를
   * 발행하므로(auth-js 2.110 `_exchangeCodeForSession` — code_verifier에 "/recovery"가
   * 함께 저장된다) 그 이벤트로만 이 플래그를 켠다.
   */
  isPasswordRecovery: boolean;
  /**
   * AuthProvider의 onAuthStateChange 콜백 전용.
   * 컴포넌트나 features 훅에서 직접 부르지 않는다 — 세션의 단일 소스는 supabase이고
   * 스토어는 그 사본일 뿐이다. 여기서 직접 세팅하면 supabase와 어긋난다.
   */
  applySession: (session: Session | null, event?: AuthChangeEvent) => void;
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
  isPasswordRecovery: false,
  applySession: (session, event) =>
    set((prev) => ({
      status: session ? "authenticated" : "guest",
      user: session?.user
        ? { id: session.user.id, email: session.user.email ?? "" }
        : null,
      /**
       * 복구 링크로 들어온 순간 켜고, **비밀번호를 실제로 바꾼 순간 끈다.**
       *
       * ⚠ 재설정 성공 후에도 켜 두면 이 플래그가 막으려던 위협이 그대로 남는다 —
       *   공용 PC에서 비밀번호를 바꾸고 로그아웃 없이 자리를 뜨면, 다음 사람이
       *   /reset-password에 다시 들어가 기존 비밀번호 없이 또 바꿀 수 있다.
       *   supabase는 비밀번호 변경 시 `USER_UPDATED`를 발행하므로 그때 닫는다.
       * 세션이 끊기면(로그아웃·계정 전환) 당연히 함께 꺼진다.
       */
      isPasswordRecovery:
        event === "PASSWORD_RECOVERY"
          ? true
          : event === "USER_UPDATED" || !session
            ? false
            : prev.isPasswordRecovery,
    })),
}));

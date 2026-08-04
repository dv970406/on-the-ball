"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { cn } from "@/shared/lib";

/** 자동 소멸까지 — 프로토타입과 동일 */
const TOAST_DURATION_MS = 1800;

interface ToastState {
  message: string | null;
  /** 같은 문구를 연속으로 띄워도 타이머가 새로 돌게 하는 일련번호 */
  seq: number;
  show: (message: string) => void;
  dismiss: () => void;
}

/**
 * 토스트 — **전역 스토어**다.
 *
 * ⚠ 화면 안의 로컬 state로 두면 안 된다. "글을 올렸어요"는 등록 → **목록으로 이동한 뒤**
 *   떠야 하고, "글을 삭제했어요"도 마찬가지다. 라우트 전환에서 화면이 언마운트되므로
 *   메시지가 화면 바깥에 살아 있어야 한다(세션 스토어와 같은 이유로 zustand를 쓴다).
 */
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  seq: 0,
  show: (message) => set((s) => ({ message, seq: s.seq + 1 })),
  dismiss: () => set({ message: null }),
}));

/** 호출부용 — 스토어 전체를 구독하지 않도록 액션만 꺼낸다 */
export function useToast() {
  return useToastStore((s) => s.show);
}

/**
 * 탭바가 떠 있는 화면인지. 토스트가 탭바에 가리지 않도록 bottom을 112px / 40px로 가른다.
 * ⚠ 뷰포트는 루트에 있어 어떤 화면인지 모른다 → 탭바를 렌더하는 화면이 스스로 올린다.
 */
export const useTabBarPresenceStore = create<{ present: boolean; set: (v: boolean) => void }>(
  (set) => ({ present: false, set: (present) => set({ present }) }),
);

/** 탭바가 있는 화면에서 호출 — 언마운트되면 자동으로 되돌린다 */
export function useTabBarPresence() {
  const setPresent = useTabBarPresenceStore((s) => s.set);
  useEffect(() => {
    setPresent(true);
    return () => setPresent(false);
  }, [setPresent]);
}

/**
 * 토스트 표시 영역 — 루트(AppProviders)에 하나만 둔다.
 * 430px 프레임이 relative라 absolute가 프레임 안쪽에 얹힌다.
 */
export function ToastViewport() {
  const message = useToastStore((s) => s.message);
  const seq = useToastStore((s) => s.seq);
  const dismiss = useToastStore((s) => s.dismiss);
  const aboveTabBar = useTabBarPresenceStore((s) => s.present);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
    // seq가 의존성에 있어야 같은 문구를 다시 띄웠을 때 타이머가 재시작된다
  }, [message, seq, dismiss]);

  if (!message) return null;

  return (
    <div
      // aria-live로 스크린리더에도 전달한다. 중단성이 없는 알림이라 polite.
      role="status"
      aria-live="polite"
      className={cn(
        "absolute left-1/2 z-[95] -translate-x-1/2 whitespace-nowrap rounded-sm",
        "bg-ink/95 px-4 py-[11px] text-[13px] text-white",
        "motion-safe:animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]",
        aboveTabBar ? "bottom-[112px]" : "bottom-10",
      )}
    >
      {message}
    </div>
  );
}

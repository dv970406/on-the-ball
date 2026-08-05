"use client";

import { create } from "zustand";

interface ToastState {
  message: string | null;
  /** 같은 문구를 연속으로 띄워도 타이머가 새로 돌게 하는 일련번호 */
  seq: number;
  show: (message: string) => void;
  dismiss: () => void;
}

/**
 * 토스트 메시지 — **전역 스토어**다.
 *
 * ⚠ 화면 안의 로컬 state로 두면 안 된다. "글을 올렸어요"는 등록 → **목록으로 이동한 뒤**
 *   떠야 하고, "글을 삭제했어요"도 마찬가지다. 라우트 전환에서 화면이 언마운트되므로
 *   메시지가 화면 바깥에 살아 있어야 한다(세션 스토어와 같은 이유로 zustand를 쓴다).
 *
 * ⚠ 뷰(`shared/ui/toast.tsx`)와 파일을 나눈 이유: `ui/`는 프레젠테이션, 상태는 따로 둔다
 *   (architecture.md의 슬라이스 구조 규칙). shared에는 model/이 없고 훅·상태를 `lib/`에
 *   두는 선례가 있다(use-now·use-scroll-restore·use-next-param).
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

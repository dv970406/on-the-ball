"use client";

import { useRef, type ReactNode } from "react";
import { useScrollRestore } from "@/shared/lib";

/**
 * 목록 화면 공용 스크롤 영역.
 * - 디테일 라우트 왕복 시 스크롤 위치 복원
 * - 하단 패딩은 홈 인디케이터만 확보한다.
 *   (v1의 플로팅 탭바 88px을 더하던 122px은 탭바가 청산되어 근거가 사라졌다)
 */
export function TabScrollArea({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLElement>(null);
  useScrollRestore(scrollRef);

  return (
    <main
      ref={scrollRef}
      className="no-scrollbar h-full overflow-y-auto overflow-x-hidden pb-[max(24px,env(safe-area-inset-bottom))]"
    >
      {children}
    </main>
  );
}

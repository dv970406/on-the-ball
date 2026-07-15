"use client";

import { useRef, type ReactNode } from "react";
import { useScrollRestore } from "@/shared/lib";

/**
 * 탭 화면 공용 스크롤 영역.
 * - 하단 122px 패딩: 플로팅 탭바(88px) + 홈 인디케이터(34px) 확보
 * - 디테일 라우트 왕복 시 스크롤 위치 복원
 */
export function TabScrollArea({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollRestore(scrollRef);

  return (
    <div
      ref={scrollRef}
      className="no-scrollbar h-full overflow-y-auto overflow-x-hidden pb-[122px]"
    >
      {children}
    </div>
  );
}

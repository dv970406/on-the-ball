"use client";

import { useRef, type ReactNode } from "react";
import { useScrollRestore } from "@/shared/lib";

/**
 * 목록 화면 공용 스크롤 영역.
 * - 디테일 라우트 왕복 시 스크롤 위치 복원
 * - 하단 패딩 = 플로팅 탭바(높이 72 + 하단 18) + 여유. 커뮤니티 이식으로 탭바가 돌아왔다.
 *   ⚠ 마지막 글 행이 탭바에 가리면 안 된다 — 프로토타입의 122px과 같은 계산이다.
 */
export function TabScrollArea({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLElement>(null);
  useScrollRestore(scrollRef);

  return (
    <main
      ref={scrollRef}
      className="no-scrollbar h-full overflow-y-auto overflow-x-hidden pb-[calc(122px+env(safe-area-inset-bottom))]"
    >
      {children}
    </main>
  );
}

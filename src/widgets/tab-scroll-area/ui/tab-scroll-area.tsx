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
      /*
        ⚠ `relative`가 필요하다 — Tailwind의 `sr-only`는 `position:absolute`인데, 조상에
          positioned 요소가 없으면 컨테이닝 블록이 **프레임**이 되어 이 영역의 overflow
          클리핑을 빠져나간다. 그러면 목록이 길수록 프레임이 세로로 넘쳐(실측 430px)
          포커스 이동에 화면이 밀리고 되돌릴 수 없다.
        ⚠ `h-full`이 아니라 `min-h-0 flex-1` — 프레임이 flex 컬럼이다(app/layout.tsx).
      */
      className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(122px+env(safe-area-inset-bottom))]"
    >
      {children}
    </main>
  );
}

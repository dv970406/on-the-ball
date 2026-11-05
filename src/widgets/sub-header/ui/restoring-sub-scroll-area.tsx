"use client";

import { type ReactNode, useRef } from "react";
import { useScrollRestore } from "@/shared/lib";
import { SubScrollArea } from "./sub-scroll-area";

/**
 * 스크롤 위치를 되살리는 서브헤더 화면의 스크롤 영역 — 항목을 눌렀다 돌아오면 `<main>`이 다시 마운트돼 맨 위로 돌아가는 목록용이다.
 * ⚠ 문서 화면(목차 앵커가 있는 곳)에는 쓰지 않는다 — 앵커 이동과 복원 값이 부딪힌다.
 */
export function RestoringSubScrollArea({ children, className }: { children: ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLElement>(null);
  useScrollRestore(scrollRef);
  return (
    <SubScrollArea ref={scrollRef} className={className}>
      {children}
    </SubScrollArea>
  );
}

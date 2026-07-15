"use client";

import { usePathname } from "next/navigation";
import { useEffect, type RefObject } from "react";

/**
 * 탭 스크롤 영역의 위치를 sessionStorage에 저장/복원한다.
 * 디테일 화면이 별도 라우트라 탭 레이아웃이 unmount되므로,
 * 리스트 → 디테일 → 뒤로가기 왕복 시 스크롤 위치를 유지하기 위해 필요하다.
 *
 * 복원은 콘텐츠(데이터)가 로드되어 스크롤 높이가 충분해질 때까지 rAF로 재시도하고,
 * 저장 리스너는 복원이 끝난 뒤에 붙인다 — 로드 전 클램프된 scrollTop이
 * 저장값을 덮어써 원래 위치를 잃는 문제 방지.
 */
export function useScrollRestore(ref: RefObject<HTMLElement | null>) {
  const pathname = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const key = `otb-scroll:${pathname}`;
    const saved = Number(sessionStorage.getItem(key) ?? 0);

    let disposed = false;
    let raf = 0;
    let ticking = false;
    const startedAt = performance.now();

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        sessionStorage.setItem(key, String(el.scrollTop));
        ticking = false;
      });
    };
    const attachSaver = () => {
      if (!disposed) el.addEventListener("scroll", onScroll, { passive: true });
    };

    const tryRestore = () => {
      if (disposed) return;
      const canReach = el.scrollHeight - el.clientHeight >= saved - 2;
      const timedOut = performance.now() - startedAt > 1200;
      if (canReach || timedOut) {
        if (saved > 0) el.scrollTop = saved;
        attachSaver();
        return;
      }
      raf = requestAnimationFrame(tryRestore);
    };

    if (saved > 0) {
      raf = requestAnimationFrame(tryRestore);
    } else {
      // 공유 스크롤 컨테이너라 직전 탭의 오프셋이 남아 있을 수 있어 0으로 리셋
      el.scrollTop = 0;
      attachSaver();
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [pathname, ref]);
}

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
    /**
     * ⚠ sessionStorage 접근은 실패할 수 있다 — 사파리의 쿠키·사이트 데이터 차단이나
     *   일부 임베드 환경에서 접근 자체가 throw한다. effect에서 터지면 목록 화면이
     *   통째로 app/error.tsx로 떨어지므로, 스크롤 복원 실패는 조용히 넘긴다
     *   (기능이 아니라 편의다).
     */
    const readSaved = () => {
      try {
        return Number(sessionStorage.getItem(key) ?? 0);
      } catch {
        return 0;
      }
    };
    const writeSaved = (value: number) => {
      try {
        sessionStorage.setItem(key, String(value));
      } catch {
        // 저장 불가 환경 — 복원을 포기할 뿐 화면은 정상 동작한다
      }
    };

    const saved = readSaved();

    let disposed = false;
    let raf = 0;
    let saveRaf = 0;
    let ticking = false;
    const startedAt = performance.now();

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      // ⚠ 이 핸들을 따로 들고 있어야 cleanup에서 취소된다. 전에는 복원용 raf 변수만
      //   취소해서, 스크롤 직후 한 프레임 안에 화면을 떠나면 **detached 엘리먼트의
      //   scrollTop(0)이 저장되어** 뒤로가기 시 맨 위로 튀었다.
      saveRaf = requestAnimationFrame(() => {
        writeSaved(el.scrollTop);
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
      cancelAnimationFrame(saveRaf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [pathname, ref]);
}

"use client";

import { useEffect, useRef, useState } from "react";

/** 한 번 누를 때 넘기는 양 — 보이는 폭의 이만큼(나머지는 앞 화면과 겹쳐 어디서 이어지는지 보이게) */
const PAGE_RATIO = 0.8;

/**
 * 가로로 흐르는 칩 줄의 **넘침 상태와 넘기기** — 도메인을 모르는 DOM 메커니즘이라 컴포넌트 옆에 둔다(`code-quality.md`).
 *
 * - `back`·`forward`: 그쪽으로 더 갈 내용이 있는가(스크롤 위치·폭이 바뀔 때마다 다시 잰다 — 창 크기·칩 수가 바뀐다).
 * - `page(dir)`: 보이는 폭의 `PAGE_RATIO`만큼 넘긴다. `prefers-reduced-motion`이면 즉시.
 * ⚠ 서버·첫 렌더는 둘 다 `false`다(렌더 중에 DOM을 재지 않는다) — 넘침 표시는 하이드레이션 뒤에 붙는다.
 */
export function useRailOverflow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [overflow, setOverflow] = useState({ back: false, forward: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const back = el.scrollLeft > 1;
      const forward = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setOverflow((prev) => (prev.back === back && prev.forward === forward ? prev : { back, forward }));
    };
    el.addEventListener("scroll", measure, { passive: true });
    // 상자 폭만이 아니라 **칩 하나하나의 폭**도 본다 — 칩이 늘고 줄거나(필터·로그인) 하이드레이션 뒤 글꼴 조각이 붙어 칩이
    // 넓어지면 상자 폭은 그대로인 채 내용 폭(`scrollWidth`)만 바뀐다
    const resizeObserver = new ResizeObserver(measure);
    const observeAll = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(el);
      for (const child of Array.from(el.children)) resizeObserver.observe(child);
      measure();
    };
    observeAll();
    const mutationObserver = new MutationObserver(observeAll);
    mutationObserver.observe(el, { childList: true });
    let alive = true;
    document.fonts.ready.then(() => {
      if (alive) measure();
    });
    return () => {
      alive = false;
      el.removeEventListener("scroll", measure);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * PAGE_RATIO, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return { ref, back: overflow.back, forward: overflow.forward, page };
}

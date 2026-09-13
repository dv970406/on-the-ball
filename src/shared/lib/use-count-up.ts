"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 300;

/** ease-otb(cubic-bezier(0.2,0,0,1))에 가까운 감속 커브 — JS 보간용 근사 */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * 숫자가 목표값으로 **굴러가며** 도착한다(Robinhood·Apple Sports의 카운트업).
 *
 * - 마운트 시: `from`이 있으면 거기서 출발해 `target`까지 300ms, 없으면 즉시 `target`.
 * - 이후 `target`이 바뀌면 **지금 보이는 값**에서 새 값으로 굴러간다 — 갈아탄 표가
 *   낙관적으로 반영될 때 68%→64%가 미끄러지는 자리다.
 *
 * ⚠ `from`은 `useEntranceMotion()`이 참일 때만 `0`으로 준다. SSR로 이미 그려진 결과에
 *   0을 주면 서버 HTML(68%)과 첫 클라이언트 렌더(0%)가 어긋난다(하이드레이션 경고).
 * ⚠ 시계는 effect 안에서만 읽는다(렌더 중 `performance.now()` 금지 — 하이드레이션 규약).
 * ⚠ 모션 최소화 환경은 CSS가 아니라 JS 보간이라 전역 블록이 닿지 않는다 — 직접 건너뛴다.
 * ⚠ 반환값은 보간 중의 **실수**다 — 표기 전에 반드시 반올림한다(`CountUp`이 한다).
 */
export function useCountUp(target: number, from?: number): number {
  const [shown, setShown] = useState(from ?? target);
  // effect가 "지금 보이는 값"에서 출발하려면 렌더 상태가 아니라 ref로 읽어야 deps에 걸리지 않는다
  const shownRef = useRef(from ?? target);

  useEffect(() => {
    const start = shownRef.current;
    if (start === target) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - startedAt) / DURATION_MS);
      const value = start + (target - start) * easeOut(progress);
      shownRef.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

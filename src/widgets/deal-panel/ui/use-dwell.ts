"use client";

import { useEffect, useState } from "react";

/**
 * `active`가 `ms` 동안 이어졌는가 — 한번 참이 되면 그 마운트 동안 참으로 남는다.
 * 도메인을 모르는 순수 메커니즘이라 쓰는 컴포넌트 옆에 둔다(`code-quality.md`).
 *
 * ⚠ 첫 렌더는 늘 `false`다(서버도 같다) — 하이드레이션이 갈리지 않는다. 타이머는 effect 안에서만 돈다.
 * ⚠ 값을 되돌리지 않는다 — 판이 잠깐 비활성이 됐다 돌아와도(창 폭을 줄였다 늘림) 이미 머문 딜의 조회를 다시 기다리게 하지 않는다.
 *   딜이 바뀌면 호출부가 재마운트(`key`)해 처음부터 다시 잰다.
 */
export function useDwell(active: boolean, ms: number): boolean {
  const [dwelt, setDwelt] = useState(false);
  useEffect(() => {
    if (!active || dwelt) return;
    const timer = setTimeout(() => setDwelt(true), ms);
    return () => clearTimeout(timer);
  }, [active, dwelt, ms]);
  return dwelt;
}

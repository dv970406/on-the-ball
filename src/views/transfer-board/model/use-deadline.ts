"use client";

import { useEffect, useState } from "react";
import { useNowMs } from "@/shared/lib";

export interface DeadlineParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const TICK_MS = 1000;

/**
 * 이적 창 마감까지 남은 시간 — 1초마다 갱신된다.
 *
 * ⚠ **첫 렌더 값은 서버 시각이다.** `tick`은 마운트 후 인터벌이 처음 돌기 전까지 `null`이라
 *   SSR과 하이드레이션이 같은 값을 그린다(순서는 `serverNowMs ?? useNowMs()` — `data-and-state.md`).
 *   둘 다 없으면 `null`을 돌려주고 호출부가 자리끼움(`--일 --:--:--`)을 그린다.
 * ⚠ `Date.now()`는 **effect 안에서만** 읽는다(`react-hooks/purity`). 렌더가 시계를 읽으면
 *   서버·클라 출력이 갈린다.
 * ⚠ **마감에 닿으면 `"closed"`다.** 인터벌을 걷고 호출부가 카운트다운을 통째로 치운다 —
 *   음수로 내려가지도, `00일 00:00:00`으로 남지도 않는다.
 */
export function useDeadline(
  closesAt: string,
  serverNowMs: number | null,
): DeadlineParts | "closed" | null {
  const clientNowMs = useNowMs();
  const [tickMs, setTickMs] = useState<number | null>(null);

  useEffect(() => {
    const closesMs = Date.parse(closesAt);
    // 이미 지났으면 돌릴 이유가 없다 — 아래 계산이 "closed"를 돌려준다
    if (!(closesMs > Date.now())) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setTickMs(now);
      if (now >= closesMs) window.clearInterval(id);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [closesAt]);

  const nowMs = tickMs ?? serverNowMs ?? clientNowMs;
  if (nowMs === null) return null;

  const totalSeconds = Math.floor((Date.parse(closesAt) - nowMs) / 1000);
  if (totalSeconds <= 0) return "closed";
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

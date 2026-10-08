"use client";

import { useMemo, useSyncExternalStore } from "react";
import { serverToClientTime, useNowMs } from "@/shared/lib";

export interface DeadlineParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const TICK_MS = 1000;

/**
 * 1초 시계 — **화면 안의 카운트다운 전부가 인터벌 하나를 나눠 쓴다.** 보드는 폭에 따라 카운트다운을 두 자리에 둔다
 * (모바일·md의 `BoardHeader`, lg+의 `IndexBand` — 한쪽은 CSS로 가려져 있다). 자리마다 인터벌을 돌리면 같은 일을 두 번 한다.
 * 구독자가 없으면 인터벌을 걷는다.
 */
let timer: number | undefined;
const listeners = new Set<() => void>();

function subscribeTick(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    timer = window.setInterval(() => listeners.forEach((l) => l()), TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * 카운트다운 하나의 시계 — 틱마다 **서버 시계 기준의 지금**을 적는다.
 *
 * ⚠ 기기 시계(`Date.now()`)와 서버 시각을 크기로 겨루지 않는다 — 기기 시계가 서버보다 D초 늦으면 그동안 서버 시각이
 *   이겨 카운트다운이 D초 멈춘다. 대신 `serverToClientTime`이 잰 기기 시계 오차(지금까지 본 최솟값 — 뒤로가기가 되살린
 *   옛 페이로드의 시각은 오차가 더 커 저절로 무시된다)를 빼서 기기 시계를 서버 시계로 옮긴다.
 * ⚠ 마감에 닿은 틱을 적은 뒤 스스로 풀린다 — 이 시계는 마지막 값을 들고 있어 `"closed"`가 유지된다.
 */
function createDeadlineClock(closesMs: number, serverNowMs: number | null) {
  let nowMs: number | null = null;
  return {
    subscribe(onChange: () => void) {
      // 이미 지났으면 돌릴 이유가 없다 — 기준 시각으로 계산해 "closed"가 된다
      if (!(closesMs > Date.now())) return () => {};
      const skewMs = serverNowMs === null ? 0 : serverToClientTime(serverNowMs) - serverNowMs;
      let unsubscribe: () => void = () => {};
      unsubscribe = subscribeTick(() => {
        nowMs = Date.now() - skewMs;
        onChange();
        // 마감을 넘긴 틱을 그린 뒤 스스로 풀린다 — 마감 뒤에는 1초마다 할 일이 없다
        if (nowMs >= closesMs) {
          unsubscribe();
          unsubscribe = () => {};
        }
      });
      return () => unsubscribe();
    },
    getSnapshot: () => nowMs,
  };
}

/**
 * 이적 창 마감까지 남은 시간 — 1초마다 갱신된다.
 *
 * ⚠ **첫 렌더 값은 서버 시각이다.** 서버 스냅샷이 `null`이라 하이드레이션까지는 기준 시각(`serverNowMs ?? useNowMs()` —
 *   `data-and-state.md`)을 그리고, 첫 틱부터는 서버 시계로 옮긴 기기 시계(`createDeadlineClock`)를 쓴다.
 *   둘 다 없으면 `null`을 돌려주고 호출부가 자리끼움(`--일 --:--:--`)을 그린다.
 * ⚠ `Date.now()`는 **인터벌·구독 안에서만** 읽는다(`react-hooks/purity`). 렌더가 시계를 읽으면 서버·클라 출력이 갈린다.
 * ⚠ **마감에 닿으면 `"closed"`이고 시계를 멈춘다** — 마감을 넘긴 틱에서 이 구독이 스스로 풀린다(구독자가 없으면 인터벌도
 *   걷힌다). 시계가 마지막 값(마감 뒤 시각)을 들고 있어 `"closed"`가 유지된다. 이미 지난 마감은 처음부터 구독하지 않는다.
 */
export function useDeadline(
  closesAt: string,
  serverNowMs: number | null,
): DeadlineParts | "closed" | null {
  const clientNowMs = useNowMs();
  const clock = useMemo(() => createDeadlineClock(Date.parse(closesAt), serverNowMs), [closesAt, serverNowMs]);
  const tick = useSyncExternalStore(clock.subscribe, clock.getSnapshot, () => null);

  const nowMs = tick ?? serverNowMs ?? clientNowMs;
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

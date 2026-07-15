"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "선택 → 지연 → 결과 리빌" 시퀀스 훅.
 * 밸런스 투표(380ms)·퀴즈 정답(380ms)·TMI 카드 이탈(600ms)에서 공용으로 사용한다.
 */
export function useDelayedReveal(delayMs: number) {
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** 시퀀스 시작 — 지연 후 revealed=true가 되고 onReveal 콜백이 호출된다 */
  const trigger = useCallback(
    (onReveal?: () => void) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setPending(true);
      timerRef.current = setTimeout(() => {
        setPending(false);
        setRevealed(true);
        onReveal?.();
      }, delayMs);
    },
    [delayMs],
  );

  /** 초기 상태로 되돌림 (다시 도전 등) */
  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPending(false);
    setRevealed(false);
  }, []);

  return { pending, revealed, trigger, reset };
}

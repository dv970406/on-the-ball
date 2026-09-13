"use client";

import { useCountUp, useEntranceMotion } from "@/shared/lib";

interface CountUpProps {
  /** 목표값 — 바뀌면 지금 보이는 값에서 새 값으로 굴러간다 */
  value: number;
  /**
   * 보이는 값의 표기 — **정수**를 받는다(천 단위 구분이 필요하면 `formatCount`).
   * ⚠ 보간 중의 실수(`1283.41…`)는 여기 오기 전에 반올림한다. 안 그러면 `formatCount`가
   *   굴러가는 300ms 동안 `"1,283.412명"`을 그린다.
   */
  format?: (value: number) => string;
}

/**
 * 굴러가며 도착하는 숫자(퍼센트 · 참여자 수 · 적중률).
 *
 * 등장 모션 판정(`useEntranceMotion`)을 **안에서** 한다 — 호출부가 매번 기억해야 하는 방어는
 * 방어가 아니다. 하이드레이션에 그려지는 값은 즉시 최종값이고, 클라이언트에서 늦게 마운트된
 * 값만 0에서 올라온다. 사유와 규약은 `useCountUp`·`useEntranceMotion` 주석에.
 *
 * ⚠ **`tabular-nums`를 호출부가 준다.** 숫자가 굴러가는 동안 폭이 흔들리면 옆 글자가 떤다 —
 *   이 프로젝트의 숫자 자리는 이미 `font-mono tabular-nums`라 대개 상속된다.
 * ⚠ `map` 안에서 훅을 부를 수 없어 컴포넌트다(선택지마다 하나씩 그린다).
 */
export function CountUp({ value, format = String }: CountUpProps) {
  const play = useEntranceMotion();
  const shown = useCountUp(value, play ? 0 : undefined);
  return <>{format(Math.round(shown))}</>;
}

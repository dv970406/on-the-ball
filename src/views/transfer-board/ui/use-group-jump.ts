"use client";

import { useEffect, useRef, useState } from "react";
import type { TransferGroupKey } from "@/entities/transfer";

/**
 * 구간 섹션의 id 규칙(`section#tm-g-{key}`) — `BoardSections`가 붙이고 여기가 찾는다.
 * 두 곳이 같은 규칙을 써야 점프가 닿으므로 문자열을 흩어 두지 않는다.
 */
export const groupSectionId = (key: TransferGroupKey) => `tm-g-${key}`;

/** 점프 스크롤이 멈췄다고 보는 정지 시간(ms) — 마지막 scroll 이벤트 뒤 이만큼 조용하면 끝난 것이다 */
const SETTLE_MS = 150;
/** 스크롤 이벤트가 한 번도 오지 않는 경우(클램프로 제자리)의 안전장치 */
const JUMP_TIMEOUT_MS = 1000;

/**
 * 구간 점프 칩의 **DOM 메커니즘** — 섹션으로 스크롤하고, 지금 보이는 구간을 관찰해 활성 칩을 정한다.
 * 도메인을 모르는 순수 메커니즘이라 `model/`이 아니라 컴포넌트 옆에 둔다(`code-quality.md`).
 *
 * 활성 판정은 **IntersectionObserver**다 — 프로토타입은 누른 칩을 영영 켜 두었는데(`jumped`),
 * 사용자가 손으로 스크롤해 다른 구간에 들어가도 표시가 따라오지 않았다. 관찰 띠는 스크롤
 * 영역 상단(앱바 아래)부터 40% 지점까지이고, 그 띠에 걸린 **첫 구간**이 현재 구간이다.
 *
 * ⚠ **바닥에 닿았으면 띠에 걸린 마지막 구간**이다. 뒤쪽 구간이 짧으면 띠까지 올라오지 못해
 *   앞 구간이 영영 활성으로 남는다 — 스크롤이 더 갈 수 없으면 화면 아래쪽에 보이는 것이
 *   지금 보는 구간이다.
 * ⚠ **점프 중에는 관찰을 무시한다.** 부드러운 스크롤이 중간 구간을 지나며 칩이 차례로 깜빡인다.
 *   누른 순간 그 칩을 켜고, 스크롤이 멈춘 뒤(`SETTLE_MS`) 다시 판정한다 — 그때 누른 구간이
 *   띠 안에 있으면 그것을 유지한다(클램프 때문에 다른 구간이 띠의 첫 자리를 차지해도).
 * ⚠ 스크롤 컨테이너는 `TabScrollArea`의 `<main>`이고 앱바는 그 안의 sticky `<header>`다 —
 *   `closest("main")`·`:scope > header`로 거슬러 찾는다(위젯에 prop을 새로 열지 않는다,
 *   `MatchListView`와 같은 판단). 오프셋은 그 헤더의 실제 높이다(safe-area가 섞여 상수로 못 둔다).
 * ⚠ `prefers-reduced-motion`이면 `behavior: "auto"`다.
 */
export function useGroupJump(groupKeys: readonly TransferGroupKey[]) {
  /** 섹션들을 담는 패널 — 호출부가 보드 패널 래퍼에 단다 */
  const panelRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<TransferGroupKey | null>(null);
  const jumpingRef = useRef(false);
  const pressedRef = useRef<TransferGroupKey | null>(null);
  const recomputeRef = useRef<() => void>(() => {});
  // 배열 참조는 렌더마다 새로 오므로 문자열로 접어 effect 의존성으로 쓴다
  const keysSignature = groupKeys.join(",");

  useEffect(() => {
    const panel = panelRef.current;
    const main = panel?.closest("main");
    if (!panel || !main) return;

    const keys = keysSignature === "" ? [] : (keysSignature.split(",") as TransferGroupKey[]);
    const sections = keys.flatMap((key) => {
      const el = panel.querySelector<HTMLElement>(`#${groupSectionId(key)}`);
      return el ? [{ key, el }] : [];
    });
    if (sections.length === 0) return;

    const barHeight = main.querySelector<HTMLElement>(":scope > header")?.offsetHeight ?? 0;
    const inBand = new Map<TransferGroupKey, boolean>();

    const recompute = () => {
      if (jumpingRef.current) return;
      const visible = sections.filter(({ key }) => inBand.get(key)).map(({ key }) => key);
      if (visible.length === 0) return;
      const pressed = pressedRef.current;
      pressedRef.current = null;
      if (pressed !== null && visible.includes(pressed)) {
        setActive(pressed);
        return;
      }
      const atBottom = main.scrollTop + main.clientHeight >= main.scrollHeight - 1;
      setActive(atBottom ? visible[visible.length - 1] : visible[0]);
    };
    recomputeRef.current = recompute;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const hit = sections.find(({ el }) => el === entry.target);
          if (hit) inBand.set(hit.key, entry.isIntersecting);
        }
        recompute();
      },
      { root: main, rootMargin: `-${barHeight}px 0px -60% 0px`, threshold: 0 },
    );
    sections.forEach(({ el }) => observer.observe(el));

    let settleTimer = 0;
    const onScroll = () => {
      if (!jumpingRef.current) return;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        jumpingRef.current = false;
        recompute();
      }, SETTLE_MS);
    };
    main.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      main.removeEventListener("scroll", onScroll);
      window.clearTimeout(settleTimer);
      recomputeRef.current = () => {};
    };
  }, [keysSignature]);

  const jump = (key: TransferGroupKey) => {
    const panel = panelRef.current;
    const main = panel?.closest("main");
    const target = panel?.querySelector<HTMLElement>(`#${groupSectionId(key)}`);
    if (!panel || !main || !target) return;

    const barHeight = main.querySelector<HTMLElement>(":scope > header")?.offsetHeight ?? 0;
    const top =
      target.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - barHeight;

    setActive(key);
    // 이미 그 자리면 scroll 이벤트가 오지 않는다 — 점프 상태로 들어가면 관찰이 영영 막힌다
    if (Math.abs(main.scrollTop - top) < 1) return;

    jumpingRef.current = true;
    pressedRef.current = key;
    window.setTimeout(() => {
      if (!jumpingRef.current) return;
      jumpingRef.current = false;
      recomputeRef.current();
    }, JUMP_TIMEOUT_MS);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    main.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return {
    panelRef,
    /** 지금 보이는 구간 — 구간이 사라졌으면(필터로 0건) `null` */
    active: active !== null && groupKeys.includes(active) ? active : null,
    jump,
  };
}

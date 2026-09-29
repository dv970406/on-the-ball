"use client";

import { useState, type UIEvent } from "react";
import { RumorCard } from "@/entities/transfer";
import { cn } from "@/shared/lib";
import type { RumorEntry } from "../model/use-transfer-board";

/** 트랙의 카드 간격(px) — 아래 `gap-2.5`와 같은 값. 인디케이터 인덱스가 이 값으로 나눈다 */
const TRACK_GAP_PX = 10;

interface RumorCarouselProps {
  /** 비어 있으면 호출부가 섹션 자체를 그리지 않는다 — 빈 캡션이 첫 화면 세로 공간을 먹지 않게 */
  rumors: readonly RumorEntry[];
  nowMs: number | null;
}

/**
 * "최근 3일 소식" 캐러셀 — 캡션 + 300px 카드 스냅 트랙 + 점 인디케이터.
 *
 * ⚠ `확률 N%`는 없다(보류). 카드 자체는 `RumorCard`가 그린다.
 * ⚠ 인디케이터 인덱스는 `round(scrollLeft / (카드폭 + 간격))`. 스냅이
 *   `mandatory`라 멈춘 자리가 늘 카드 경계이고, 그래서 반올림이 곧 현재 카드다.
 * ⚠ 점은 `aria-hidden`이다 — 상태를 말하지 않는 순수 장식이라 `rounded-[2px]`(4×4)로 둔다
 *   (`rounded-full` 예외 목록을 늘리지 않는다).
 */
export function RumorCarousel({ rumors, nowMs }: RumorCarouselProps) {
  const [index, setIndex] = useState(0);

  const handleScroll = (e: UIEvent<HTMLUListElement>) => {
    const track = e.currentTarget;
    const first = track.firstElementChild;
    const step = first instanceof HTMLElement ? first.offsetWidth + TRACK_GAP_PX : 0;
    if (step > 0) setIndex(Math.round(track.scrollLeft / step));
  };

  return (
    <section aria-labelledby="tm-rumors-title" className="pt-4">
      <h2
        id="tm-rumors-title"
        className="px-5 pb-2.5 text-[13px] font-medium tracking-[-0.2px] text-ink-mute"
      >
        최근 3일 · 신뢰도 높은 소식
      </h2>
      <ul
        onScroll={handleScroll}
        className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-5 px-5 pb-1"
      >
        {rumors.map(({ deal, report }, i) => (
          // 첫 카드만 즉시 로드 — 나머지는 트랙을 넘겨야 보인다
          <RumorCard key={deal.id} deal={deal} report={report} nowMs={nowMs} priority={i === 0} />
        ))}
      </ul>
      <div aria-hidden className="flex justify-center gap-1 pb-1.5 pt-3">
        {rumors.map(({ deal }, i) => (
          <span
            key={deal.id}
            className={cn(
              "h-1 rounded-[2px] transition-[width,background-color] duration-200 ease-otb",
              i === index ? "w-3.5 bg-ink" : "w-1 bg-hairline",
            )}
          />
        ))}
      </div>
    </section>
  );
}

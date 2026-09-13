"use client";

import { useRef } from "react";
import { cn } from "@/shared/lib";

/**
 * 구역 식별자.
 * ⚠ **유니온으로 좁혀 둔다.** 뷰가 이 문자열로 패널의 `hidden`을 가르는데, `string`이면
 *   오타(`"stat"`)가 컴파일을 통과해 **두 패널이 모두 숨겨진 화면**이 된다 — 빌드도 린트도
 *   잡지 못하는 자리다.
 */
export type MatchSectionId = "lineup" | "stats";

export interface MatchSection {
  id: MatchSectionId;
  label: string;
}

/**
 * 탭·패널의 id 규칙 — **두 곳이 같은 규칙을 써야** `aria-controls`·`aria-labelledby`가 맞는다.
 * 뷰가 패널을 그리므로 규칙을 문자열로 흩어 두지 않고 여기서 함께 내보낸다.
 */
export const sectionTabId = (id: MatchSectionId) => `match-tab-${id}`;
export const sectionPanelId = (id: MatchSectionId) => `match-panel-${id}`;

interface MatchSectionTabsProps {
  /** 그릴 수 있는 구역만 담는다 — 빈 탭을 만들지 않는다(호출부가 판정한다) */
  sections: MatchSection[];
  active: MatchSectionId;
  onChange: (id: MatchSectionId) => void;
}

/**
 * 경기 상세의 구역 전환 탭 (라인업 · 기록).
 *
 * ⚠ **예측은 여기 들어오지 않는다** — 화면의 행동이라 탭 밖에 고정으로 둔다(뷰 주석).
 *
 * ⚠ **`role="tablist"`는 화살표 키 이동을 약속하는 롤이다**(`code-quality.md`) — 그래서
 *   roving tabindex를 실제로 구현한다. 구현할 생각이 없으면 이 롤을 쓰지 말고 그냥
 *   `aria-pressed` 버튼으로 두어야 한다.
 * ⚠ 선택된 탭만 `tabIndex=0`이다. 전부 0이면 Tab 키가 탭바 안에서 탭 수만큼 멈춰,
 *   키보드 사용자가 본문에 닿기까지 거치는 정거장이 늘어난다.
 *
 * ⚠ **에메랄드를 쓰지 않는다.** 선택 표시는 잉크 밑줄 + 굵기다 — 이 화면의 에메랄드 한 자리는
 *   이미 "적중" 배지가 갖고 있다(`styling.md`의 자리 표).
 */
export function MatchSectionTabs({ sections, active, onChange }: MatchSectionTabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (step: 1 | -1) => {
    const index = sections.findIndex((s) => s.id === active);
    // 끝에서 반대편으로 돈다(WAI-ARIA 탭 패턴)
    const next = sections[(index + step + sections.length) % sections.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  const activeIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === active),
  );

  return (
    <div role="tablist" aria-label="경기 정보" className="relative flex">
      {sections.map((section) => {
        const selected = section.id === active;
        return (
          <button
            key={section.id}
            // ⚠ ref 콜백이 값을 돌려주면 React 19가 정리 함수로 오해한다 → 블록 본문
            ref={(el) => {
              refs.current[section.id] = el;
            }}
            type="button"
            role="tab"
            id={sectionTabId(section.id)}
            aria-selected={selected}
            aria-controls={sectionPanelId(section.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(section.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                move(1);
              }
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(-1);
              }
            }}
            className={cn(
              // 밑줄은 버튼이 아니라 아래 인디케이터 하나가 긋는다 — 투명 border는 자리만 잡는다
              "flex-1 border-b-2 border-transparent pb-2.5 pt-2 text-[14px] transition-colors duration-150 ease-otb",
              selected ? "font-semibold text-ink" : "text-ink-mute-2",
            )}
          >
            {section.label}
          </button>
        );
      })}
      {/*
       * 미끄러지는 밑줄(iOS Segmented Control · Material Tabs) — 탭이 "바뀐다"가 아니라
       * "여기서 저기로 간다"로 읽힌다. 폭·위치가 탭 수와 선택에 따라 정해지는 런타임 값이라
       * `style`이고, 이 요소에는 표준 translate 유틸이 없어 transform이 여기 하나뿐이다.
       */}
      {/*
        ⚠ 폭은 `style`이 아니라 클래스다 — 구역은 `MatchSectionId` 둘뿐이고 이 컴포넌트는 둘 다
          있을 때만 렌더되므로(`tabbed`) 항상 절반이다. 구역이 늘면 여기 폭도 함께 고친다.
      */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-0.5 w-1/2 bg-ink transition-transform duration-250 ease-otb"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
    </div>
  );
}

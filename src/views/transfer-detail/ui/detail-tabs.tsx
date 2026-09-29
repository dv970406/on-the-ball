"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/shared/lib";

export type DetailTabKey = "comments" | "reports";

export interface DetailTab {
  key: DetailTabKey;
  label: string;
  /** 탭 옆 건수 — 아직 모르면(로딩·실패) `null`이라 숫자를 그리지 않는다 */
  count: ReactNode;
}

interface DetailTabsProps {
  tabs: DetailTab[];
  selected: DetailTabKey;
  onSelect: (key: DetailTabKey) => void;
}

/** 탭 버튼·패널을 잇는 id — 두 곳이 같은 문자열을 써야 `aria-controls`·`aria-labelledby`가 성립한다 */
export const detailTabId = (key: DetailTabKey) => `transfer-detail-tab-${key}`;
export const detailPanelId = (key: DetailTabKey) => `transfer-detail-panel-${key}`;

/**
 * 상세 하단 탭 바 — `댓글 N | 보도 타임라인 N`.
 *
 * ⚠ **`role="tablist"`는 키보드 모델을 약속한다**(`code-quality.md` "롤은 키보드 모델을 약속한다") —
 *   화살표로 옆 탭에 옮겨 가는 roving tabindex를 함께 구현한다. 선택된 탭만 Tab 순서에 들어가고
 *   (`tabIndex 0`), 화살표·Home·End가 포커스와 선택을 **함께** 옮긴다(자동 활성화 — 패널이 이미
 *   렌더돼 있어 전환 비용이 없다).
 * ⚠ 전환에 애니메이션이 없다 — 색만 150ms. 패널은 뷰가 `hidden`으로만 가린다.
 */
export function DetailTabs({ tabs, selected, onSelect }: DetailTabsProps) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (index: number) => {
    const target = tabs[(index + tabs.length) % tabs.length];
    onSelect(target.key);
    buttonsRef.current[tabs.indexOf(target)]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "ArrowRight") move(index + 1);
    else if (e.key === "ArrowLeft") move(index - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div role="tablist" className="mt-7 flex gap-5 border-b border-hairline-cool">
      {tabs.map((tab, index) => {
        const isSelected = tab.key === selected;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              buttonsRef.current[index] = el;
            }}
            type="button"
            role="tab"
            id={detailTabId(tab.key)}
            aria-selected={isSelected}
            aria-controls={detailPanelId(tab.key)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              // 밑줄이 바의 선과 겹치도록 -1px — 활성 탭만 2px 잉크 밑줄을 칠한다
              "-mb-px inline-flex h-11 items-center gap-[5px] whitespace-nowrap border-b-2 border-transparent text-[15px] font-medium tracking-[-0.3px] text-ink-mute-2 transition-colors duration-150 ease-otb",
              isSelected && "border-ink text-ink",
            )}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="font-mono text-[12px] tabular-nums opacity-80">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

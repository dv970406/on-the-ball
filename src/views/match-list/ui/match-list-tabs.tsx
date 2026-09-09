"use client";

import { useRef } from "react";
import { cn } from "@/shared/lib";

/**
 * 구역 식별자.
 * ⚠ **유니온으로 좁혀 둔다.** 뷰가 이 문자열로 패널의 `hidden`을 가르는데, `string`이면
 *   오타가 컴파일을 통과해 **두 패널이 모두 숨겨진 화면**이 된다 — 빌드도 린트도 잡지 못한다.
 */
export type MatchListTabId = "past" | "upcoming";

/**
 * 탭·패널의 id 규칙 — **두 곳이 같은 규칙을 써야** `aria-controls`·`aria-labelledby`가 맞는다.
 * 패널을 그리는 것은 뷰이므로 규칙을 문자열로 흩어 두지 않고 여기서 함께 내보낸다.
 */
export const listTabId = (id: MatchListTabId) => `match-list-tab-${id}`;
export const listPanelId = (id: MatchListTabId) => `match-list-panel-${id}`;

/**
 * 탭의 순서와 라벨 — **화면 순서가 곧 이 배열의 순서다.**
 * 최근이 먼저인 이유는 `MATCH_LIST_LOOKBACK_MS` 주석에 있다(맞췄는지를 먼저 보여주고
 * 다음 예측을 권하는 순서).
 */
const TABS: { id: MatchListTabId; label: string }[] = [
  { id: "past", label: "최근 경기" },
  { id: "upcoming", label: "다가오는 경기" },
];

interface MatchListTabsProps {
  active: MatchListTabId;
  onChange: (id: MatchListTabId) => void;
}

/**
 * 경기 목록의 구역 전환 탭 (최근 · 다가오는).
 *
 * ⚠ **탭이 데이터 유무로 늘고 줄지 않는다** — 경기 상세의 `MatchSectionTabs`와 갈리는
 *   지점이다. 저쪽은 라인업·기록이 "대부분의 시간에 오지 않을 것"이라 빈 탭을 아예 만들지
 *   않지만, 여기 두 구역은 시즌 중이면 늘 있고 **비어 있다는 사실 자체가 사용자가 알아야 할
 *   정보**다(이 화면은 "다가오는 경기가 0건인 것을 말해 준다"를 이미 규약으로 갖고 있다).
 *   구역이 접속 시점마다 나타났다 사라지면 목록의 구조 자체가 흔들린다.
 *
 * ⚠ **경기 상세의 탭 컴포넌트와 합치지 않는다.** `views`끼리는 import할 수 없어 공용화하려면
 *   `shared/ui`로 올려야 하는데, 중복이 2회뿐이라 공용화 기준("3회 이상")에 못 미친다
 *   (`code-quality.md`). 세 번째 소비자가 생기면 그때 올린다.
 *
 * ⚠ **`role="tablist"`는 화살표 키 이동을 약속하는 롤이다**(`code-quality.md`) — 그래서
 *   roving tabindex를 실제로 구현한다. 구현할 생각이 없으면 이 롤을 쓰면 안 된다.
 * ⚠ 선택된 탭만 `tabIndex=0`이다. 전부 0이면 Tab 키가 탭바 안에서 탭 수만큼 멈춰,
 *   키보드 사용자가 목록에 닿기까지 거치는 정거장이 늘어난다.
 *
 * ⚠ **에메랄드를 쓰지 않는다.** 선택 표시는 잉크 밑줄 + 굵기다 — 이 화면의 에메랄드는
 *   카드의 "적중" 배지가 갖고 있다(`styling.md`의 자리 표).
 */
export function MatchListTabs({ active, onChange }: MatchListTabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (step: 1 | -1) => {
    const index = TABS.findIndex((t) => t.id === active);
    // 끝에서 반대편으로 돈다(WAI-ARIA 탭 패턴)
    const next = TABS[(index + step + TABS.length) % TABS.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="경기 구역"
      className="flex border-b border-hairline-cool px-5"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            // ⚠ ref 콜백이 값을 돌려주면 React 19가 정리 함수로 오해한다 → 블록 본문
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={listTabId(tab.id)}
            aria-selected={selected}
            aria-controls={listPanelId(tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
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
              "flex-1 border-b-2 pb-2.5 pt-3 text-[14px] transition-colors duration-150 ease-otb",
              selected ? "border-ink font-semibold text-ink" : "border-transparent text-ink-mute-2",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

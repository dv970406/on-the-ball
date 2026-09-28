"use client";

import type { ReactNode } from "react";
import { GROUP_LABEL, GROUP_ORDER, type TransferGroupKey } from "@/entities/transfer";
import { cn } from "@/shared/lib";
import type { GroupCounts } from "../model/use-transfer-board";

interface GroupTabsProps {
  /** 리그·구단 필터 적용 후 구간별 건수 — 0건 구간은 그리지 않는다 */
  counts: GroupCounts;
  /** 지금 보이는 구간(`useGroupJump`) — 없으면 아무 탭도 켜지 않는다 */
  active: TransferGroupKey | null;
  onJump: (key: TransferGroupKey) => void;
  /** 줄 오른쪽 끝에 놓는 것 — 정렬 링크(`SortLinks`) */
  trailing?: ReactNode;
}

/**
 * 구간 점프 탭 스트립. **필터가 아니라 이동**이다 — 누르면 그 구간으로 스크롤한다.
 *
 * 형태가 칩이 아니라 **밑줄 탭**(상세의 `DetailTabs`와 같은 생김새)인 것이 요점이다 — 한때 구간 점프·리그·구단이
 * 세 줄 모두 같은 칩 모양이라 전부 필터로 읽혔다. 스크롤에 따라 옮겨 다니는 밑줄은 "지금 어디를 보고 있는가"를
 * 가리키는 인디케이터로 읽히고, 그 아래 칩 레일(`FilterRail`)만 필터로 남는다.
 *
 * ⚠ **0건 구간은 그리지 않는다.** 섹션 자체가 없는데(`groupDeals`가 빈 구간을 뺀다) 탭만 있으면 죽은 컨트롤이다 —
 *   창이 닫힌 시기에는 다섯 중 넷이 0건이라 회색 유령 칩이 한 줄을 차지했다. 접속마다 탭 수가 늘고 주는 것은 감수한다.
 *   구간이 하나뿐이면 이동할 곳이 없어 탭을 그리지 않고 `trailing`만 남긴다.
 * ⚠ **`role="tablist"`를 붙이지 않는다** — 패널 전환이 아니라 스크롤 이동이라 탭의 키보드 모델(화살표 이동)을
 *   약속할 자리가 아니다(`code-quality.md` "롤은 키보드 모델을 약속한다"). 형태만 빌린 `<nav>` + 버튼이다.
 *   상세 탭과 클래스가 겹치지만 2회 중복은 공용화하지 않는다(`code-quality.md`).
 * ⚠ ARIA 상태를 붙이지 않는다 — 토글이 아니라 `aria-pressed`가 틀리고, 활성 표시는 스크롤 위치를 되비치는
 *   장식이라 알릴 상태가 아니다.
 * ⚠ 밑줄은 잉크다 — 에메랄드가 아니다(`styling.md`의 에메랄드 자리 표에 이 파일은 없다).
 * ⚠ 다섯 구간이 전부 있으면 좁은 폭에서 정렬 링크와 함께 한 줄을 넘길 수 있어 탭 쪽만 가로 스크롤한다 —
 *   정렬은 `shrink-0`으로 오른쪽에 남는다.
 */
export function GroupTabs({ counts, active, onJump, trailing }: GroupTabsProps) {
  const keys = GROUP_ORDER.filter((key) => counts[key] > 0);
  return (
    <div className="flex items-center gap-4 border-b border-hairline-cool px-5">
      {keys.length > 1 && (
        <nav aria-label="구간 이동" className="no-scrollbar flex min-w-0 gap-3.5 overflow-x-auto">
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onJump(key)}
              className={cn(
                // 밑줄이 바의 선과 겹치도록 -1px — 활성 탭만 2px 잉크 밑줄을 칠한다(`DetailTabs`와 같은 치수)
                "-mb-px inline-flex h-11 shrink-0 items-center gap-[5px] whitespace-nowrap border-b-2 border-transparent text-[13px] font-medium tracking-[-0.3px] text-ink-mute-2 transition-colors duration-150 ease-otb",
                active === key && "border-ink text-ink",
              )}
            >
              {GROUP_LABEL[key]}
              <span className="font-mono text-[10px] tabular-nums opacity-60">{counts[key]}</span>
            </button>
          ))}
        </nav>
      )}
      {trailing && (
        <div className="ml-auto flex h-11 shrink-0 items-center gap-3">
          {/* 탭과 정렬의 경계 — 없으면 정렬 링크가 여섯 번째 탭으로 읽힌다(실측) */}
          {keys.length > 1 && <span aria-hidden className="h-3.5 w-px bg-hairline" />}
          {trailing}
        </div>
      )}
    </div>
  );
}

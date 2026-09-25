"use client";

import { GROUP_LABEL, GROUP_ORDER, type TransferGroupKey } from "@/entities/transfer";
import { chipClassName } from "@/shared/ui";
import type { GroupCounts } from "../model/use-transfer-board";

interface GroupChipsProps {
  /** 리그 필터 적용 후 구간별 건수 — 0건은 누를 수 없다 */
  counts: GroupCounts;
  /** 지금 보이는 구간(`useGroupJump`) — 없으면 아무 칩도 켜지 않는다 */
  active: TransferGroupKey | null;
  onJump: (key: TransferGroupKey) => void;
}

/**
 * 구간 점프 칩 레일(handoff §4-4). **필터가 아니라 이동**이다 — 누르면 그 구간으로 스크롤한다.
 *
 * ⚠ `GROUP_ORDER` 다섯을 **전부** 그린다(빈 구간은 `disabled` + `opacity-40`) — `groupDeals`는
 *   빈 구간을 빼므로 그쪽 배열을 돌면 칩이 접속마다 늘고 준다.
 * ⚠ 형태는 말머리 칩(`chipClassName`)과 같다 — 활성은 잉크 채움이고 에메랄드가 아니다.
 * ⚠ ARIA 상태를 붙이지 않는다 — 토글이 아니라 `aria-pressed`가 틀리고, 활성 표시는 스크롤
 *   위치를 되비치는 장식이라 알릴 상태가 아니다(`code-quality.md`의 두 경우에 들지 않는다).
 */
export function GroupChips({ counts, active, onJump }: GroupChipsProps) {
  return (
    <nav aria-label="구간 이동" className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 py-3">
      {GROUP_ORDER.map((key) => {
        const count = counts[key];
        return (
          <button
            key={key}
            type="button"
            disabled={count === 0}
            onClick={() => onJump(key)}
            className={chipClassName(
              active === key,
              "inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-40",
            )}
          >
            {GROUP_LABEL[key]}
            <span className="font-mono text-[10px] tabular-nums opacity-60">{count}</span>
          </button>
        );
      })}
    </nav>
  );
}

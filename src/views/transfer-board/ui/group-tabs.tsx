"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { GROUP_LABEL, GROUP_ORDER, type TransferGroupKey } from "@/entities/transfer";
import { cn, preferredScrollBehavior } from "@/shared/lib";
import type { GroupCounts } from "../model/use-transfer-board";
import { useRailOverflow } from "./use-rail-overflow";

interface GroupTabsProps {
  counts: GroupCounts;
  active: TransferGroupKey | null;
  onJump: (key: TransferGroupKey) => void;
  /** 탭 줄 오른쪽 끝에 서는 것(정렬 링크) — 탭과 헤어라인 한 토막으로 가른다 */
  trailing?: ReactNode;
}

/** 넘친 쪽 끝의 흐림 폭(px) — 활성 탭을 끌어올 때도 이만큼 안쪽에 세운다(흐림 밑에 두지 않는다) */
const FADE_PX = 24;

/**
 * 탭 줄의 넘친 쪽 끝을 흐린다 — 좁은 폭에서 "더 있다"를 알리는 신호(아래 주석). 넘친 쪽에만 건다.
 * ⚠ 완성된 클래스 문자열로 둔다(Tailwind는 소스 텍스트에서 클래스를 훑는다 — 조립하면 생성되지 않는다). 필터 레일(`RAIL_FADE`)과
 *   같은 형태지만 그쪽은 md+ 전용·40px이라 따로 적는다(두 벌 — `code-quality.md`의 중복 허용).
 */
const TAB_FADE = {
  both: "[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]",
  back: "[mask-image:linear-gradient(to_right,transparent,black_24px)]",
  forward: "[mask-image:linear-gradient(to_left,transparent,black_24px)]",
} as const;

/**
 * 구간 탭 — `오피셜 11 · 합의 완료 3 · …`. 누르면 그 구간으로 스크롤한다(필터가 아니라 **이동**이라 `button`이고 `aria-current`가 아니다 —
 * 활성 표시는 잉크 밑줄 하나다).
 *
 * ⚠ **좁은 폭에서는 넘친다** — 390px에서 다섯 탭 + 정렬 링크가 한 줄에 들지 않아 마지막 탭(결렬·부인)이 경계에서 잘려 세로 점처럼
 *   보였고, 스크롤바를 숨겨 둔 줄이라 더 있다는 신호가 없었다(실측). 그래서 넘친 쪽 끝을 흐린다(`TAB_FADE` — 필터 레일과 같은 수단).
 *   카운트를 빼서 한 줄에 맞추는 길은 택하지 않았다 — 구간마다 몇 건인지가 이 줄이 주는 정보다.
 * ⚠ **활성 탭은 보이는 곳에 둔다** — 목록을 내리면 활성 탭이 바뀌는데(`useGroupJump`) 그 탭이 흐림 뒤에 있으면 어느 구간인지 모른다 →
 *   바뀔 때 그 탭이 흐림 안쪽에 들도록 줄만 민다. `scrollIntoView`를 쓰지 않는다 — `overflow-hidden`인 앱 프레임까지 민다(`nextjs.md`).
 * ⚠ 흐림·끌어오기는 하이드레이션 뒤에 붙는다(서버·첫 렌더는 넘침을 모른다 — `useRailOverflow`).
 */
export function GroupTabs({ counts, active, onJump, trailing }: GroupTabsProps) {
  const keys = GROUP_ORDER.filter((key) => counts[key] > 0);
  const { ref: railRef, back, forward } = useRailOverflow<HTMLElement>();
  const buttonsRef = useRef<Partial<Record<TransferGroupKey, HTMLButtonElement | null>>>({});
  const fade = back && forward ? TAB_FADE.both : back ? TAB_FADE.back : forward ? TAB_FADE.forward : null;

  useEffect(() => {
    const rail = railRef.current;
    const button = active === null ? null : buttonsRef.current[active];
    if (!rail || !button) return;
    const view = rail.getBoundingClientRect();
    const r = button.getBoundingClientRect();
    const left = r.left - (view.left + FADE_PX);
    const right = r.right - (view.right - FADE_PX);
    if (left >= 0 && right <= 0) return;
    rail.scrollBy({ left: left < 0 ? left : right, behavior: preferredScrollBehavior() });
  }, [active, railRef]);

  return (
    <div className="flex items-center gap-4 border-b border-hairline-cool px-5">
      {keys.length > 1 && (
        <nav
          ref={railRef}
          aria-label="구간 이동"
          className={cn("no-scrollbar flex min-w-0 gap-3.5 overflow-x-auto overflow-y-hidden", fade)}
        >
          {keys.map((key) => (
            <button
              key={key}
              ref={(el) => {
                buttonsRef.current[key] = el;
              }}
              type="button"
              onClick={() => onJump(key)}
              className={cn(
                "-mb-px inline-flex h-11 shrink-0 items-center gap-[5px] whitespace-nowrap border-b-2 border-transparent text-[13px] font-medium tracking-[-0.3px] text-ink-mute-2 transition-colors duration-150 ease-otb",
                active === key && "border-ink text-ink",
              )}
            >
              {GROUP_LABEL[key]}
              <span className="font-mono text-[11px] tabular-nums opacity-60">{counts[key]}</span>
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

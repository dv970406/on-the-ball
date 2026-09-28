// ⚠ 배럴이 아니라 직접 경로다 — `"use client"`가 없어 서버 렌더 여지를 남긴다(`pill.tsx`와 같은 이유)
import { cn } from "@/shared/lib/cn";
import type { TransferClub } from "../model/types";
import { TransferCrest } from "./transfer-crest";

/** 겹쳐 그리는 엠블럼 수의 상한 — 그 뒤는 `+N`으로 접는다(이름은 호출부가 전부 적는다) */
const MAX_STACK = 4;

interface CrestStackProps {
  /** 관련 구단들(언급 순). 하나면 호출부가 `TransferCrest`를 그대로 쓰는 편이 낫다 */
  clubs: readonly TransferClub[];
  /** 엠블럼 px — `TransferCrest`와 같은 값 */
  size: number;
  className?: string;
}

/**
 * 엠블럼 겹치기 — 여러 구단이 노리는 루머의 행선지 자리. 엠블럼을 아바타 스택처럼 1/4씩 겹쳐 놓는다.
 * 각 엠블럼을 캔버스색 테두리로 감싸 겹친 자리에서 서로 분리돼 보이게 한다(그림자·링을 쓰지 않는다 — `styling.md`).
 * ⚠ `+N` 원은 컨트롤이 아니라 표시 요소이지만 `rounded-full` 예외 목록을 늘리지 않으려고 `rounded-sm`이다.
 * ⚠ 이름은 여기 없다 — 엠블럼만으로는 사전 밖 구단(모노그램)을 알아볼 수 없어 호출부가 이름을 전부 적는다.
 */
export function CrestStack({ clubs, size, className }: CrestStackProps) {
  const shown = clubs.slice(0, MAX_STACK);
  const rest = clubs.length - shown.length;
  const overlap = Math.round(size / 4);
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)} style={{ paddingLeft: overlap }}>
      {shown.map((club, i) => (
        <span
          key={club.code}
          className="inline-flex rounded-sm border border-canvas bg-canvas"
          // 겹치는 폭은 크기에서 파생되는 런타임 값이라 style이다(`styling.md` 동적 값 규칙)
          style={{ marginLeft: -overlap, zIndex: shown.length - i }}
        >
          <TransferCrest club={club} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="inline-grid place-items-center rounded-sm border border-canvas bg-canvas-soft font-mono text-[10px] leading-none text-ink-mute"
          style={{ width: size, height: size, marginLeft: -overlap }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

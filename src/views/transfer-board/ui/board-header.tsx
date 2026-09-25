import type { TransferWindow } from "@/shared/config";
import { formatCount } from "@/shared/lib";
import { DeadlineCountdown } from "./deadline-countdown";

interface BoardHeaderProps {
  /** 보드가 추적하는 창의 이름 — `trackedTransferWindow(nowMs).label`(창 사이에는 방금 닫힌 창) */
  label: string;
  /** 지금 열려 있는 창 — 없으면(창과 창 사이) 카운트다운을 그리지 않는다 */
  openWindow: TransferWindow | null;
  /** 필터 무관 전체 딜 수(프로토타입 동작 유지 — 계획서 §0-1) */
  totalCount: number;
  serverNowMs: number | null;
}

/**
 * 이적시장 헤더(handoff §4-2). 상단 헤어라인은 **콘텐츠 영역의 유일한 가로선**이다 —
 * 앱바의 헤어라인은 프로젝트 `AppBar`가 이미 갖는다(계획서 §0-1).
 *
 * ⚠ 제목이 곧 화면의 `h1`이다 — 이 화면은 제목을 실제로 그리므로 sr-only h1을 따로 두지 않는다
 *   (두면 같은 글자가 두 번 읽힌다). 캐러셀 캡션(h2)이 DOM에서 앞에 오는 순서 역전은 수용한다.
 * ⚠ **카운트다운은 창이 열려 있는 동안만 있다** — 가장 먼저 여는 리그가 열린 순간부터 가장 늦게
 *   닫는 리그가 닫히는 순간까지(`openTransferWindow`). 화면을 연 채 마감을 넘기면 카운트다운이
 *   스스로 사라진다(`DeadlineCountdown`).
 */
export function BoardHeader({ label, openWindow, totalCount, serverNowMs }: BoardHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-3 border-t border-hairline-cool px-5 pb-3.5 pt-[22px]">
      <div className="min-w-0">
        <h1 className="text-[26px] font-medium leading-none tracking-[-0.9px] text-ink">이적시장</h1>
        <p className="mt-[5px] text-[12px] text-ink-mute">
          {label} · 추적 중 <span className="font-mono tabular-nums">{formatCount(totalCount)}</span>건
        </p>
      </div>
      {openWindow && <DeadlineCountdown closesAt={openWindow.closesAt} serverNowMs={serverNowMs} />}
    </div>
  );
}

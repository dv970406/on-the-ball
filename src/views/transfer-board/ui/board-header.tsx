import type { TransferWindow } from "@/shared/config";
import { formatCount } from "@/shared/lib";
import { DeadlineCountdown } from "./deadline-countdown";

interface BoardHeaderProps {
  /** 보드가 추적하는 창의 이름 — `trackedTransferWindow(nowMs).label`(창 사이에는 방금 닫힌 창) */
  label: string;
  /** 지금 열려 있는 창 — 없으면(창과 창 사이) 카운트다운을 그리지 않는다 */
  openWindow: TransferWindow | null;
  /** 필터 무관 전체 딜 수 — 필터를 걸어도 이 수는 바뀌지 않는다 */
  totalCount: number;
  serverNowMs: number | null;
}

/**
 * 이적시장 헤더. 상단 헤어라인은 캐러셀과 보드를 가르는 선이다 — 앱바의 헤어라인은 프로젝트
 * `AppBar`가 갖고, 그 아래 가로선은 구간 탭 스트립(`GroupTabs`)의 밑선 하나뿐이다(밑줄 탭이 서려면 밑선이 있어야 한다).
 *
 * ⚠ 제목이 곧 화면의 `h1`이다 — 이 화면은 제목을 실제로 그리므로 sr-only h1을 따로 두지 않는다
 *   (두면 같은 글자가 두 번 읽힌다). **DOM에서는 보드의 맨 앞이다** — 뷰가 이 블록을 격자(레일·목록·판) 밖 맨 앞에 두고,
 *   화면에서 위에 보이는 소식 캐러셀(lg 미만)은 `order-first`로 올린다(제목 순서 h1 → h2, Tab 순서는 화면 순서).
 * ⚠ **lg+에서는 제목만 남긴다(sr-only)** — 창 이름·추적 건수·카운트다운은 그 폭의 지수 띠(`IndexBand`)가 머리에서
 *   그린다. 제목 요소를 지우지 않고 가리기만 하는 이유는 **h1이 어느 폭이든 하나**여야 해서다(띠에 h1을 두면 DOM에 둘이다).
 * ⚠ **카운트다운은 창이 열려 있는 동안만 있다** — 가장 먼저 여는 리그가 열린 순간부터 가장 늦게
 *   닫는 리그가 닫히는 순간까지(`openTransferWindow`). 화면을 연 채 마감을 넘기면 카운트다운이
 *   스스로 사라진다(`DeadlineCountdown`).
 */
export function BoardHeader({ label, openWindow, totalCount, serverNowMs }: BoardHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-3 border-t border-hairline-cool px-5 pb-3.5 pt-[22px] lg:block lg:border-0 lg:p-0">
      <div className="min-w-0">
        <h1 className="text-[26px] font-medium leading-none tracking-[-0.9px] text-ink lg:sr-only">이적시장</h1>
        <p className="mt-[5px] text-[12px] text-ink-mute lg:hidden">
          {label} · 추적 중 <span className="font-mono tabular-nums">{formatCount(totalCount)}</span>건
        </p>
      </div>
      {openWindow && (
        <div className="lg:hidden">
          <DeadlineCountdown closesAt={openWindow.closesAt} serverNowMs={serverNowMs} />
        </div>
      )}
    </div>
  );
}

"use client";

import { useDeadline } from "../model/use-deadline";

interface DeadlineCountdownProps {
  /** 창 마감 시각(UTC ISO) — 가장 늦게 닫는 리그의 마감(`openTransferWindow(nowMs).closesAt`) */
  closesAt: string;
  /** 서버가 렌더한 시각 — 없으면 `null`(클라이언트 시계로 떨어진다) */
  serverNowMs: number | null;
}

/** 두 자리 0 채움 — 일 수가 100을 넘으면 그대로 세 자리다(`padStart`는 자르지 않는다) */
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * `마감까지 / 06일 14:22:08` — 헤더 우측의 마감 카운트다운(handoff §4-2).
 *
 * ⚠ **마감에 닿으면 라벨째 사라진다.** `00일 00:00:00`을 남기지 않는다 — 닫힌 창의 카운트다운은
 *   보여줄 것이 없다. 다음 창이 열릴 때까지 헤더에는 창 이름과 건수만 남는다.
 * ⚠ **1초 틱의 리렌더를 이 컴포넌트 안에 가둔다.** 헤더나 뷰가 시계를 들면 매초 보드 전체가
 *   다시 그려진다 — 그래서 `useDeadline`의 state가 여기서만 산다.
 * ⚠ 숫자는 mono + `tabular-nums`(handoff §0). `whitespace-nowrap`이 없으면 좁은 폭에서
 *   `일`과 시각 사이가 접힌다.
 */
export function DeadlineCountdown({ closesAt, serverNowMs }: DeadlineCountdownProps) {
  const remaining = useDeadline(closesAt, serverNowMs);
  if (remaining === "closed") return null;

  const text = remaining
    ? `${pad(remaining.days)}일 ${pad(remaining.hours)}:${pad(remaining.minutes)}:${pad(remaining.seconds)}`
    : "--일 --:--:--";

  return (
    <div className="flex-none text-right">
      <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2">마감까지</span>
      <time
        dateTime={closesAt}
        className="mt-1 block whitespace-nowrap font-mono text-[15px] leading-none tabular-nums text-ink"
      >
        {text}
      </time>
    </div>
  );
}

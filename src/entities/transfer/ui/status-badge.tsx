import { CircleX } from "lucide-react";
// ⚠ 배럴이 아니라 직접 경로다 — `"use client"`가 없어 서버 렌더 여지를 남긴다(`pill.tsx`와 같은 이유)
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui";
import { STAGE_STATUS, STATUS_LABEL } from "../lib/stage";
import type { TransferStage, TransferStatus } from "../model/types";

/**
 * 톤별 클래스 — 판별자(`TransferStatus`)가 이미 있어 `Record` 클래스 맵이다(`styling.md`).
 * ⚠ **에메랄드는 `official` 하나다.** 오피셜은 한 화면에 여럿일 수 있지만(오피셜 구간·캐러셀)
 *   CTA가 아니라 상태 표시라 "눌러야 할 곳 하나" 셈에 들어가지 않고, 글자를 담아 "색이 정보를
 *   혼자 지지 않는다"도 만족한다(`match-card`의 적중 배지·`'필독'` 배지와 같은 자리).
 * ⚠ `Pill variant="green"`을 쓰지 않는다 — 톤이 여섯이라 `Pill`의 variant와 맞지 않고,
 *   에메랄드 대조 검사는 이 파일의 `bg-primary` 리터럴을 직접 센다.
 */
const STATUS_CLASS: Record<TransferStatus, string> = {
  official: "bg-primary text-on-primary",
  hwg: "bg-ink text-white",
  imminent: "border border-ink text-ink",
  talks: "border border-hairline-strong text-ink-secondary",
  rumor: "border border-hairline-cool bg-canvas-soft text-ink-mute",
  dead: "border border-crimson/35 text-crimson",
};

/** 목록 행의 결렬 — 크림슨 채움 + 흰 글자 + 아이콘. 행이 `grayscale`이라 회색으로 보인다 */
const DEAD_INLINE_CLASS = "bg-crimson text-white";

interface StatusBadgeProps {
  stage: TransferStage;
  /** 목록 행 안의 변형 — 결렬만 채움+아이콘으로 바뀐다. 다른 상태는 기본과 같다 */
  inline?: boolean;
  className?: string;
}

/**
 * 상태 뱃지 — 단계를 여섯 톤으로 접어 그린다(handoff §3 `Status`). **확률 병합은 없다**(보류).
 * ⚠ 알약(`rounded-full`)은 컨트롤이 아니라 표시 요소라 `styling.md` 예외 표의 "대상이 아닌 것"이다.
 * ⚠ `unknown` 단계는 아무것도 그리지 않는다 — 딜에는 애초에 들어오지 않는다.
 */
export function StatusBadge({ stage, inline, className }: StatusBadgeProps) {
  const status = STAGE_STATUS[stage];
  if (status === null) return null;
  const deadInline = inline === true && status === "dead";
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-[3px] whitespace-nowrap rounded-full px-2 text-[11px] font-medium leading-none",
        deadInline ? DEAD_INLINE_CLASS : STATUS_CLASS[status],
        className,
      )}
    >
      {deadInline && <Icon as={CircleX} size={11} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

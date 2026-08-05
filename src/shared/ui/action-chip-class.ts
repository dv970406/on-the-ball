/**
 * 카운터형 액션 칩의 시각 스타일 — 색·형태의 단일 소스.
 *
 * ⚠ `ActionChip`("use client")과 파일을 나눠 둔 이유는 `button-class.ts` ↔ `button.tsx`와 같다.
 *   `Link`로 렌더해야 하는 자리(비로그인 좋아요 → 로그인 유도)가 있는데
 *   `Link` 안에 `button`을 넣을 수 없어 클래스만 필요하다. 전에는 그 6개 유틸을
 *   `like-button.tsx`가 손으로 재현해서, 칩 높이를 바꾸면 한쪽만 예전 모습으로 남았다.
 */
import { cn } from "@/shared/lib/cn";

export interface ActionChipStyle {
  /** 눌린 상태 — 에메랄드로 채워진다. 상세 화면에서는 좋아요 하나만 이 상태를 가질 수 있다 */
  active?: boolean;
  className?: string;
}

export function actionChipClassName({ active, className }: ActionChipStyle = {}) {
  return cn(
    "inline-flex h-9 items-center gap-1.5 rounded-full border px-[13px]",
    "font-mono text-xs tabular-nums",
    "transition-colors duration-150 ease-otb",
    active
      ? "border-primary bg-primary text-on-primary"
      : "border-hairline bg-canvas text-ink-secondary",
    className,
  );
}

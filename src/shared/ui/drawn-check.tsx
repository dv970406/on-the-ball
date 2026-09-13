// ⚠ 배럴이 아니라 직접 경로다 — 서버 렌더 여지를 남긴다(사유는 empty-state.tsx에).
import { cn } from "@/shared/lib/cn";

interface DrawnCheckProps {
  /** 한 변(px) — 기본 16 */
  size?: number;
  /** 획이 그려지며 나타나는가. 거짓이면 처음부터 다 그려진 채다(SSR·이미 고른 상태) */
  animate?: boolean;
  className?: string;
}

/**
 * 획이 그려지는 체크 — "내가 고른 것"을 표시한다(Apple Pay·Stripe의 결제 완료 체크).
 *
 * ⚠ lucide의 `Check`를 쓰지 않고 path를 직접 갖는다. 획 길이(`stroke-dasharray`)를 path에
 *   맞춰 고정해야 하는데, 아이콘 라이브러리의 path는 버전이 오르면 바뀔 수 있다.
 *   `M4 12.5l5 5L20 6.5`의 길이는 약 22.3 → 24로 넉넉히 잡았다.
 * ⚠ **`animate`의 판정은 호출부가 한다** — "방금 골랐다"는 부모(`aria-pressed`를 바꾸는 쪽)만
 *   안다. `CountUp`과 달리 등장 모션 판정을 안에서 하지 않는 이유다: 이미 고른 채로
 *   클라이언트 이동해 온 화면에서 체크가 다시 그려지면 "지금 골랐다"는 거짓 신호가 된다.
 * ⚠ 색은 `currentColor` — 분할 카드 면의 `text_color`와 잉크 어느 쪽에도 그대로 얹힌다.
 */
export function DrawnCheck({ size = 16, animate = false, className }: DrawnCheckProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
    >
      <path
        d="M4 12.5l5 5L20 6.5"
        className={cn(
          "fill-none stroke-current stroke-[3] [stroke-linecap:round] [stroke-linejoin:round]",
          animate &&
            "[stroke-dasharray:24] [stroke-dashoffset:24] animate-[check-draw_260ms_cubic-bezier(0.2,0,0,1)_120ms_forwards]",
        )}
      />
    </svg>
  );
}

import { cn } from "@/shared/lib";

interface VsBadgeProps {
  /** 지름(px) — 기본 64 (홈 캐러셀 등 축소 배지는 사이즈만 줄이면 글자도 비례 축소) */
  size?: number;
  /** true면 등장 시 pop 애니메이션 (vs-pop 키프레임 — translate/rotate 포함) */
  animate?: boolean;
  className?: string;
}

/**
 * 대각선 스플릿 중앙의 기울어진 VS 배지.
 * 부모 컨테이너가 relative여야 한다 (left/top 50% + translate(-50%,-50%) 배치).
 */
export function VsBadge({ size = 64, animate = false, className }: VsBadgeProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute left-1/2 top-1/2 z-[2] flex items-center justify-center rounded-full border-4 border-white bg-primary font-bold tracking-[-0.6px] text-on-primary shadow-[0_8px_20px_rgba(0,0,0,0.18)]",
        // ⚠ -translate-x-1/2 등 표준 유틸 금지 — Tailwind v4는 이를 transform이 아닌 개별
        //    translate 프로퍼티로 출력하는데, vs-pop 키프레임이 transform으로 translate(-50%,-50%)를
        //    직접 애니메이트하므로 둘이 합성되어 -50%가 이중 적용된다(배지 위치 붕괴).
        "[transform:translate(-50%,-50%)_rotate(-12deg)]",
        animate && "animate-vs-pop",
        className,
      )}
      style={{
        width: size,
        height: size,
        // 기준 64px일 때 22px — 사이즈에 비례
        fontSize: Math.round((size * 22) / 64),
      }}
    >
      VS
    </span>
  );
}

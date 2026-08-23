import { cn } from "@/shared/lib/cn";

interface VsBadgeProps {
  /** 지름(px) — 기본 64 */
  size?: number;
  /** 등장 pop 애니메이션 */
  animate?: boolean;
}

/**
 * 분할 면이 만나는 접합점의 기울어진 VS 배지. 부모가 `relative`여야 한다.
 *
 * ⚠ **`-translate-x-1/2` 같은 표준 유틸을 절대 쓰지 않는다.** `vs-pop` 키프레임이
 *   `transform: translate(-50%,-50%)`를 직접 애니메이트하는데, Tailwind v4는 `translate-*`를
 *   `transform`이 아닌 **개별 `translate` 프로퍼티**로 출력한다 → 둘이 합성되어 -50%가
 *   두 번 먹고 배지 위치가 무너진다(styling.md가 이 사례를 이름으로 못박아 두었다).
 *
 * ⚠ **그림자를 두지 않는다.** v1은 `shadow-[0_8px_20px_...]`를 썼지만 `border-4 border-white`가
 *   이미 면과 배지를 갈라 놓는다 — 예외 목록을 늘릴 이유가 없다(styling.md의 그림자 규칙).
 *
 * ⚠ `motion-safe:`를 붙이지 않는다. 전역 `prefers-reduced-motion` 블록이 duration을 0.01ms로
 *   누르고 `both` fill이 최종 상태를 남기므로, 접두어 없이 써야 reduce 환경에서도 **보인다.**
 *
 * ⚠ `"use client"` 없음 — 순수 렌더라 서버 렌더 여지를 남긴다(`cn`을 직접 경로로 가져오는 이유).
 */
export function VsBadge({ size = 64, animate = false }: VsBadgeProps) {
  return (
    <span
      aria-hidden
      className={cn(
        // ⚠ **세 도형의 접합점이 전부 카드 정중앙이다**(split-layout 주석). 폴리곤을 고쳐
        //   그 불변식을 깨면 배지가 시임에서 떨어진다.
        "absolute left-1/2 top-1/2 z-[2] flex items-center justify-center rounded-full border-4 border-white bg-primary font-bold tracking-[-0.6px] text-on-primary",
        "[transform:translate(-50%,-50%)_rotate(-12deg)]",
        animate && "animate-vs-pop",
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

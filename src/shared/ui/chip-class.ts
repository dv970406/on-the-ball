import { cn } from "@/shared/lib/cn";

/**
 * 칩(필터·구간 레일)의 시각 스타일 — 형태의 단일 소스.
 *
 * ⚠ **컴포넌트가 아니라 클래스 함수다**: 레일이 **이동**이면 링크(`next/link`의 `<Link>` 또는 이적 보드의
 *   `BoardLink` 앵커)가 그려야 하는데 앵커 안에 `button`을 넣을 수 없다 — `buttonClassName`과 같은 이유다.
 *
 * ⚠ 선택 시 잉크 블랙이다(에메랄드 아님). 활성 탭 아이콘은 에메랄드인데 이 칩은 아닌 것이
 *   원칙으로는 갈리지 않는다(둘 다 `aria-current="page"`인 링크다) — **판정은 `styling.md`의
 *   에메랄드 자리 표가 하고**, 이 파일은 거기 없다. 칠하려면 표와 검사에 함께 올린다.
 * ⚠ 라운드는 6px(`rounded-sm`) — 알약형 금지 규칙의 대상이다.
 * ⚠ **글자색은 전환하지 않는다.** 배경(잉크↔흰색)과 글자색(흰색↔잉크)을 같은 150ms로 함께
 *   보간하면 중간 지점에서 회색 위 회색이 되어 **라벨이 사라진 것처럼 보인다**(실측 ~75ms).
 */
export function chipClassName(selected: boolean, className?: string) {
  return cn(
    "shrink-0 rounded-sm border px-[13px] py-[9px] text-[13px] font-medium leading-none",
    "transition-[background-color,border-color] duration-150 ease-otb",
    selected
      ? "border-ink bg-ink text-white"
      : "border-hairline bg-canvas text-ink-mute active:bg-canvas-soft",
    className,
  );
}

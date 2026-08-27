import { cn } from "@/shared/lib/cn";

/**
 * 말머리 칩의 시각 스타일 — 형태의 단일 소스.
 *
 * ⚠ **`Chip`(`button`)과 파일을 나눈 이유**: 목록의 말머리 레일은 이제 **이동**이라
 *   `next/link`의 `<Link>`가 그려야 하는데(크롤러가 말머리 페이지를 발견하는 유일한 경로),
 *   `Link` 안에 `button`을 넣을 수 없다. 작성 폼은 이동이 아니라 **선택**이라 `Chip` 그대로다.
 *   `buttonClassName`↔`Button`, `actionChipClassName`↔`ActionChip`과 같은 형태다.
 *
 * ⚠ 선택 시 잉크 블랙이다(에메랄드 아님). 활성 탭 아이콘은 에메랄드인데 이 칩은 아닌 것이
 *   원칙으로는 갈리지 않는다(둘 다 `aria-current="page"`인 `Link`다) — **판정은 `styling.md`의
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

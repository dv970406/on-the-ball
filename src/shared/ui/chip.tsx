"use client";

import type { ButtonHTMLAttributes } from "react";
import { chipClassName } from "./chip-class";

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  selected?: boolean;
}

/**
 * 말머리 칩 (프로토타입 `.cm-chip`) — **작성 폼의 말머리 선택**이 쓴다.
 *
 * ⚠ 목록의 필터 레일은 더 이상 이걸 쓰지 않는다 — 거기선 칩이 **이동**이라
 *   `<Link>` + `chipClassName`이다(크롤러가 말머리 페이지를 발견하는 경로).
 *
 * 시각 스타일은 `chipClassName`이 단독으로 소유한다 — 두 소비자의 형태가 갈리지 않게.
 */
export function Chip({ selected, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={chipClassName(selected === true, className)}
      {...props}
    />
  );
}

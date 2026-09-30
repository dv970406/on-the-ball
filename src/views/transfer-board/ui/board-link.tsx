"use client";

import type { ComponentProps, MouseEvent } from "react";
import { navigateBoard } from "../model/use-board-filters";

interface BoardLinkProps extends Omit<ComponentProps<"a">, "href" | "onClick"> {
  /** 보드 URL — `boardHref`로 만든다 */
  href: string;
}

/**
 * 필터·정렬 링크 — **앵커로 남되 누르면 서버를 부르지 않는다**(`navigateBoard`).
 *
 * ⚠ `href`를 지우고 `button`으로 바꾸지 않는다 — 새 탭 열기·주소 복사·공유가 이 주소에 기대고, 선택 표시도 링크의
 *   `aria-current="page"`다.
 * ⚠ 수정 키(⌘·Ctrl·Shift·Alt)나 가운데 버튼 클릭은 가로채지 않는다 — 브라우저의 새 탭·새 창 동작이 그대로 가야 한다.
 * ⚠ Next `<Link>`가 아니다 — 뷰포트에 들어올 때마다 쓰지 않을 프리페치가 나가고, 누르면 서버 렌더를 기다린다.
 */
export function BoardLink({ href, ...props }: BoardLinkProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigateBoard(href);
  };

  return <a {...props} href={href} onClick={handleClick} />;
}

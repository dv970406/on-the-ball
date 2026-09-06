"use client";

import Link from "next/link";
import { cn } from "@/shared/lib";

/**
 * 목록의 '삭제됨' 필터 — 네 화면이 같은 모양을 쓴다.
 *
 * ⚠ **상태를 URL이 소유한다**(`?deleted=1`). 로컬 state로 두면 뒤로가기가 필터를 잃고,
 *   `useSearchParams`는 프리렌더를 CSR로 떨어뜨리므로 서버 page가 읽어 prop으로 내린다.
 * ⚠ 정렬 레일과 같은 형태다 — 이동이므로 `aria-current="page"`.
 */
export function AdminFilterRail({ basePath, deleted }: { basePath: string; deleted: boolean }) {
  const items = [
    { label: "사용 중", href: basePath, active: !deleted },
    { label: "삭제됨", href: `${basePath}?deleted=1`, active: deleted },
  ];

  return (
    <nav
      aria-label="표시 상태"
      className="flex items-center gap-3.5 border-b border-hairline-cool px-5 pb-2.5 pt-2.5"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "py-1.5 text-[12px] transition-colors duration-150 ease-otb",
            item.active ? "font-medium text-ink" : "text-ink-mute-2",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

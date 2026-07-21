import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/shared/lib";

type NightCardProps = {
  /** 있으면 카드 전체가 링크(next/link) — 없으면 div */
  href?: string;
  /** 패딩·레이아웃 변주 (예: "p-[18px]", "p-5 flex items-center gap-3.5") */
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
};

/**
 * 다크 카드 쉘 — canvas-night 배경 + 흰 텍스트 + rounded-xl.
 * 내부 콘텐츠(eyebrow·본문)는 뷰마다 다르므로 children으로 받는다.
 * 색 토큰(bg-canvas-night 등)을 단일 소스화하는 게 목적.
 */
export function NightCard({ href, className, children, ...rest }: NightCardProps) {
  const cls = cn("rounded-xl bg-canvas-night text-white", className);

  if (href) {
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}

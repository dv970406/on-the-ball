"use client";

import Link from "next/link";

interface SectionHeadProps {
  title: string;
  /** 우측 보조 액션 라벨 (예: "전체 보기") */
  more?: string;
  /** 경로 이동인 경우 — Link로 렌더(prefetch·새 탭 지원). onMore보다 우선. */
  moreHref?: string;
  onMore?: () => void;
}

const moreClassName = "ml-auto text-xs text-ink-mute";

/** 홈/리스트 섹션 헤더 */
export function SectionHead({ title, more, moreHref, onMore }: SectionHeadProps) {
  return (
    <div className="mb-3 flex items-baseline gap-2 px-5">
      <h2 className="text-[19px] font-semibold tracking-[-0.4px] text-ink">{title}</h2>
      {more && moreHref ? (
        <Link href={moreHref} className={moreClassName}>
          {more}
        </Link>
      ) : more ? (
        <button type="button" className={moreClassName} onClick={onMore}>
          {more}
        </button>
      ) : null}
    </div>
  );
}

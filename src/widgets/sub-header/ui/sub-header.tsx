"use client";

import { ChevronLeft, Share2 } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { Icon } from "@/shared/ui";
import { useBackOrFallback } from "../model/use-back-or-fallback";
import { useShareLink } from "../model/use-share-link";

interface SubHeaderProps {
  /** 헤더 크롬 라벨 겸 공유 시트에 실리는 이름 */
  title: string;
  /**
   * 딥링크 진입 등 history가 없을 때 돌아갈 경로.
   * ⚠ 기본값이 `ROUTES.home`이 아니다 — `/`는 화면이 아니라 리다이렉트라 링크 목적지로 쓰지 않는다(`reuse.md`).
   */
  fallbackHref?: string;
}

/**
 * 디테일 화면 상단 헤더 — 뒤로가기 + 타이틀 + 공유.
 *
 * ⚠ 여기 타이틀은 **크롬**이지 페이지 heading이 아니다. 화면의 h1은 각 뷰가 따로 둔다.
 */
export function SubHeader({ title, fallbackHref = ROUTES.transferList }: SubHeaderProps) {
  const handleBack = useBackOrFallback(fallbackHref);
  const handleShare = useShareLink(title);

  return (
    // ⚠ 배경은 불투명이다. blur는 하단 탭바에서만 허용된다(`styling.md`).
    // ⚠ z 스케일: 앱바 5 < 서브헤더 20 < 하단바 70 < 오버레이 80.
    <header className="sticky top-0 z-20 flex items-center gap-0.5 border-b border-hairline-cool bg-canvas px-2 pb-2.5 pt-[max(16px,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={handleBack}
        aria-label="뒤로가기"
        className="flex size-11 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        <Icon as={ChevronLeft} size={22} />
      </button>

      <div className="text-[15px] font-semibold tracking-[-0.3px] text-ink">{title}</div>

      <div className="ml-auto flex items-center">
        <button
          type="button"
          onClick={handleShare}
          aria-label="공유"
          className="flex size-11 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft"
        >
          <Icon as={Share2} size={18} />
        </button>
      </div>
    </header>
  );
}

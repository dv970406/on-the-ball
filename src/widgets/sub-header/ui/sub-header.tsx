"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Share2 } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { Icon } from "@/shared/ui";

interface SubHeaderProps {
  title: string;
  /** 딥링크 진입 등 history가 없을 때 돌아갈 경로 */
  fallbackHref?: string;
}

/**
 * 디테일 화면 상단 헤더 — 뒤로가기 + 타이틀 + 공유.
 *
 * ⚠ 여기 타이틀은 **크롬**이지 페이지 heading이 아니다. 화면의 h1은 각 뷰가 따로 둔다
 *   (상세는 글 제목, 작성·수정은 sr-only h1).
 */
export function SubHeader({ title, fallbackHref = ROUTES.home }: SubHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    // 앱 밖에서 바로 진입한 경우 뒤로가기가 이탈이 되지 않도록 fallback
    if (window.history.length > 1) router.back();
    else router.replace(fallbackHref);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      // 사용자가 공유를 취소한 경우 — 무시
    }
  };

  return (
    <header className="sticky top-0 z-[15] flex items-center gap-1 border-b border-hairline-cool bg-canvas/92 px-2 pb-2.5 pt-[max(16px,env(safe-area-inset-top))] backdrop-blur-[14px]">
      <button
        type="button"
        onClick={handleBack}
        aria-label="뒤로가기"
        className="flex size-9 items-center justify-center rounded-full text-ink"
      >
        <Icon as={ChevronLeft} size={22} />
      </button>

      <div className="text-[15px] font-semibold text-ink">{title}</div>

      <button
        type="button"
        onClick={handleShare}
        aria-label="공유"
        className="ml-auto flex size-9 items-center justify-center rounded-full text-ink-mute"
      >
        <Icon as={Share2} size={18} />
      </button>
    </header>
  );
}

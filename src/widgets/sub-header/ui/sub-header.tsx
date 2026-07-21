"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Share2 } from "lucide-react";
import { cn } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import { Icon } from "@/shared/ui";

interface SubHeaderProps {
  title: string;
  /** 다크 배경 화면용 (랭킹 히어로 등) */
  dark?: boolean;
  /** 딥링크 진입 등 history가 없을 때 돌아갈 경로 */
  fallbackHref?: string;
}

/** 디테일 화면 상단 헤더 — 뒤로가기 + 타이틀 + 공유 */
export function SubHeader({ title, dark = false, fallbackHref = ROUTES.home }: SubHeaderProps) {
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
    <header
      className={cn(
        "sticky top-0 z-[15] flex items-center gap-1 border-b px-2 pb-2.5 pt-[max(16px,env(safe-area-inset-top))] backdrop-blur-[14px]",
        dark
          ? "border-white/[0.08] bg-[rgba(23,23,23,0.85)]"
          : "border-hairline-cool bg-[rgba(255,255,255,0.92)]",
      )}
    >
      <button
        type="button"
        onClick={handleBack}
        aria-label="뒤로가기"
        className={cn(
          "flex size-9 items-center justify-center rounded-full",
          dark ? "text-white" : "text-ink",
        )}
      >
        <Icon as={ChevronLeft} size={22} />
      </button>

      <div className={cn("text-[15px] font-semibold", dark ? "text-white" : "text-ink")}>
        {title}
      </div>

      <button
        type="button"
        onClick={handleShare}
        aria-label="공유"
        className={cn(
          "ml-auto flex size-9 items-center justify-center rounded-full",
          dark ? "text-white/70" : "text-ink-mute",
        )}
      >
        <Icon as={Share2} size={18} />
      </button>
    </header>
  );
}

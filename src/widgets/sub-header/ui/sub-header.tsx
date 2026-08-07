"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Share2 } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { useToast } from "@/shared/lib";
import { Icon } from "@/shared/ui";

interface SubHeaderProps {
  title: string;
  /** 딥링크 진입 등 history가 없을 때 돌아갈 경로 */
  fallbackHref?: string;
  /** 공유 버튼 오른쪽에 덧붙일 액션(상세의 오버플로 ··· 버튼) */
  actions?: ReactNode;
}

/**
 * 디테일 화면 상단 헤더 — 뒤로가기 + 타이틀 + 공유.
 *
 * ⚠ 여기 타이틀은 **크롬**이지 페이지 heading이 아니다. 화면의 h1은 각 뷰가 따로 둔다
 *   (상세는 글 제목, 작성·수정은 sr-only h1).
 */
export function SubHeader({ title, fallbackHref = ROUTES.home, actions }: SubHeaderProps) {
  const router = useRouter();
  const toast = useToast();

  const handleBack = () => {
    // 앱 밖에서 바로 진입한 경우 뒤로가기가 이탈이 되지 않도록 fallback
    if (window.history.length > 1) router.back();
    else router.replace(fallbackHref);
  };

  /**
   * 공유 — Web Share API가 있으면 OS 시트, 없으면 클립보드 복사.
   *
   * ⚠ **결과를 반드시 알린다.** 클립보드 폴백은 화면이 전혀 변하지 않아서, 토스트가 없으면
   *   눌러도 아무 일도 안 일어난 것처럼 보인다(앱의 다른 액션은 전부 토스트를 띄운다).
   * ⚠ `navigator.clipboard`는 **보안 컨텍스트에서만 존재한다.** http로 붙는 실기기 테스트
   *   (`http://192.168.x.x`)에서는 undefined라 그냥 두면 TypeError가 catch에 삼켜져 무반응이 된다.
   * ⚠ 사용자가 OS 공유 시트를 **취소하면 `AbortError`** 가 난다 — 이건 실패가 아니므로
   *   조용히 넘긴다. 구분하지 않으면 취소할 때마다 실패 토스트가 뜬다.
   */
  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      toast("링크를 복사했어요");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error("[share] 공유 실패:", e);
      toast("링크를 복사하지 못했어요");
    }
  };

  return (
    // ⚠ 배경은 불투명이다. blur는 하단 탭바에서만 허용된다(핸드오프 6-3) —
    //   전에 쓰던 bg-canvas/92 + backdrop-blur를 걷어냈다.
    // ⚠ z는 핸드오프의 스케일을 따른다: 앱바 5 < 서브헤더 20 < 하단바 60.
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
        {actions}
      </div>
    </header>
  );
}

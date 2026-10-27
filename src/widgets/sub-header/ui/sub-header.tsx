"use client";

import { useState } from "react";
import { ChevronLeft, Link2, MessageCircle, Share2 } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { Icon, Sheet, SheetItem } from "@/shared/ui";
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
  const share = useShareLink(title);
  /**
   * 공유 시트 — 카카오톡 공유를 쓸 수 있을 때만 연다. 없으면 공유 버튼이 곧바로 OS 공유(없으면 링크 복사)로 간다 — 고를 것이
   * 하나뿐인데 한 단계를 더 끼우지 않는다.
   * ⚠ "다른 앱으로 공유"는 OS 공유 시트가 있는 브라우저에서만 보인다 — 여는 순간에 판정한다(렌더 중에 `navigator`를 읽으면
   *   서버 HTML과 갈린다. 시트는 처음에 닫혀 있어 서버가 그 항목을 그리지 않는다).
   */
  const [sheet, setSheet] = useState<{ native: boolean } | null>(null);
  const handleShare = () => {
    if (!share.kakaoEnabled) {
      share.shareNative();
      return;
    }
    share.prepare();
    setSheet({ native: typeof navigator.share === "function" });
  };
  // 항목을 누르면 시트를 닫고 고른 공유를 한다 — 카카오 창·OS 시트가 열리는 것이 그 결과다
  const pick = (action: () => Promise<void>) => () => {
    setSheet(null);
    action();
  };

  return (
    <>
      {/*
        ⚠ 배경은 불투명이다. blur는 하단 탭바에서만 허용된다(`styling.md`).
        ⚠ z 스케일: 앱바 5 < 서브헤더 20 < 하단바 70 < 오버레이 80.
        ⚠ **`<header>`가 아니라 `<div>`다.** 이 줄은 `<main>` 밖 프레임 직속이라 `<header>`면 `banner` 랜드마크가 되는데,
          1024px부터는 데스크톱 상단 바(`TopBar`)의 `<header>`도 같은 자리에 있어 banner가 둘이 된다(실측).
          요소는 폭으로 바꿀 수 없으므로 한쪽을 내려놓는다 — 사이트 전체의 머리는 상단 바이고, 이 줄은
          그 화면의 뒤로가기·공유 도구 줄일 뿐이다. 1024px 미만에서 이 화면들의 banner가 사라지는 것은
          수용한다(제목은 각 뷰의 h1이, 두 버튼은 자기 이름으로 찾힌다).
        ⚠ 위 safe-area는 1024px부터 상단 바가 받는다 — 여기서 한 번 더 받지 않게 `lg:pt-4`로 되돌린다.
      */}
      <div className="sticky top-0 z-20 flex items-center gap-0.5 border-b border-hairline-cool bg-canvas px-2 pb-2.5 pt-[max(16px,env(safe-area-inset-top))] lg:pt-4">
        <button
          type="button"
          onClick={handleBack}
          aria-label="뒤로가기"
          className="flex size-11 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft"
        >
          <Icon as={ChevronLeft} size={22} />
        </button>

        {/* 지금은 `section-title`과 같은 모양이지만 쓰지 않는다 — 섹션 제목이 아니라 크롬(도구 줄)의 화면 이름이라
            섹션 제목의 모양을 바꿀 때 함께 바뀌면 안 된다 */}
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
      </div>

      {/*
        공유 시트 — 도구 줄의 **형제**다. 도구 줄이 `sticky`라 안에 두면 시트(`absolute`)의 기준이 그 줄이 되어 줄 안에 뜬다
        (탭바의 로그인 안내를 `<nav>`의 형제로 두는 것과 같은 이유). 트랩이 여는 클릭보다 먼저 있어야 해 닫힌 채로도 마운트한다.
        ⚠ 카카오 항목에 카카오의 노란색을 칠하지 않는다 — 브랜드 색 예외는 로그인 화면뿐이다(`styling.md`). 글자가 뜻을 진다.
      */}
      <Sheet open={sheet !== null} onClose={() => setSheet(null)} label="공유">
        <SheetItem onClick={pick(share.shareKakao)}>
          <Icon as={MessageCircle} size={20} />
          카카오톡으로 공유
        </SheetItem>
        <SheetItem onClick={pick(share.copyLink)}>
          <Icon as={Link2} size={20} />
          링크 복사
        </SheetItem>
        {sheet?.native && (
          <SheetItem onClick={pick(share.shareNative)}>
            <Icon as={Share2} size={20} />
            다른 앱으로 공유
          </SheetItem>
        )}
      </Sheet>
    </>
  );
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib";
import { useToastStore } from "@/shared/lib/toast-store";
import { ROUTES } from "@/shared/config";

/** 자동 소멸까지 — 프로토타입과 동일 */
const TOAST_DURATION_MS = 1800;

/**
 * 토스트 표시 영역 — 루트(AppProviders)에 하나만 둔다.
 *
 * ⚠ 위치 기준은 430px 프레임이 **아니다.** `providers.tsx`에서 프레임 div의 *형제*로
 *   렌더되므로 absolute의 기준은 초기 컨테이닝 블록(뷰포트)이다. 프레임이
 *   `mx-auto h-dvh`라 좌표가 결과적으로 일치한다 — 프레임 정렬을 바꾸면 여기도 봐야 한다.
 *
 * ⚠ 탭바가 있는 화면에서는 토스트를 그 위로 올려야 가리지 않는다(112px / 40px).
 *   전에는 목록 화면이 전역 스토어에 present를 올리는 방식이었는데,
 *   탭바를 렌더하는 화면이 목록 하나뿐이라 **경로만 보면 충분하다.**
 *   그 편이 shared가 "탭바"라는 상위 도메인 개념을 모르게 되고,
 *   boolean 스토어가 화면 2개에서 서로 덮어쓰는 문제도 원천적으로 없다.
 */
export function ToastViewport() {
  const message = useToastStore((s) => s.message);
  const seq = useToastStore((s) => s.seq);
  const dismiss = useToastStore((s) => s.dismiss);
  const aboveTabBar = usePathname() === ROUTES.postList;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
    // seq가 의존성에 있어야 같은 문구를 다시 띄웠을 때 타이머가 재시작된다
  }, [message, seq, dismiss]);

  if (!message) return null;

  return (
    <div
      // aria-live로 스크린리더에도 전달한다. 중단성이 없는 알림이라 polite.
      role="status"
      aria-live="polite"
      className={cn(
        "absolute left-1/2 z-[95] whitespace-nowrap rounded-sm",
        // ⚠ translate 표준 유틸이 아니라 arbitrary property다 — 같은 요소에 animation이 있으면
        //   `translate` 개별 프로퍼티가 `transform`과 합성되어 조용히 어긋난다(styling.md).
        "[transform:translateX(-50%)]",
        "bg-ink/95 px-4 py-[11px] text-[13px] text-white",
        "motion-safe:animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]",
        aboveTabBar ? "bottom-[112px]" : "bottom-10",
      )}
    >
      {message}
    </div>
  );
}

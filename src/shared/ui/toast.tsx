"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn, useToastStore } from "@/shared/lib";
import { TAB_BAR_ROUTES } from "@/shared/config";

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
 *   전에는 목록 화면이 전역 스토어에 present를 올리는 방식이었는데, 경로로 판정하는 편이
 *   shared가 "탭바"라는 상위 도메인 개념을 모르게 되고 boolean 스토어가 화면 둘에서 서로
 *   덮어쓰는 문제도 없다.
 * ⚠ **판정 목록은 `TAB_BAR_ROUTES`가 단독으로 소유한다.** 여기서 `pathname === ROUTES.postList`로
 *   직접 비교하던 시절, 프로필에도 탭바가 생기면서 **토스트가 탭바를 덮었다** — 두 곳이 같아야
 *   하는 규약은 상수 하나가 갖는다.
 */
export function ToastViewport() {
  const message = useToastStore((s) => s.message);
  const seq = useToastStore((s) => s.seq);
  const dismiss = useToastStore((s) => s.dismiss);
  const aboveTabBar = TAB_BAR_ROUTES.includes(usePathname());

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
    // seq가 의존성에 있어야 같은 문구를 다시 띄웠을 때 타이머가 재시작된다
  }, [message, seq, dismiss]);

  return (
    <div
      /**
       * ⚠ **리전은 항상 DOM에 있고 안의 문구만 바뀐다.** 리전과 내용이 같은 순간에 마운트되면
       *   발화가 불안정하다(특히 iOS VoiceOver — 이 앱은 모바일 전용이라 그쪽이 주 사용자다).
       *   그래서 `if (!message) return null`로 통째로 언마운트하지 않는다.
       * ⚠ **이것이 앱의 유일한 알림 채널이다.** 화면마다 `role="status"`를 뿌리는 대신
       *   알릴 것은 `useToast()`로 여기 태운다.
       */
      role="status"
      aria-live="polite"
      className={cn(
        // 빈 상태에서도 남아 있으므로 탭을 가로채지 않게 한다(아래 탭바·FAB가 이 영역에 있다)
        "pointer-events-none absolute left-1/2 z-[95]",
        // ⚠ translate 표준 유틸이 아니라 arbitrary property다 — 같은 요소에 animation이 있으면
        //   `translate` 개별 프로퍼티가 `transform`과 합성되어 조용히 어긋난다(styling.md).
        "[transform:translateX(-50%)]",
        aboveTabBar ? "bottom-[112px]" : "bottom-10",
      )}
    >
      {/* 애니메이션은 안쪽 말풍선이 갖는다 — 바깥 리전은 계속 살아 있어야 한다 */}
      {message && (
        <div
          className={cn(
            "whitespace-nowrap rounded-sm bg-ink/95 px-4 py-[11px] text-[13px] text-white",
            "motion-safe:animate-[cm-fade_0.2s_cubic-bezier(0.2,0,0,1)_both]",
          )}
        >
          {message}
        </div>
      )}
    </div>
  );
}

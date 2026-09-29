import type { ReactNode } from "react";
import { Wordmark } from "@/shared/ui";

/**
 * 목록 화면 상단 앱바 — 스티키, 하단 헤어라인.
 *
 * ⚠ 배경은 **불투명**이다. blur는 하단 탭바에서만 허용된다.
 * ⚠ 상단 패딩은 고정값이 아니라 safe-area로 잡는다 — 노치·다이내믹 아일랜드 높이가 기기마다 다르다.
 *
 * ⚠ leading 슬롯에 세션 상태(AuthStatus)를 받는다 — 워드마크와 아이콘만 두면 **목록 화면에
 *   "로그인"이라고 쓰인 자리가 하나도 남지 않는다.** 하단 탭바의 프로필 탭이 비로그인에게
 *   `SignInDialog`를 띄우긴 하지만, 그건 프로필을 누른 사람에게만 닿는 안내이지
 *   화면에 보이는 진입점이 아니다.
 *   (로그인한 뒤의 계정 동작 — 닉네임·로그아웃 — 은 프로필 화면이 단독으로 갖는다.)
 *   위젯끼리 import하지 않도록(FSD 동일 레이어 금지) 슬롯으로 받아 뷰가 조립한다.
 */
export function AppBar({ leading }: { leading?: ReactNode }) {
  return (
    <header className="sticky top-0 z-5 flex items-center gap-3 border-b border-hairline-cool bg-canvas px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
      <Wordmark />
      {/*
        ⚠ `min-h-[37px]` — `leading`에 오는 로그인 버튼(`buttonClassName` sm)의 실측 높이다(py-2 16 + 13px×줄높이 1.5
          + 선 ≈ 36.6px. 기본 클래스의 `leading-none`은 뒤에 오는 `text-[13px]`에 twMerge가 지워 줄높이 1.5가 남는다).
          `AuthStatus`는 세션이 확정되기 전까지 `null`이라 서버 HTML엔 없고 하이드레이션 뒤에야 들어오는데,
          워드마크 줄(28.5px)보다 커서 자리를 미리 잡지 않으면 헤더가 9px 자라며 본문 전체가 밀렸다(실측 — CLS).
          버튼 높이를 바꾸면 이 값도 함께 바꾼다.
      */}
      <div className="ml-auto flex min-h-[37px] min-w-0 items-center gap-2.5">{leading}</div>
    </header>
  );
}

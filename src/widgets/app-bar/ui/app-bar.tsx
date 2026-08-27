import type { ReactNode } from "react";
import { Wordmark } from "@/shared/ui";

/**
 * 목록 화면 상단 앱바 (프로토타입 `.otb-bar`) — 스티키, 하단 헤어라인.
 *
 * ⚠ 배경은 **불투명**이다. blur는 하단 탭바에서만 허용된다.
 * ⚠ 상단 패딩은 프로토타입의 노치 회피값(64px)이 아니라 safe-area로 잡는다(핸드오프 1-B).
 *
 * ⚠ **프로토타입에서 의도적으로 벗어난 지점**: leading 슬롯에 세션 상태(AuthStatus)를 받는다.
 *   프로토타입의 목록 앱바에는 워드마크와 아이콘 2개뿐이지만, 그 구성에서는 **목록 화면에
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
      <div className="ml-auto flex min-w-0 items-center gap-2.5">{leading}</div>
    </header>
  );
}

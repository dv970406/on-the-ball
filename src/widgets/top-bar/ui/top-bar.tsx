"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import { cn } from "@/shared/lib";
import { ROUTES, activeNavHref } from "@/shared/config";
import { Icon, SignInLink, Wordmark } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";

/** 상단 바의 내비 — 대상 화면이 있는 항목만 둔다(탭바와 같은 원칙) */
const NAV = [
  { label: "이적시장", href: ROUTES.transferList },
  { label: "예측 랭킹", href: ROUTES.ranking },
] as const;

/**
 * 데스크톱 상단 바 — `lg`(1024px)부터 앱바(`AppBar`)·하단 탭바(`BottomTabBar`)를 대신한다.
 *
 * ⚠ **높이는 `calc(56px + env(safe-area-inset-top))`이다** — 내용 줄 56px + 위 safe-area.
 *   홈 화면에 추가한 앱(매니페스트 `standalone` + `viewportFit: cover`)은 iPad의 1024px 이상 폭에서도
 *   상태 표시줄 아래까지 그려지므로, 앱바·서브헤더처럼 그 높이를 위에서 비켜 앉는다(보통 브라우저에서는 0).
 *   이적 보드의 sticky 판·레일이 `100dvh`에서 **같은 식**을 빼고 잡는다 — 바꾸면 그쪽도 함께 바꾼다(딜 상세의 곁 칸은
 *   스크롤 영역 높이 `100cqh`를 재서 이 식과 무관하다).
 * ⚠ **모든 폭에서 마운트되고 CSS로만 숨는다**(`hidden lg:flex` — 루트 layout이 렌더한다).
 *   그래서 조회 훅(`useProfileQuery` 등)을 부르지 않는다 — 부르면 바가 보이지 않는 모바일에서도 요청이 나간다.
 *   세션 스토어만 본다(이미 메모리에 있는 값이다).
 * ⚠ 이 `<header>`가 화면의 유일한 `banner` 랜드마크다(1024px 이상) — 서브헤더는 그래서 `<header>`가 아니다.
 * ⚠ 로그인 화면에서는 그리지 않는다 — 인증 화면은 로그인이라는 목적 하나만 드러내고(`AuthShell`),
 *   모바일에서도 그 화면엔 앱바가 없다. 빠져나갈 길은 화면의 "먼저 둘러볼게요"가 갖는다.
 * ⚠ 배경은 불투명 + 하단 헤어라인이다(blur는 하단 탭바에서만 허용 — `styling.md`).
 * ⚠ 활성 항목은 **잉크 밑줄**이다. 에메랄드가 아니다 — 크롬의 선택 상태라 에메랄드 자리 표 밖이다.
 */
export function TopBar() {
  const pathname = usePathname();
  const status = useSessionStore((s) => s.status);

  if (pathname === ROUTES.signIn) return null;

  const active = activeNavHref(pathname);

  return (
    <header className="hidden h-[calc(56px+env(safe-area-inset-top))] shrink-0 items-center gap-7 border-b border-hairline-cool bg-canvas px-5 pt-[env(safe-area-inset-top)] lg:flex">
      {/*
        ⚠ 링크 이름은 `aria-label`이 아니라 `sr-only` 덧붙임이다 — `aria-label`은 보이는 워드마크 글자를 덮어써
          보이는 것과 읽히는 것이 갈린다(`code-quality.md`). 읽히는 이름은 "온더볼 이적시장"이다.
      */}
      <Link href={ROUTES.transferList} className="relative flex items-center">
        <Wordmark />
        <span className="sr-only"> 이적시장</span>
      </Link>

      <nav aria-label="주요 메뉴" className="flex h-full gap-[22px]">
        {NAV.map((item) => {
          const isActive = active === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                // -mb-px — 밑줄이 바의 헤어라인 위에 겹쳐 앉는다
                "-mb-px flex items-center border-b-2 text-[14px] transition-colors duration-150 ease-otb",
                isActive
                  ? "border-ink font-semibold text-ink"
                  : "border-transparent font-medium text-ink-mute hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/*
        ⚠ `min-w`·`min-h` — 세션이 확정되기 전(`loading`)에는 아무것도 그리지 않으므로 자리를 미리 잡는다
          (앱바의 `AuthStatus` 자리와 같은 이유 — 하이드레이션 뒤에 들어와도 내비가 밀리지 않는다).
      */}
      <div className="ml-auto flex min-h-[37px] min-w-[72px] items-center justify-end">
        {/* ⚠ 라벨이 "로그인"이라 `SignInDialog`를 끼지 않고 곧바로 이동한다 — 복귀 목적지(쿼리 포함)는 `SignInLink`가 싣는다 */}
        {status === "guest" && <SignInLink />}
        {status === "authenticated" && (
          <Link
            href={ROUTES.profile}
            aria-current={pathname === ROUTES.profile ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-[14px] transition-colors duration-150 ease-otb hover:bg-canvas-soft",
              pathname === ROUTES.profile ? "font-semibold text-ink" : "font-medium text-ink-mute",
            )}
          >
            <Icon as={User} size={18} />
            프로필
          </Link>
        )}
      </div>
    </header>
  );
}

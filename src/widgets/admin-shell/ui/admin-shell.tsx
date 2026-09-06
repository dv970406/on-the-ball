"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { buttonClassName, chipClassName } from "@/shared/ui";

interface AdminSection {
  label: string;
  href: string;
}

/**
 * ⚠ **하단 탭바를 쓰지 않는다.** 탭바를 두면 `ToastViewport`가 `isTabBarRoute`로 위치를
 *   정하는데 어드민 경로는 `null`이라 토스트가 바 아래에 깔린다. 상단 레일은 목록 화면의
 *   말머리 레일과 **같은 패턴**(`chipClassName` + `<Link aria-current="page">`)이라
 *   새 컴포넌트도, 새 스타일 예외도 필요 없다.
 */
const SECTIONS: AdminSection[] = [
  { label: "승부예측", href: ROUTES.adminMatchList },
  { label: "입축구", href: ROUTES.adminSurveyList },
  { label: "피드", href: ROUTES.adminPostList },
  { label: "공지사항", href: ROUTES.adminNoticeList },
];

/**
 * 어드민 목록 화면의 공통 셸 — 헤더 + 섹션 레일 + 스크롤 영역.
 *
 * ⚠ 폼·상세 화면은 이 셸을 쓰지 않는다. 거기서는 `SubHeader`(뒤로가기)가 맞다
 *   (`PostEditView`가 쓰는 형태와 같다).
 * ⚠ `<main>`에 `h-full`을 쓰지 않는다 — 루트 프레임이 `flex flex-col`이라 헤더와 형제인
 *   `h-full`은 프레임을 넘긴다. `min-h-0 flex-1`이라야 한다.
 * ⚠ 탭바가 없으므로 하단 패딩도 탭바 전제값(122px)이 아니다.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-5 border-b border-hairline-cool bg-canvas px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <p className="text-[15px] font-semibold tracking-[-0.3px] text-ink">온더볼 관리</p>
          <Link
            href={ROUTES.postList}
            className={buttonClassName({ variant: "secondary", size: "sm", className: "ml-auto" })}
          >
            서비스로
          </Link>
        </div>
      </header>

      {/*
        섹션 레일 — 이동이므로 `aria-pressed`가 아니라 `aria-current="page"`다.
        ⚠ 활성 판정을 정확 일치로 두면 하위 화면(수정·등록)에서 레일이 통째로 비활성이 된다.
      */}
      <nav
        aria-label="관리 메뉴"
        className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-hairline-cool px-5 pb-3 pt-3"
      >
        {SECTIONS.map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={chipClassName(active)}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </>
  );
}

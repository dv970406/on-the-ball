"use client";

import { cn } from "@/shared/lib";
import type { OAuthProvider } from "@/features/sign-in";

/**
 * 소셜 로그인 버튼.
 *
 * ⚠ **디자인 시스템의 명시적 예외다**(styling.md에 등재). 카카오·구글은 버튼 색·로고·문구를
 *   브랜드 가이드가 강제한다 — 우리가 정할 수 있는 자리가 아니다. 그래서 이 화면에서만
 *   "뷰포트당 컬러 이벤트 1개"와 "크롬에 강한 컬러 금지"가 깨진다.
 *   가이드가 강제하지 않는 부분(라운드 6px·높이·간격)은 우리 시스템을 그대로 따른다.
 *
 * ⚠ 로고 경로는 각 브랜드 키트가 원본이다. 배포 전에 공식 자산과 대조할 것.
 */

/** 카카오 심볼 — 말풍선. 단색이라 currentColor를 쓰지 않고 가이드 색을 고정한다 */
function KakaoMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-[18px] shrink-0">
      <path
        fill="#000000"
        fillOpacity="0.9"
        d="M9 1.5C4.86 1.5 1.5 4.13 1.5 7.37c0 2.06 1.36 3.87 3.4 4.92l-.86 3.16c-.08.28.23.5.47.34l3.79-2.5c.23.02.46.03.7.03 4.14 0 7.5-2.63 7.5-5.95S13.14 1.5 9 1.5z"
      />
    </svg>
  );
}

/** 구글 G — 4색 고정(가이드가 단색 변형을 허용하지 않는다) */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-[18px] shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

/** 판별자가 유한한 열거형이라 클래스 맵으로 둔다(styling.md — style prop이 아니다) */
const PROVIDER_META: Record<
  OAuthProvider,
  { label: string; mark: () => React.ReactElement; className: string }
> = {
  kakao: {
    label: "카카오 로그인",
    mark: KakaoMark,
    // #FEE500 / 검정 85% — 카카오 가이드 지정값
    className: "bg-[#FEE500] text-black/85 active:bg-[#EDD800]",
  },
  google: {
    label: "Google 계정으로 로그인",
    mark: GoogleMark,
    // 흰 배경 + #747775 1px 테두리 — 구글 가이드 지정값
    className: "border border-[#747775] bg-white text-[#1f1f1f] active:bg-[#f7f7f7]",
  },
};

interface ProviderButtonProps {
  provider: OAuthProvider;
  disabled?: boolean;
  onClick: () => void;
}

export function ProviderButton({ provider, disabled, onClick }: ProviderButtonProps) {
  const { label, mark: Mark, className } = PROVIDER_META[provider];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // 라운드·높이·이징은 우리 시스템 값이다 — 가이드가 강제하는 건 색·로고·문구뿐이다
        "flex h-[50px] w-full items-center justify-center gap-2 rounded-sm",
        "text-[15px] font-medium transition-colors duration-150 ease-otb",
        "disabled:opacity-40",
        className,
      )}
    >
      <Mark />
      {label}
    </button>
  );
}

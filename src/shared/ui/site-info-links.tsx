import Link from "next/link";
import { ROUTES } from "@/shared/config";
import { cn } from "@/shared/lib/cn";

/**
 * 사이트 정보 링크(서비스 소개 · 개인정보처리방침) — 화면 맨 아래의 작은 글자 줄.
 *
 * 이 앱에는 사이트 공통 푸터가 없다(앱 프레임이 화면 높이에 고정되고 화면마다 스크롤 영역이 다르다) — 그래서 각 화면이
 * 자기 스크롤 영역의 끝에 이 줄을 둔다. 보드(비로그인도 닿는 첫 화면) · 프로필 · 두 문서 화면이 그 자리다.
 * ⚠ 개인정보처리방침은 **비로그인도 닿는 자리**에서 링크해야 한다(`ROUTES.privacy` 주석) — 이 줄을 보드에서 걷어내려면
 *   비로그인이 닿는 다른 자리를 먼저 만든다.
 * ⚠ `"use client"`를 붙이지 않는다 — 상호작용이 없어 서버에서도 그린다(`empty-state.tsx`와 같은 이유로 `cn`은 직접 경로).
 * 프리페치를 끈다 — 자주 가는 화면이 아니다.
 */
export function SiteInfoLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="사이트 정보" className={cn("flex flex-wrap gap-x-4", className)}>
      <Link
        href={ROUTES.about}
        prefetch={false}
        className="inline-flex min-h-11 items-center text-[12px] text-ink-mute hover:text-ink"
      >
        서비스 소개
      </Link>
      {/* 개인정보처리방침은 다른 항목보다 눈에 띄게 둔다(개인정보보호위원회 작성지침 — 명칭을 굵게 표시) */}
      <Link
        href={ROUTES.privacy}
        prefetch={false}
        className="inline-flex min-h-11 items-center text-[12px] font-semibold text-ink-secondary hover:text-ink"
      >
        개인정보처리방침
      </Link>
    </nav>
  );
}

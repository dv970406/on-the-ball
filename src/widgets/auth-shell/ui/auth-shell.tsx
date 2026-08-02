import type { ReactNode } from "react";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  /** 하단 보조 링크 영역 (다른 인증 화면으로 이동) */
  footer?: ReactNode;
}

/**
 * 인증 화면 4개(로그인·가입·비밀번호 찾기·재설정)의 공통 껍데기.
 * 각 뷰는 폼 본문에만 집중하고 제목·여백·워드마크는 여기서 한 번에 정한다.
 */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-10">
      {/* 워드마크(에메랄드 볼)를 두지 않는다 — 이 화면의 컬러 이벤트는 제출 버튼 하나다 */}
      <div className="mb-8">
        <h1 className="text-[24px] font-bold leading-[1.3] tracking-[-0.6px] text-ink">
          {title}
        </h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-ink-mute">{description}</p>
      </div>

      {children}

      {footer && <div className="mt-6 text-center text-[13px] text-ink-mute">{footer}</div>}
    </main>
  );
}

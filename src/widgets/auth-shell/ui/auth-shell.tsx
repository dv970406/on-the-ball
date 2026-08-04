import type { ReactNode } from "react";

interface AuthShellProps {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  /** 하단 보조 링크 영역 (다른 인증 화면으로 이동) */
  footer?: ReactNode;
  /** 폼 아래 붙는 부가 영역 — 게스트 진입·법적 문구 등 (로그인 화면만 사용) */
  belowForm?: ReactNode;
}

/**
 * 인증 화면 4개(로그인·가입·비밀번호 찾기·재설정)의 공통 껍데기.
 * 각 뷰는 폼 본문에만 집중하고 제목·여백은 여기서 한 번에 정한다.
 *
 * 커뮤니티 프로토타입의 `.cm-login` 톤을 따른다 — 좌우 28px, 상단 여백을 크게 두고
 * 헤드라인 30px/500/-1px. title/description을 ReactNode로 받는 이유는
 * 프로토타입 카피가 `<br />`로 줄을 강제하기 때문이다("축구 얘기는 / 여기서 끝까지.").
 *
 * ⚠ 워드마크(에메랄드 볼)를 두지 않는다 — 이 화면의 컬러 이벤트는 제출 버튼 하나다.
 */
export function AuthShell({ title, description, children, footer, belowForm }: AuthShellProps) {
  return (
    <main className="flex min-h-dvh flex-col px-7 pb-[max(34px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
      <div className="flex flex-1 flex-col justify-center py-14">
        <h1 className="text-pretty text-[30px] font-medium leading-[1.3] tracking-[-1px] text-ink">
          {title}
        </h1>
        <p className="mt-2.5 text-[14px] leading-[1.6] text-ink-mute">{description}</p>
      </div>

      {children}

      {belowForm}

      {footer && <div className="mt-5 text-center text-[13px] text-ink-mute">{footer}</div>}
    </main>
  );
}

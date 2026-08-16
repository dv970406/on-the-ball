import type { ReactNode } from "react";

interface AuthShellProps {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  /** 본문 아래 붙는 부가 영역 — 게스트 진입 링크 */
  belowForm?: ReactNode;
}

/**
 * 인증 화면의 공통 껍데기 — 소셜 로그인으로 바뀌면서 현재 소비자는 `/sign-in` 하나다.
 * 뷰는 본문에만 집중하고 제목·여백은 여기서 한 번에 정한다.
 *
 * 커뮤니티 프로토타입의 `.cm-login` 톤을 따른다 — 좌우 28px, 상단 여백을 크게 두고
 * 헤드라인 30px/500/-1px. title/description이 ReactNode인 것은 상태에 따라 문구를
 * 갈아 끼우는 곳(로그인 중 ↔ 로그인)을 위해서다(현재 카피는 전부 평문이다).
 *
 * ⚠ 워드마크(에메랄드 볼)를 두지 않는다 — 이 화면의 컬러 이벤트는 제출 버튼 하나다.
 */
export function AuthShell({ title, description, children, belowForm }: AuthShellProps) {
  return (
    // ⚠ `min-h-dvh`가 아니라 `min-h-0 flex-1` — 프레임이 flex 컬럼이고 overflow-hidden이라,
    //   화면이 작아 내용이 넘치면 잘린 부분에 **도달할 방법이 없다**. 넘칠 때만 스크롤시킨다.
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 pb-[max(34px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
      <div className="flex flex-1 flex-col justify-center py-14">
        <h1 className="text-pretty text-[30px] font-medium leading-[1.3] tracking-[-1px] text-ink">
          {title}
        </h1>
        <p className="mt-2.5 text-[14px] leading-[1.6] text-ink-mute">{description}</p>
      </div>

      {children}

      {belowForm}
    </main>
  );
}

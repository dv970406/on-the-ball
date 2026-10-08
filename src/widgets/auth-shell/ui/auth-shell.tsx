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
 * 좌우 28px, 상단 여백을 크게 두고
 * 헤드라인 30px/500/-1px. title/description이 ReactNode인 것은 상태에 따라 문구를
 * 갈아 끼우는 곳(로그인 중 ↔ 로그인)을 위해서다(현재 카피는 전부 평문이다).
 *
 * ⚠ 워드마크(에메랄드 볼)를 두지 않는다 — 이 화면의 컬러 이벤트는 제출 버튼 하나다.
 */
export function AuthShell({ title, description, children, belowForm }: AuthShellProps) {
  return (
    // ⚠ `min-h-dvh`가 아니라 `min-h-0 flex-1` — 프레임이 flex 컬럼이고 overflow-hidden이라,
    //   화면이 작아 내용이 넘치면 잘린 부분에 **도달할 방법이 없다**. 넘칠 때만 스크롤시킨다.
    // ⚠ `md:[scrollbar-gutter:stable]` — 768px부터는 스크롤바가 보이므로, 창 높이에 따라 넘침이 생겼다 사라져도
    //   가운데 열이 스크롤바 폭만큼 흔들리지 않게 그 자리를 늘 잡아 둔다.
    <main className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-7 pb-[max(34px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] md:[scrollbar-gutter:stable]">
      {/*
        넓은 화면(768px~)에서는 가운데 열로 모은다 — 버튼이 화면 끝까지 늘어나면 한 동작을 고르는 화면으로 읽히지 않는다.
        스크롤 영역(`<main>`)은 전체 폭으로 두고 안쪽만 좁힌다(열 밖에서도 휠이 먹는다). 모바일에서는 `<main>`과 같은
        flex 컬럼이라 결과가 같다.
        ⚠ 넓은 화면에서는 제목과 버튼을 한 덩어리로 세로 가운데에 둔다(`my-auto`) — 모바일처럼 제목은 가운데·버튼은
          바닥에 두면 큰 화면에서 둘 사이가 화면 높이만큼 벌어져 한 화면으로 읽히지 않는다.
      */}
      <div className="flex flex-1 flex-col md:mx-auto md:my-auto md:w-full md:max-w-[400px] md:flex-none">
        <div className="flex flex-1 flex-col justify-center py-14 md:flex-none md:pb-10 md:pt-0">
          <h1 className="text-pretty text-[30px] font-medium leading-[1.3] tracking-[-1px] text-ink">
            {title}
          </h1>
          <p className="mt-2.5 text-[14px] leading-[1.6] text-ink-mute">{description}</p>
        </div>

        {children}

        {belowForm}
      </div>
    </main>
  );
}

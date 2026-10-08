import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { jetbrainsMono } from "@/app/fonts";
import { AppProviders } from "@/app/providers";
import { TOKEN_COLORS, env } from "@/shared/config";
import { TopBar } from "@/widgets/top-bar";
import "@/app/styles/globals.css";

export const metadata: Metadata = {
  // og:image는 절대 URL이라야 한다 — 없으면 Next가 localhost로 추정하고 빌드 경고를 낸다.
  // 같은 폴더의 opengraph-image.png가 이 값을 기준으로 절대 URL이 된다.
  metadataBase: new URL(env.siteUrl),
  // 접미사 단일 소스 — 각 page는 자기 제목만 적는다("| 온더볼"을 손으로 반복하지 않는다).
  // default는 템플릿이 적용되지 않는 자리(루트·not-found)에 쓰인다.
  title: { template: "%s | 온더볼", default: "온더볼" },
  // 서비스 소개 문구의 단일 소스 — 하위 페이지는 이 값을 상속한다.
  // sign-in 화면·opengraph-image.alt.txt·`OG_IMAGE`의 alt·매니페스트(`app/manifest.ts`)도 같은 문구를 쓴다
  // (갈리면 그 자리만 옛 톤으로 남는다).
  description: "유럽 5대 리그 이적 소식을 한곳에서",
  /**
   * 색인 지시 — 기본값(index, follow)에 미리보기 상한을 연다.
   *
   * `max-image-preview:large`가 없으면 구글이 검색 결과·Discover에 **작은 썸네일만** 쓴다
   * (구글 문서 "Discover에 표시되는 콘텐츠" — 큰 이미지 노출의 조건이다). `max-snippet:-1`·
   * `max-video-preview:-1`은 "제한 없음"이라 지금 동작과 같다.
   * ⚠ 로그인 필수 화면의 `robots: { index: false }`는 이 객체를 **통째로 대체**한다 —
   *   그 화면들에 미리보기 상한이 빠지는 것은 색인되지 않으므로 무관하다.
   */
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
  /**
   * 검색엔진 소유권 확인 — Search Console(`google-site-verification`)과 네이버 서치어드바이저
   * (`naver-site-verification`). 값이 없으면 태그를 내보내지 않는다(빈 content는 확인에 실패한다).
   * ⚠ 네이버는 Next의 `verification`에 전용 키가 없어 `other`로 적는다 — 이름은 서치어드바이저가
   *   "사이트 소유확인 → HTML 태그"에서 주는 그대로다.
   */
  verification: {
    ...(env.googleSiteVerification ? { google: env.googleSiteVerification } : {}),
    other: env.naverSiteVerification
      ? { "naver-site-verification": env.naverSiteVerification }
      : {},
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 브라우저가 CSS 밖에서 읽는 값이라 토큰과 같은 값의 상수를 쓴다(매니페스트의 `theme_color`와 같은 값이어야 한다)
  themeColor: TOKEN_COLORS.canvas,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={jetbrainsMono.variable}>
      <head>
        {/*
          Pretendard 동적 서브셋 중 최빈 조각만 preload — swap 깜빡임/CLS 최소화.
          [91]=라틴·숫자·문장부호·최빈 한글(가·이·다·하 등), [90]=차상위 최빈 한글(는·을·에·한 등).
          나머지 조각은 화면에 해당 글자가 나올 때 브라우저가 알아서 로드한다(전부 preload 금지).
        */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/pretendard/PretendardVariable.subset.91.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/pretendard/PretendardVariable.subset.90.woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <AppProviders>
          {/*
            앱 프레임 — 768px 미만은 430px 센터 고정(모바일 화면 그대로), 768px부터는 화면 전체를 쓴다.
            넓은 화면에서 내용 폭은 각 화면이 정한다(이적 보드는 판을 늘리고, 그 밖의 화면은 가운데 열로 모은다).

            ⚠ **`flex flex-col`이어야 한다.** 전에는 블록이라, 흐름에 자리를 차지하는
              `SubHeader`(71px)와 `h-full`인 `<main>`이 형제로 놓이면 프레임이 그 높이만큼
              넘쳤다. 프레임은 `overflow-hidden`이라 포커스가 이동해 한 번 밀리면
              **사용자가 되돌릴 수 없다**(실측 71px). 스크롤 컨테이너는 `h-full`이 아니라
              `min-h-0 flex-1`을 써서 남는 높이만 차지한다.
            ⚠ 데스크톱 상단 바(`TopBar`)는 프레임의 **첫 자식**이다 — `lg`부터만 보이고(CSS로 숨김) 앱바·하단
              탭바를 대신한다. 프레임 안에 두어야 시트·다이얼로그의 스크림(`absolute inset-0`)이 그 바까지 덮는다.
          */}
          <div className="relative mx-auto flex h-dvh max-w-[430px] flex-col overflow-hidden bg-canvas sm:border-x sm:border-hairline-cool md:max-w-none md:border-x-0">
            <TopBar />
            {children}
          </div>
        </AppProviders>
      </body>
      {/*
        GA4 — 측정 ID가 있을 때만 싣는다(로컬·프리뷰는 비워 둔다). 스크립트는 하이드레이션 뒤에 내려오고
        (`next/script`의 기본 전략), 화면 조회는 gtag가 주소 변화를 스스로 센다. 그 밖의 이벤트는
        `track`(`@/shared/lib`) 하나로 보낸다.
      */}
      {env.gaId && <GoogleAnalytics gaId={env.gaId} />}
    </html>
  );
}

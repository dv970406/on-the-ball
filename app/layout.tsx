import type { Metadata, Viewport } from "next";
import { jetbrainsMono } from "@/app/fonts";
import { AppProviders } from "@/app/providers";
import "@/app/styles/globals.css";

export const metadata: Metadata = {
  // 접미사 단일 소스 — 각 page는 자기 제목만 적는다("· 온더볼"을 손으로 반복하지 않는다).
  // default는 템플릿이 적용되지 않는 자리(루트·not-found)에 쓰인다.
  title: { template: "%s · 온더볼", default: "온더볼" },
  description: "글을 쓰고 이야기를 나누는 커뮤니티 게시판",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
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
          {/* 모바일 전용 프레임 — 데스크톱에서는 430px 센터 고정 */}
          <div className="relative mx-auto h-dvh max-w-[430px] overflow-hidden bg-canvas sm:border-x sm:border-hairline-cool">
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { pretendard, jetbrainsMono } from "@/app/fonts";
import { AppProviders } from "@/app/providers";
import "@/app/styles/globals.css";

export const metadata: Metadata = {
  title: "온더볼",
  description: "해외축구 가십·밸런스 대결·퀴즈를 다루는 커뮤니티 투표 앱",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${jetbrainsMono.variable}`}>
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

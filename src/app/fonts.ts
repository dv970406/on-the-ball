import localFont from "next/font/local";

/**
 * Pretendard Variable — 디스플레이/본문 공용 (핸드오프 동봉본, SIL OFL)
 * 디자인 규칙: display 500 / body 400
 */
export const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  weight: "45 920",
  display: "swap",
  variable: "--font-pretendard",
});

/**
 * JetBrains Mono — 숫자·통계·포지션 라벨용 (tnum과 함께 사용)
 * next/font/google은 빌드 시 네트워크 의존이라 로컬 파일로 통일
 */
export const jetbrainsMono = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-Regular.woff2", weight: "400" },
    { path: "./fonts/JetBrainsMono-Medium.woff2", weight: "500" },
  ],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

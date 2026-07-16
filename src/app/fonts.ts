import localFont from "next/font/local";

/**
 * Pretendard는 next/font가 아니라 자체 호스팅 동적 서브셋으로 로드한다.
 * → src/app/styles/pretendard-subset.css (public/fonts/pretendard/*.woff2, unicode-range 92조각)
 * 단일 2MB 통짜 로드를 피하고, 화면에 등장한 글자 범위만 받는다.
 *
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

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
    { path: "./fonts/JetBrainsMono-Regular.subset.woff2", weight: "400" },
    { path: "./fonts/JetBrainsMono-Medium.subset.woff2", weight: "500" },
  ],
  display: "swap",
  /**
   * ⚠ preload하지 않는다. 기본값(true)이면 두 웨이트(약 47KB)가 모든 라우트에서 첫 페인트 자원과
   *   경쟁하는데, 이 폰트가 그리는 것은 상대시각·카운트·이적료 같은 **작은 보조 숫자**뿐이다.
   *   `swap` + Next가 만드는 폴백 메트릭(`adjustFontFallback`)이 교체 시 시프트를 막는다.
   *   Pretendard 본문 조각 두 개는 그대로 `app/layout.tsx`가 preload한다.
   */
  preload: false,
  variable: "--font-jetbrains-mono",
});

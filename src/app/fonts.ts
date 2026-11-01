import localFont from "next/font/local";

/**
 * Pretendard는 next/font가 아니라 자체 호스팅 동적 서브셋으로 로드한다.
 * → public/fonts/pretendard/pretendard-1.3.9.css (*.woff2, unicode-range 92조각)
 * 단일 2MB 통짜 로드를 피하고, 화면에 등장한 글자 범위만 받는다.
 *
 * ⚠ **그 CSS는 번들에 넣지 않고 늦게 붙인다.** 첫 화면의 글자가 조각 20개 안팎(약 530KB)을 한꺼번에 깨워 JS와 대역폭을
 *   나눠 쓰는 바람에, 첫 방문 모바일의 하이드레이션이 두 배로 늦었다(실측: 느린 4G 5.3초 → 폰트를 막으면 2.4초,
 *   빠른 4G 1.09초 → 0.53초). 글자는 서버 HTML에 이미 있고 대체 면(`styles/pretendard-fallback.css`)으로 그려지므로
 *   LCP는 그대로다.
 *   - 첫 방문: 하이드레이션 뒤에 붙인다(`useDeferredPretendard`).
 *   - 재방문(이 브라우저가 폰트를 받아 둔 적이 있다): 머리의 인라인 스크립트(`PRETENDARD_EARLY_SCRIPT`)가 첫 페인트 전에 붙인다 —
 *     캐시에서 바로 나오는 폰트를 하이드레이션까지 미루면 하드 로드마다 글꼴이 바뀌는 깜빡임만 남는다.
 *   ⚠ CSS 파일 이름에 버전을 넣는다 — `/fonts/pretendard/`는 1년 불변 캐시다(`next.config.ts`). 내용을 바꾸면 이름을 바꾼다.
 *   ⚠ `<link rel="preload">`로 조각을 미리 받지 않는다 — 그것도 JS와 대역폭을 다툰다.
 */
export const PRETENDARD_CSS = "/fonts/pretendard/pretendard-1.3.9.css";
/** 이 브라우저가 Pretendard 본문 조각을 받아 둔 적이 있다는 표식(localStorage) — 재방문의 이른 로드를 연다 */
export const PRETENDARD_CACHED_KEY = "otb:pretendard-cached";
/**
 * 머리의 인라인 스크립트 — 표식이 있으면 첫 페인트 전에 폰트 CSS를 붙인다. 표식을 읽지 못하면(사생활 보호 모드 등) 아무것도 하지 않는다
 * (그때는 첫 방문처럼 하이드레이션 뒤에 붙는다). React 19는 머리에 끼어든 태그를 하이드레이션에서 건너뛴다.
 */
export const PRETENDARD_EARLY_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(PRETENDARD_CACHED_KEY)})){var l=document.createElement("link");l.rel="stylesheet";l.href=${JSON.stringify(PRETENDARD_CSS)};document.head.appendChild(l)}}catch(e){}`;

/**
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
   *   Pretendard도 preload하지 않는다(위 절).
   */
  preload: false,
  variable: "--font-jetbrains-mono",
});

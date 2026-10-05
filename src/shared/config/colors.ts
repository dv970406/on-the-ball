/**
 * 디자인 토큰과 **같은 값**의 JS 색 상수 — CSS 변수·Tailwind 클래스를 읽지 못하는 자리 전용.
 *
 * 공유 카드 이미지(`ImageResponse`는 인라인 `style`만 읽는다)와, 브라우저가 CSS 밖에서 읽는 값(웹 앱 매니페스트 ·
 * viewport의 `themeColor`)이 그 자리다. 화면의 색은 지금처럼 Tailwind 유틸로 쓴다 — 이 상수를
 * 컴포넌트의 `style`에 끌어다 쓰지 않는다(`styling.md`).
 *
 * ⚠ **단일 소스는 `src/app/styles/globals.css`의 `@theme`다.** 여기는 그 사본이라, 토큰 값을 바꾸면
 *   여기도 함께 고친다. 토큰에 없는 색을 여기 더하지 않는다.
 */
export const TOKEN_COLORS = {
  primary: "#3ecf8e",
  onPrimary: "#171717",
  crimson: "#e2005a",
  ink: "#171717",
  inkSecondary: "#212121",
  inkMute: "#707070",
  inkMute2: "#9a9a9a",
  canvas: "#ffffff",
  canvasSoft: "#fafafa",
  hairline: "#dfdfdf",
  hairlineStrong: "#c7c7c7",
  hairlineCool: "#ededed",
} as const;

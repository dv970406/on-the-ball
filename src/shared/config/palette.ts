/**
 * JS(인라인 style·차트 색)에서 참조하는 색 상수 — globals.css의 @theme 토큰과 동일 값의 단일 소스.
 *
 * Tailwind 유틸(`bg-primary`, `text-ink` …)로 표현 가능한 곳은 유틸을 쓰고,
 * 인라인 style이 필요한 `RatioBar` segment 색 등에서만 이 상수를 참조한다.
 * 브랜드 컬러 변경 시 globals.css와 여기 두 곳만 맞추면 된다(뷰별 로컬 상수 재정의 금지).
 */
export const COLOR = {
  primary: "#3ecf8e", // --color-primary
  primaryDeep: "#24b47e", // --color-primary-deep
  ink: "#171717", // --color-ink
  inkMute2: "#9a9a9a", // --color-ink-mute-2
  hairline: "#dfdfdf", // --color-hairline
  hairlineStrong: "#c7c7c7", // --color-hairline-strong
  crimson: "#e2005a", // --color-crimson
} as const;

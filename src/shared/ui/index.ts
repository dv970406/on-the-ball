export { Icon } from "./icon";
export { Pill } from "./pill";
export { Button } from "./button";
// 순수 함수라 서버 컴포넌트에서도 호출 가능 (Button과 파일이 분리된 이유는 button-class 주석 참고)
export { buttonClassName } from "./button-class";
export { Flag, type FlagCode } from "./flag";
export { PlayerSilhouette } from "./player-silhouette";
export { Shirt, type ShirtStripe } from "./shirt";
export { Avatar } from "./avatar";
export { SectionHead } from "./section-head";
export { TabHeader } from "./tab-header";
export { NightCard } from "./night-card";
export { LiveDot } from "./live-dot";
export { LiveStatusPill } from "./live-status-pill";
export { Wordmark } from "./wordmark";
export { RatioBar, type RatioSegment } from "./ratio-bar";
export { Skeleton } from "./skeleton";
export { EmptyState } from "./empty-state";
export { TextField } from "./text-field";
// 커뮤니티 화면 — 말머리 칩 / 카운터 액션 칩 / 오버레이 3종
export { Chip } from "./chip";
export { ActionChip } from "./action-chip";
// 순수 함수라 Link 등 button이 아닌 요소에서도 같은 외형을 재사용할 수 있다 (buttonClassName과 같은 이유)
export { actionChipClassName } from "./action-chip-class";
// 닫기 수단은 스크림 탭·Escape·그래버(탭·스와이프) — 별도 "닫기" 행을 두지 않는다.
// 그래버가 `button aria-label="닫기"`를 겸하는 이유는 sheet.tsx 주석에 있다(스크린리더 탈출구).
export { Sheet, SheetItem } from "./sheet";
export { Dialog } from "./dialog";
// 토스트의 상태(useToast·useToastStore)는 @/shared/lib에 있다 — ui는 뷰포트만 노출한다
export { ToastViewport } from "./toast";
/*
  ⚠ **`Markdown`·`MarkdownEditor`는 이 배럴에 두지 않는다 — 번들 때문이다.**

  이 배럴은 루트 layout이 마운트하는 `AppProviders`가 `ToastViewport` 하나 때문에 이미 타고 있다.
  그래서 여기에 실린 모듈은 **전 라우트의 초기 JS에 들어간다.** react-markdown + remark-gfm이
  마크다운을 그리지 않는 목록·로그인·404에까지 실려 **초기 JS가 43.6KB(gzip) 부풀었다**(실측:
  이 두 줄을 지운 복제본을 빌드해 대조 — `/sign-in` 332.5KB → 288.9KB, 마크다운 청크를 싣는
  라우트 8개 → 1개).

  소비자는 `@/shared/ui/markdown` 직접 경로로 가져간다(`check-conventions`의
  `DEEP_IMPORT_ALLOWED_CLIENT`에 등재). `MarkdownEditor`는 호출부가 0이라 아예 노출하지 않는다 —
  참조되지 않는 모듈은 번들에 들어가지 않으므로 그것만으로 비용이 사라진다.
*/

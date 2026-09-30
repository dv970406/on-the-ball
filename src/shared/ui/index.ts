export { Icon } from "./icon";
export { Pill } from "./pill";
export { Button } from "./button";
// 순수 함수라 서버 컴포넌트에서도 호출 가능 (Button과 파일이 분리된 이유는 button-class 주석 참고)
export { buttonClassName } from "./button-class";
export { Avatar } from "./avatar";
// 엠블럼류 메커니즘(이미지 + 하이드레이션 전 실패 감지 + 모노그램 폴백) — 사유는 crest.tsx 주석
export { Crest } from "./crest";
export { Wordmark } from "./wordmark";
export { Skeleton } from "./skeleton";
export { EmptyState } from "./empty-state";
export { StaleBanner } from "./stale-banner";
export { TextField } from "./text-field";
// 칩 외형 — 이동(링크 앵커)에 입힐 수 있게 클래스 함수로만 둔다(buttonClassName과 같은 이유)
export { chipClassName } from "./chip-class";
// 오버레이 2종 + 로그인 안내
// 닫기 수단은 스크림 탭·Escape·그래버(탭·스와이프) — 별도 "닫기" 행을 두지 않는다.
// 그래버가 `button aria-label="닫기"`를 겸하는 이유는 sheet.tsx 주석에 있다(스크린리더 탈출구).
export { Sheet, SheetItem } from "./sheet";
export { Dialog } from "./dialog";
// 액션을 누른 비로그인 사용자에게 한 단계 안내를 끼운다 — 곧바로 로그인 화면으로 갈아치우지 않는다
export { SignInDialog } from "./sign-in-dialog";
// 토스트의 상태(useToast·useToastStore)는 @/shared/lib에 있다 — ui는 뷰포트만 노출한다
export { ToastViewport } from "./toast";

export { env, isSupabaseConfigured } from "./env";
export {
  ROUTES,
  hasBottomBar,
  activeTabHref,
  signInWithNext,
  withNext,
  safeNextPath,
} from "./routes";
export { OG_IMAGE, OG_SITE, NOT_FOUND_TITLE, absoluteUrl } from "./metadata";
// 토큰과 같은 값의 JS 색 — CSS를 읽지 못하는 자리(공유 카드 이미지·매니페스트) 전용
export { TOKEN_COLORS } from "./colors";
export { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABEL, type OAuthProvider } from "./oauth";
// ⚠ 공개 버킷 URL 조립의 단일 소스(`publicStorageUrl`)는 배럴에 없다 — 버킷별 함수(`avatarUrl`)가
//    이 슬라이스 안에서 감싸 쓴다. 새 공개 버킷이 생기면 `./storage`를 감싸는 함수를 여기 더한다.
export { avatarUrl, AVATAR_BUCKET } from "./avatar";
// 이적 창 — 일정의 단일 소스는 `scripts/lib/transfer/windows.json`(리그별 일정을 합친 기간으로 읽는다)
export {
  openTransferWindow,
  trackedTransferWindow,
  boardScopeStartMs,
  predictionRound,
  transferWindowByKey,
  type TransferWindow,
} from "./transfer-window";

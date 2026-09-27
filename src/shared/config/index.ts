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
export { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABEL, type OAuthProvider } from "./oauth";
// 공개 버킷 URL 조립의 단일 소스 — 새 공개 버킷이 생기면 여기에 붙인다
export { publicStorageUrl } from "./storage";
export { avatarUrl, AVATAR_BUCKET } from "./avatar";
// 이적 창 — 일정의 단일 소스는 `scripts/lib/transfer/windows.json`(리그별 일정을 합친 기간으로 읽는다)
export {
  openTransferWindow,
  trackedTransferWindow,
  boardScopeStartMs,
  type TransferWindow,
} from "./transfer-window";

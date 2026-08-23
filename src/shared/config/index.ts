export { env, isSupabaseConfigured } from "./env";
export {
  ROUTES,
  isTabBarRoute,
  activeTabHref,
  signInWithNext,
  withNext,
  safeNextPath,
} from "./routes";
export { COLOR } from "./palette";
export { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABEL, type OAuthProvider } from "./oauth";
// 공개 버킷 URL 조립의 단일 소스 — 세 번째 버킷이 생기면서 묶었다(reuse.md가 예고한 시점)
export { publicStorageUrl } from "./storage";
export { avatarUrl, AVATAR_BUCKET } from "./avatar";
export { postImageUrl, POST_IMAGE_BUCKET } from "./post-image";
// ⚠ `SURVEY_IMAGE_BUCKET`은 올리지 않는다 — 이 버킷에 쓰는 것은 앱이 아니라
//   `scripts/upload-survey-images.mjs`(Next 밖의 순수 JS)라 TS 호출부가 0이다.
//   `AVATAR_BUCKET`·`POST_IMAGE_BUCKET`이 배럴에 있는 것은 업로드 훅이 쓰기 때문이다.
export { surveyImageUrl } from "./survey-image";

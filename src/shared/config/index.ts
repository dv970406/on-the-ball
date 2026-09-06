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
export { OG_IMAGE, NOT_FOUND_TITLE } from "./metadata";
export { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABEL, type OAuthProvider } from "./oauth";
// 공개 버킷 URL 조립의 단일 소스 — 세 번째 버킷이 생기면서 묶었다(reuse.md가 예고한 시점)
export { publicStorageUrl } from "./storage";
export { avatarUrl, AVATAR_BUCKET } from "./avatar";
export { postImageUrl, POST_IMAGE_BUCKET } from "./post-image";
// ⚠ `SURVEY_IMAGE_BUCKET`은 한때 올리지 않았다 — 이 버킷에 쓰는 것이 앱이 아니라
//   `scripts/upload-survey-images.mjs`(Next 밖의 순수 JS)뿐이라 TS 호출부가 0이었기 때문이다.
//   어드민 화면이 업로드 경로를 가지면서 그 전제가 사라졌다(`AVATAR_BUCKET`·
//   `POST_IMAGE_BUCKET`이 배럴에 있는 것과 같은 이유가 이제 여기에도 성립한다).
export { SURVEY_IMAGE_BUCKET, surveyImageUrl } from "./survey-image";

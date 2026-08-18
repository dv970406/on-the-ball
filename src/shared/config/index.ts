export { env, isSupabaseConfigured } from "./env";
export { ROUTES, TAB_BAR_ROUTES, signInWithNext, withNext, safeNextPath } from "./routes";
export { COLOR } from "./palette";
export { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABEL, type OAuthProvider } from "./oauth";
export { avatarUrl, AVATAR_BUCKET } from "./avatar";
// ⚠ avatarUrl과 조립 규칙이 같지만 일반화하지 않는다 — 세 번째 버킷이 생기면 그때(post-image.ts 주석)
export { postImageUrl, POST_IMAGE_BUCKET } from "./post-image";

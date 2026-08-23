import { publicStorageUrl } from "./storage";

/** 아바타가 사는 공개 버킷 — 마이그레이션 20260809000001이 만든다 */
export const AVATAR_BUCKET = "avatars";

/**
 * 아바타 경로 → 공개 URL.
 *
 * ⚠ **`shared`에 있는 이유**: 아바타를 쓰는 곳이 `entities/comment`·`entities/post`(상세)·
 *   `views/profile` 셋인데 **entities끼리는 import할 수 없다**(architecture.md 단방향 규칙).
 *   `OAUTH_PROVIDERS`가 `features/sign-in`에서 여기로 옮겨온 것과 똑같은 사정이다.
 *
 * ⚠ 파일명은 업로드마다 새로 만든다(uuid) — 같은 이름을 덮어쓰면 URL이 그대로라
 *   브라우저·CDN 캐시 때문에 옛 사진이 계속 보인다.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return publicStorageUrl(AVATAR_BUCKET, path);
}

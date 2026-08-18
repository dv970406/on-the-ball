import { env } from "./env";

/** 본문 이미지가 사는 공개 버킷 — 마이그레이션 20260817000001이 만든다 */
export const POST_IMAGE_BUCKET = "post-images";

/**
 * 버킷 안의 경로 → 공개 URL.
 *
 * ⚠ `avatarUrl`과 조립 규칙이 같지만 **일반화하지 않는다.** 지금은 두 번째 버킷이고
 *   버킷 상수도 각자 따로 있다 — `publicStorageUrl(bucket, path)`로 묶는 것은 세 번째가
 *   생겼을 때 한다("중복 3회 이상 · 형태가 진짜 같을 때만 공용화", code-quality.md).
 *
 * ⚠ 아바타와 달리 **DB에는 이 함수의 결과(전체 URL)가 그대로 들어간다.**
 *   `profiles.avatar_path`는 앱이 형태를 소유하는 컬럼이라 경로만 담을 수 있지만,
 *   본문 이미지는 사용자가 외부 주소도 적을 수 있는 자유 텍스트(`post.content`) 안의
 *   마크다운이다. 사유는 api-and-db.md의 "본문 이미지는 URL을 본문에 담는다" 절에 있다.
 */
export function postImageUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${POST_IMAGE_BUCKET}/${path}`;
}

import { publicStorageUrl } from "./storage";

/**
 * 입축구 면 배경이 사는 공개 버킷 — 마이그레이션 20260823000001이 만든다.
 * ⚠ 배럴에 올리지 않는다(호출부 0) — 이 버킷에 쓰는 것은 앱이 아니라 배포 스크립트다.
 */
/**
 * ⚠ **배럴에 올라간다.** 예전에는 TS 호출부가 0이라 내부 상수로 뒀지만, 어드민 화면이
 *   생기면서 업로드 훅이 이 값을 쓴다(`features/admin-survey`) — 배럴에 없으면 그쪽이
 *   deep import를 해야 하고 그건 규약 위반이다.
 */
export const SURVEY_IMAGE_BUCKET = "survey-images";

/**
 * 입축구 선택지 이미지 경로 → 공개 URL.
 *
 * ⚠ **DB에는 경로(`{survey_id}/{파일명}`)만 저장한다** — 아바타와 같은 이유다.
 * ⚠ **쓰기는 관리자에게만 열려 있다**(`survey_images_*_admin` 정책). 어드민 화면의 배경
 *   업로드가 그 경로이고, 그전처럼 `scripts/upload-survey-images.mjs`가 service_role로
 *   올리는 경로도 그대로 살아 있다.
 */
export function surveyImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return publicStorageUrl(SURVEY_IMAGE_BUCKET, path);
}

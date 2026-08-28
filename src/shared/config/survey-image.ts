import { publicStorageUrl } from "./storage";

/**
 * 입축구 면 배경이 사는 공개 버킷 — 마이그레이션 20260823000001이 만든다.
 * ⚠ 배럴에 올리지 않는다(호출부 0) — 이 버킷에 쓰는 것은 앱이 아니라 배포 스크립트다.
 */
const SURVEY_IMAGE_BUCKET = "survey-images";

/**
 * 입축구 선택지 이미지 경로 → 공개 URL.
 *
 * ⚠ **DB에는 경로(`{survey_id}/{파일명}`)만 저장한다** — 아바타와 같은 이유다.
 * ⚠ **쓰기 정책이 없는 버킷이다.** 앱에는 업로드 경로가 없고 파일은 배포 스크립트가
 *   service_role로 올린다(문항 자체를 마이그레이션이 넣는 것과 같은 취급).
 */
export function surveyImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return publicStorageUrl(SURVEY_IMAGE_BUCKET, path);
}

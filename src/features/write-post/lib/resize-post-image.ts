/**
 * 본문 이미지가 받는 형식·상한.
 *
 * ⚠ **리사이즈 자체는 `@/shared/lib`의 `resizeToWebp`가 한다.** 이 파일의 옛 주석이
 *   "세 번째 이미지 기능이 생기면 shared/lib으로 올린다"고 적어 둔 그 시점이 왔다 —
 *   어드민의 입축구 배경(`features/admin-survey`)이 세 번째이고, features끼리는 import할
 *   수 없어 승격 말고는 길이 없다.
 * ⚠ 여기 남는 것은 **기능마다 다른 값**뿐이다. 본문은 움직이는 GIF를 받아 webp로 바꿔
 *   올리지만 입축구 배경은 그 경로가 없다(버킷 mime 목록도 다르다).
 */

/**
 * 파일 선택 대화상자와 클라이언트 검증이 받는 형식.
 *
 * ⚠ 버킷의 `allowed_mime_types`와 **일부러 다르다.** GIF는 받되 그대로 올리지 않고
 *   애니메이션 WebP로 바꿔 올리므로(`gif-to-webp.ts`), 버킷에는 `image/gif`가 없다 —
 *   즉 변환을 건너뛴 GIF는 서버가 415로 막는다. 목록이 갈린 것이 아니라 **층이 다르다.**
 */
export const ACCEPTED_IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png", "image/gif"];

/** 리사이즈 **전** 원본의 상한 — 브라우저 디코딩 메모리를 지키기 위한 값이다 */
export const MAX_SOURCE_BYTES = 20 * 1000 * 1000;

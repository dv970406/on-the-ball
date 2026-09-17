import { postImageUrl } from "@/shared/config";

/**
 * 공개 URL → 버킷 안 경로. 우리 버킷이 아니면 `null`.
 *
 * (본문에서 URL을 뽑는 `extractImageUrls`는 `@/entities/post`에 있다 — 서버 page도 쓰게 되면서
 * 내렸다. 이 파일에는 **지우는 쪽만 아는 판정**이 남는다.)
 *
 * ⚠ **문자열 접두어 비교로 충분하다** — `postImageUrl("")`이 조립의 단일 소스라
 *   호스트가 환경마다 달라도 같은 규칙으로 갈린다(경로를 직접 짜지 않는 이유).
 * ⚠ 외부 주소를 `null`로 거르지 않으면 `storage.remove`에 엉뚱한 값이 실린다.
 */
export function toStoragePath(url: string): string | null {
  const prefix = postImageUrl("");
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  // `{uuid}/{파일}` 두 세그먼트가 아니면 우리가 올린 것이 아니다(Storage 정책과 같은 형태)
  return /^[^/]+\/[^/]+$/.test(path) ? path : null;
}

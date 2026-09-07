import { postImageUrl } from "@/shared/config";
// ⚠ 패턴의 단일 소스는 `entities/post`가 갖는다 — 서버 안전한 순수 모듈이라 직접 경로다.
import { IMAGE_MARKDOWN_SOURCE } from "@/entities/post/lib/plain-summary";

/**
 * 본문 마크다운에서 이미지 URL을 뽑는다.
 *
 * ⚠ **DB의 `admin_strip_post_images`와 같은 정규식이어야 한다.** 한쪽만 고치면 화면이
 *   보여준 목록과 실제로 지워지는 대상이 갈린다 — 그래서 패턴은 `IMAGE_MARKDOWN_SOURCE`가
 *   단독으로 갖고(사유는 그 주석에), 여기서는 플래그만 붙여 쓴다.
 * ⚠ 본문은 자유 텍스트라 **외부 이미지 주소도 들어올 수 있다** — 여기서는 전부 보여주고,
 *   Storage 삭제는 우리 버킷 것만 한다(아래 `toStoragePath`).
 */
const IMAGE_RE = new RegExp(IMAGE_MARKDOWN_SOURCE, "g");

export function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  for (const match of content.matchAll(IMAGE_RE)) {
    // `[1]` 꺾쇠 안 / `[2]` 맨 주소 — 둘 중 하나만 채워진다
    const url = match[1] ?? match[2];
    if (url) urls.push(url);
  }
  // 같은 사진이 두 번 박힌 본문도 있다 — 목록은 한 줄로 보여주고 제거는 한 번에 된다
  return [...new Set(urls)];
}

/**
 * 공개 URL → 버킷 안 경로. 우리 버킷이 아니면 `null`.
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

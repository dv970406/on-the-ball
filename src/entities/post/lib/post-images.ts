// ⚠ 패턴의 단일 소스는 `plain-summary`가 갖는다(사유는 그 주석에) — 여기서는 플래그만 붙여 쓴다.
import { IMAGE_MARKDOWN_SOURCE } from "./plain-summary";

/**
 * 본문 마크다운에서 이미지 URL을 뽑는다. 순수 함수라 서버에서도 import할 수 있다("use client" 없음).
 *
 * 소비처가 둘이라 `features/admin-post`에서 여기로 내렸다(features끼리는 import할 수 없고,
 * 서버 page는 features의 클라이언트 배럴을 거칠 수 없다):
 *   - views/admin-post-manage  : 어드민이 지울 이미지 목록
 *   - app/posts/[id]/page.tsx  : `og:image`·구조화 데이터의 `image`(본문 첫 사진이 공유 카드가 된다)
 *
 * ⚠ **DB의 `admin_strip_post_images`와 같은 정규식이어야 한다.** 한쪽만 고치면 화면이
 *   보여준 목록과 실제로 지워지는 대상이 갈린다.
 * ⚠ 본문은 자유 텍스트라 **외부 이미지 주소도 들어온다** — 여기서는 전부 돌려주고, 우리 버킷
 *   판정(`toStoragePath`)은 지우는 쪽(`features/admin-post`)이 갖는다.
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

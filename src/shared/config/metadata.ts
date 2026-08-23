/**
 * 라우트가 공유하는 메타데이터 상수.
 *
 * `app/**`의 여러 세그먼트가 **같은 값을 각자 적고 있어서** 묶었다. 값이 갈리면 빌드도 린트도
 * 잡지 못하고 공유 프리뷰·탭 제목에서만 드러난다.
 */

/**
 * 세그먼트가 `openGraph`를 직접 반환할 때 **함께 실어야 하는** 이미지.
 *
 * ⚠ `app/opengraph-image.png`는 하위 라우트로 자동 상속되지만, 그 세그먼트의
 *   `generateMetadata`가 `openGraph`를 직접 반환하는 순간 **통째로 대체되어 이미지가 빠진다**
 *   (실측 — 글 상세만 이미지 없는 카드로 나갔다). `twitter`도 마찬가지다.
 * ⚠ **글마다 다른 이미지는 만들지 않는다.** `ImageResponse`(satori)는 woff2를 읽지 못하는데
 *   이 프로젝트의 Pretendard는 woff2 동적 서브셋뿐이라, 한글 제목을 그리려면 한글 TTF를
 *   통째로 리포에 넣어야 한다. 카드의 제목·설명은 이미 리소스마다 다르므로 이미지만 공통으로 둔다.
 * ⚠ `width`·`height`·`alt`는 **실제 파일과 갈릴 수 있는 값**이다 —
 *   `app/opengraph-image.png`의 치수와 `app/opengraph-image.alt.txt`의 문구를 바꾸면 여기도 함께 고친다.
 *   (그 파일은 내용이 그대로 `og:image:alt`에 들어가므로 끝에 개행을 남기지 않는다.)
 */
export const OG_IMAGE = {
  url: "/opengraph-image.png",
  type: "image/png",
  width: 1200,
  height: 630,
  alt: "온더볼 — 모든 축구팬들을 위한 커뮤니티",
} as const;

/**
 * 없는 리소스의 `<title>`.
 *
 * ⚠ **`app/not-found.tsx`가 그리는 문구와 반드시 같아야 한다.** `Page`가 `notFound()`를 부르면
 *   그 화면이 렌더되는데, 제목만 다르게 두면 서버 HTML은 "페이지를 찾을 수 없어요"인데
 *   하이드레이션 후 탭 제목만 세그먼트 값으로 바뀐다(실측). 그래서 404 화면도 이 상수를 쓴다.
 */
export const NOT_FOUND_TITLE = "페이지를 찾을 수 없어요";

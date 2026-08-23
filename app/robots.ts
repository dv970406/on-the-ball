import type { MetadataRoute } from "next";
import { env } from "@/shared/config";

/**
 * robots.txt.
 *
 * ⚠ **아무것도 막지 않는다.** 크롤을 막는 것과 색인을 막는 것은 다른 일이고, 이 앱에서
 *   색인을 원치 않는 화면은 전부 **막지 않는 편이 낫다**:
 *
 *   - 정렬 쿼리(`?sort=`) — 막으면 크롤러가 그 URL의 `rel=canonical`을 **읽지 못해**
 *     통합 신호가 사라진다(구글 *Consolidate duplicate URLs*가 경고하는 지점).
 *   - 로그인 필수 화면(`/profile`·`/posts/new`·`/posts/[id]/edit`) — 비로그인에게는
 *     proxy가 307로 `/sign-in`에 보내므로, **크롤을 허용하면 크롤러가 리다이렉트를 따라가
 *     그 URL을 색인하지 않는다.** 반대로 `Disallow`로 막으면 크롤러는 리다이렉트도
 *     `noindex`도 보지 못한 채 **링크만 보고 URL을 색인할 수 있다** — 셋 다 탭바·FAB의
 *     크롤 가능한 앵커로 모든 목록 화면에서 링크되므로 그 조건이 실제로 성립한다.
 *   - `/sign-in` — 같은 이유. 크롤은 열어 두고 페이지의 `robots: { index: false }`가 판정한다.
 *
 * → 색인 여부는 **페이지가 `noindex`로 말하고**, robots.txt는 사이트맵 위치만 알린다.
 *   막을 대상이 생긴다면 그 기준은 "크롤러가 그 URL에서 아무것도 보지 못하고, 어디서도
 *   링크되지 않는다"여야 한다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    // ⚠ 사이트맵 위치는 **절대 URL이어야 한다**(robots.txt 규격). 상대 경로는 무시된다.
    sitemap: new URL("/sitemap.xml", env.siteUrl).href,
  };
}

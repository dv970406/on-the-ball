import { cache } from "react";
import type { MetadataRoute } from "next";
import { unstable_rethrow } from "next/navigation";
import { ROUTES, env } from "@/shared/config";
import { POST_CATEGORIES, POST_CATEGORY_SLUG } from "@/entities/post/model/types";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";

/**
 * 사이트맵.
 *
 * ⚠ **홈(`/`)을 넣지 않는다.** `app/page.tsx`가 `/posts`로 리다이렉트하는데, 사이트맵에 실린
 *   URL이 리다이렉트면 Search Console이 "리다이렉션이 있는 페이지"로 제외 처리한다.
 *   목적지인 `/posts`가 이미 들어 있으므로 잃는 것이 없다.
 *
 * ⚠ **정렬 쿼리(`?sort=`)를 넣지 않는다.** 같은 집합의 순서만 다른 중복이고, canonical이
 *   이미 정렬 없는 URL을 가리킨다 — 사이트맵은 **canonical만** 담는다.
 *
 * ⚠ 소프트 삭제·차단은 RLS가 거른다. 크롤러는 쿠키가 없어 `auth.uid()`가 null이므로
 *   공개분만 나온다(차단 필터는 아무것도 감추지 않는다).
 */

/**
 * 한 사이트맵 파일의 URL 상한은 50,000개다(sitemaps.org).
 * ⚠ 글이 이 수를 넘으면 조용히 잘리는 게 아니라 **넘긴 글이 사이트맵에서 사라진다** →
 *   그때는 `generateSitemaps`로 쪼개 사이트맵 인덱스를 만든다(Next 공식 API).
 */
const URL_LIMIT = 10_000;

/** 목록·말머리처럼 DB를 타지 않는 고정 URL */
function staticEntries(now: Date): MetadataRoute.Sitemap {
  return [
    { url: url(ROUTES.postList), lastModified: now },
    { url: url(ROUTES.surveyList), lastModified: now },
    ...POST_CATEGORIES.map((category) => ({
      url: url(ROUTES.postCategory(POST_CATEGORY_SLUG[category])),
      lastModified: now,
    })),
  ];
}

/**
 * ⚠ `changeFrequency`·`priority`는 넣지 않는다 — 구글이 무시한다고 명시한 값이라
 *   적어 두면 "관리해야 하는데 아무 일도 하지 않는 값"만 는다. `lastModified`는 읽는다.
 */
const fetchEntries = cache(async (): Promise<MetadataRoute.Sitemap> => {
  const now = new Date();
  const statics = staticEntries(now);

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return statics;

    const [posts, surveys] = await Promise.all([
      supabase
        .from("post")
        .select("id, updated_at")
        .order("id", { ascending: false })
        .limit(URL_LIMIT),
      supabase
        .from("survey")
        // ⚠ `closes_at`을 lastModified로 쓰지 않는다 — 진행 중이면 미래 시각이 된다
        .select("id, created_at")
        .order("id", { ascending: false })
        .limit(URL_LIMIT),
    ]);

    return [
      ...statics,
      ...(posts.data ?? []).map((post) => ({
        url: url(ROUTES.post(post.id)),
        lastModified: new Date(post.updated_at),
      })),
      ...(surveys.data ?? []).map((survey) => ({
        url: url(ROUTES.survey(survey.id)),
        lastModified: new Date(survey.created_at),
      })),
    ];
  } catch (e) {
    // cookies()가 던지는 프레임워크 내부 에러를 삼키면 안 된다
    unstable_rethrow(e);
    console.error("[sitemap] 조회 실패:", e);
    // ⚠ 빈 사이트맵을 내보내지 않는다 — 조회가 잠깐 실패했다고 목록 URL까지 사라지면
    //   크롤러에게 "이 사이트에 페이지가 없다"고 말하는 셈이다.
    return statics;
  }
});

/** 상대 경로 → 절대 URL. 사이트맵은 절대 URL만 허용한다(sitemaps.org) */
function url(path: string): string {
  return new URL(path, env.siteUrl).href;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return fetchEntries();
}

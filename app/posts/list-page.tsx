import { cache } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
import { createSupabaseServerClient, hasSessionCookie } from "@/shared/api/supabase-server";
// ⚠ 배럴(@/entities/post)이 아니라 직접 경로 — 배럴은 "use client" 모듈을 포함한다.
//   쿼리 조립과 매퍼를 클라이언트 훅과 **공유해야** 프리페치가 같은 목록을 만든다.
import { buildPostListQuery } from "@/entities/post/api/list-query";
import { buildPostListItem } from "@/entities/post/api/mappers";
import { buildBannerNoticeQuery } from "@/entities/notice/api/list-query";
import { buildNoticeListItem } from "@/entities/notice/api/mappers";
import type { NoticeListItem } from "@/entities/notice/model/types";
import type { PostCategory, PostListFilters, PostListPage, PostSort } from "@/entities/post/model/types";
import { POST_CATEGORY_SLUG, parsePostSort } from "@/entities/post/model/types";
import { OG_IMAGE, ROUTES, env } from "@/shared/config";
import { PostListView } from "@/views/post-list";

/**
 * 목록 두 라우트(`/posts`·`/posts/category/[slug]`)가 공유하는 서버 조립.
 *
 * ⚠ **두 라우트가 같은 화면이다.** 조회·메타데이터·canonical 규칙을 각자 짜면 한쪽만
 *   고쳐지는 순간 색인 신호가 갈린다.
 */

interface ListPage {
  /** 프리페치 결과 — 실패하면 undefined를 넘겨 클라이언트 조회로 폴백한다(nextjs.md) */
  data?: PostListPage;
  /**
   * 최상단 배너에 그릴 최신 **필독** 공지.
   * ⚠ **`null`과 `undefined`가 다른 뜻이다** — `null`은 "필독 공지가 없다"(조회는 끝났다),
   *   `undefined`는 "프리페치를 안 했다"이다. 하나로 접으면 공지가 없는 상태에서 목록을
   *   열 때마다 클라이언트 조회가 한 번씩 더 나간다(글 상세의 투표와 같은 규약).
   */
  notice?: NoticeListItem | null;
  /**
   * 이 목록을 읽은 시각.
   * ⚠ 렌더 본문이 아니라 여기서 찍는다 — `react-hooks/purity`가 서버 컴포넌트에서도
   *   렌더 중 `Date.now()`를 막고, 데이터를 읽은 순간과 같은 시각이라 뜻도 맞다.
   */
  nowMs: number;
}

/**
 * ⚠ `cache()`로 감싼다 — 지금은 소비자가 `renderPostList` 하나라 필수는 아니지만,
 *   **메타데이터를 동적으로 바꾸는 순간 요청당 2회가 된다.** 그때 잊지 않도록 미리 감싼다.
 *   ⚠ 인자가 **원시값 둘**이어야 요청 안에서 같은 호출로 묶인다(객체를 넘기면 매번 새 키다).
 */
export const fetchPostList = cache(
  async (category: PostCategory | null, sort: PostSort): Promise<ListPage> => {
    // ⚠ 클라이언트 훅과 **정확히 같은 두 키**여야 `postKeys.list`의 해시가 맞는다.
    //   키가 하나라도 다르면 initialData가 캐시에 닿지 못하고 스켈레톤으로 되돌아간다.
    const filters: PostListFilters = { category, sort };
    try {
      /**
       * 세션이 없으면 이 목록은 **모든 익명 요청에 동일하다**(크롤러가 받는 것과 같은 응답이다)
       * → 쿠키 없는 클라이언트로 갈아타 Data Cache를 태운다. 비로그인·크롤러의 조회가
       *   캐시 히트에서 DB를 타지 않는다(단 in-flight 중복 제거는 없다 — `nextjs.md`).
       *
       * ⚠ 판정은 쿠키만 본다 — 네트워크를 타지 않고, 헛짚어도 평소 경로로 갈 뿐이다
       *   (틀리는 방향이 왜 규약인지는 `hasSessionCookie` 주석에).
       * ⚠ `nowMs`는 캐시 밖이라 요청마다 새로 찍힌다 — 상대시각·HOT 배지는 캐시를 타도 정확하다.
       */
      const supabase = (await hasSessionCookie())
        ? await createSupabaseServerClient()
        : createSupabaseAnonClient();
      if (!supabase) return { nowMs: Date.now() };

      /*
       * ⚠ 둘은 서로의 결과를 쓰지 않는다 → **병렬로** 보낸다(직렬이면 왕복이 그대로 쌓인다).
       * ⚠ 공지 조회가 실패해도 **목록은 그대로 내보낸다** — 곁다리 조회의 실패로 본문을
       *   클라이언트 조회로 미루지 않는다(글 상세의 댓글·투표와 같은 규약).
       */
      const [{ data, error }, banner] = await Promise.all([
        buildPostListQuery(supabase, filters),
        buildBannerNoticeQuery(supabase),
      ]);

      const notice = banner.error
        ? undefined
        : banner.data
          ? buildNoticeListItem(banner.data)
          : null;

      if (error) return { notice, nowMs: Date.now() };

      return {
        data: { items: (data ?? []).map(buildPostListItem) },
        notice,
        nowMs: Date.now(),
      };
    } catch (e) {
      // cookies()는 "이 라우트를 동적 렌더로 전환하라"는 Next 내부 에러를 throw해서 동작한다.
      // 삼키면 페이지가 스켈레톤 상태로 정적 프리렌더되어 조용히 망가지므로 반드시 되던진다.
      unstable_rethrow(e);
      console.error("[posts] 목록 조회 실패:", e);
      return { nowMs: Date.now() };
    }
  },
);

/**
 * 말머리 페이지의 경로 — 전체는 `/posts`.
 * ⚠ **경로 문자열을 여기서 짓지 않는다.** 화면의 말머리 레일(`PostListView`)이 링크를
 *   만드는 곳과 canonical을 만드는 여기가 갈리면 조용히 어긋난다 → `ROUTES`가 단일 소스다.
 */
export function listPath(category: PostCategory | null): string {
  return category === null
    ? ROUTES.postList
    : ROUTES.postCategory(POST_CATEGORY_SLUG[category]);
}

/**
 * 목록 메타데이터.
 *
 * ⚠ **canonical에서 정렬을 항상 떨어뜨린다.** 정렬 변형은 같은 집합의 순서만 다른 중복이라
 *   색인 대상이 아니다(구글 *Consolidate duplicate URLs*).
 *   ⚠ `noindex`를 함께 걸지 않는다 — 상충 신호라 canonical 대상까지 색인에서 빠질 수 있다.
 * ⚠ `openGraph`를 채우면 **`images`를 명시**한다 — 세그먼트가 openGraph를 직접 반환하면
 *   루트 `opengraph-image.png` 자동 상속이 통째로 사라진다(글 상세에서 실측).
 */
export function listMetadata(category: PostCategory | null): Metadata {
  const title = category === null ? "커뮤니티" : category;
  const description =
    category === null
      ? undefined // 루트 layout의 소개 문구를 상속한다
      : `온더볼 커뮤니티의 '${category}' 말머리 글 모음이에요.`;
  return {
    title,
    description,
    alternates: { canonical: listPath(category) },
    openGraph: {
      type: "website",
      title,
      description,
      siteName: "온더볼",
      url: new URL(listPath(category), env.siteUrl).toString(),
      images: OG_IMAGE,
    },
    twitter: { card: "summary_large_image", title, description, images: OG_IMAGE },
  };
}

/** 두 라우트가 같은 화면을 그린다 */
export async function renderPostList(category: PostCategory | null, rawSort: string | undefined) {
  const sort = parsePostSort(rawSort);
  const { data, notice, nowMs } = await fetchPostList(category, sort);
  return (
    <PostListView
      category={category}
      sort={sort}
      initialData={data}
      initialNotice={notice}
      serverNowMs={nowMs}
    />
  );
}

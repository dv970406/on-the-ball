import { cache } from "react";
import type { MetadataRoute } from "next";
import { unstable_rethrow } from "next/navigation";
import { ROUTES, absoluteUrl } from "@/shared/config";
import {
  POST_CATEGORIES,
  POST_CATEGORY_SLUG,
  type PostCategory,
} from "@/entities/post/model/types";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";

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
 * ⚠ 소프트 삭제·차단은 RLS가 거른다.
 *
 * ⚠ **쿠키를 보지 않고 항상 익명 클라이언트다.** 사이트맵은 크롤러가 읽는 문서라 누가 부르든
 *   공개분만 담아야 한다 — 쿠키 클라이언트면 로그인 사용자가 열었을 때 그 사람의 차단 숨김이
 *   섞이고, `cookies()` 때문에 라우트가 동적이 되어 **크롤마다 DB 조회 4건**이 나간다.
 *   익명이면 fetch가 Data Cache를 타 라우트가 `ANON_REVALIDATE` 주기의 ISR이 된다(`/notices`와
 *   같은 자리). 대가로 새 글·삭제가 최대 그 주기만큼 늦게 반영된다.
 */

/**
 * 한 사이트맵 파일의 URL 상한은 50,000개다(sitemaps.org).
 * ⚠ 글이 이 수를 넘으면 조용히 잘리는 게 아니라 **넘긴 글이 사이트맵에서 사라진다** →
 *   그때는 `generateSitemaps`로 쪼개 사이트맵 인덱스를 만든다(Next 공식 API).
 */
const URL_LIMIT = 10_000;

/** 목록 화면의 마지막 변경 시각 — 각 목록에 실리는 항목들의 최신 시각이다 */
interface ListLastModified {
  posts?: Date;
  byCategory: Partial<Record<PostCategory, Date>>;
  surveys?: Date;
  notices?: Date;
  /** 랭킹 — 순위가 움직이는 것은 경기가 채점될 때다 */
  ranking?: Date;
}

/** 값이 있을 때만 `lastModified`를 싣는다 */
function withLastModified(url: string, lastModified: Date | undefined) {
  return lastModified ? { url, lastModified } : { url };
}

/**
 * 목록·말머리처럼 경로가 고정된 URL.
 *
 * ⚠ **`lastModified`를 요청 시각(`new Date()`)으로 채우지 않는다.** 사이트맵을 부를 때마다
 *   "방금 바뀌었다"가 되는데, 구글은 이 값이 실제 변경과 맞지 않으면 사이트 전체의
 *   lastmod를 무시한다 — 상세 URL들의 정확한 값까지 함께 신호를 잃는다.
 *   그래서 그 목록에 실리는 항목의 최신 시각을 쓰고, 알 수 없으면 **생략한다.**
 * ⚠ 경기 목록은 생략한다 — 창(`MATCH_LIST_LOOKBACK_MS`)이 시간에 따라 움직여 내용이
 *   행의 변경 없이도 바뀌므로 행 시각으로는 그 목록의 변경을 말할 수 없다.
 * ⚠ 랭킹은 **가장 최근 `finished_at`** 이다 — 순위는 채점된 경기로만 매겨지므로 결과가 들어온
 *   시각이 곧 마지막 변경이다. 어드민의 스코어 정정은 `finished_at`을 옮기지 않아 실제보다
 *   **이르게** 말할 수 있는데, 늦게 말하는 것(거짓 신호)보다 안전한 쪽이다.
 */
function staticEntries(last: ListLastModified): MetadataRoute.Sitemap {
  return [
    withLastModified(absoluteUrl(ROUTES.postList), last.posts),
    withLastModified(absoluteUrl(ROUTES.surveyList), last.surveys),
    { url: absoluteUrl(ROUTES.matchList) },
    withLastModified(absoluteUrl(ROUTES.matchRanking), last.ranking),
    withLastModified(absoluteUrl(ROUTES.noticeList), last.notices),
    ...POST_CATEGORIES.map((category) =>
      withLastModified(
        absoluteUrl(ROUTES.postCategory(POST_CATEGORY_SLUG[category])),
        last.byCategory[category],
      ),
    ),
  ];
}

/** 가장 늦은 시각 — 비어 있으면 `undefined` */
function latest(dates: Date[]): Date | undefined {
  return dates.reduce<Date | undefined>((max, d) => (max && max >= d ? max : d), undefined);
}

/**
 * ⚠ `changeFrequency`·`priority`는 넣지 않는다 — 구글이 무시한다고 명시한 값이라
 *   적어 두면 "관리해야 하는데 아무 일도 하지 않는 값"만 는다. `lastModified`는 읽는다.
 */
const fetchEntries = cache(async (): Promise<MetadataRoute.Sitemap> => {
  const statics = staticEntries({ byCategory: {} });

  try {
    const supabase = createSupabaseAnonClient();
    if (!supabase) return statics;

    const [posts, surveys, matches, notices] = await Promise.all([
      supabase
        .from("post")
        // `category`는 말머리 목록의 lastModified를 가르는 데 쓴다
        .select("id, updated_at, category")
        .order("id", { ascending: false })
        .limit(URL_LIMIT),
      supabase
        .from("survey")
        // ⚠ `closes_at`을 lastModified로 쓰지 않는다 — 진행 중이면 미래 시각이 된다
        .select("id, created_at")
        .order("id", { ascending: false })
        .limit(URL_LIMIT),
      supabase
        .from("match")
        // ⚠ `kickoff_at`을 lastModified로 쓰지 않는다 — 예정 경기는 **미래 시각**이다
        //   (입축구의 `closes_at`과 같은 함정). 결과가 들어온 시각이 실제 마지막 변경이고,
        //   아직 없으면 그 경기는 바뀐 적이 없다.
        .select("id, finished_at")
        .order("id", { ascending: false })
        .limit(URL_LIMIT),
      supabase
        .from("notice")
        // ⚠ 예약·만료·삭제는 `notice_select_live` 정책이 거른다 — 크롤러는 쿠키가 없어
        //   공개분만 나온다(필터를 여기서 다시 짜면 정책과 갈릴 자리가 생긴다).
        .select("id, updated_at")
        .order("id", { ascending: false })
        .limit(URL_LIMIT),
    ]);

    const postRows = posts.data ?? [];
    const byCategory: ListLastModified["byCategory"] = {};
    for (const category of POST_CATEGORIES) {
      byCategory[category] = latest(
        postRows.filter((post) => post.category === category).map((post) => new Date(post.updated_at)),
      );
    }

    return [
      ...staticEntries({
        posts: latest(postRows.map((post) => new Date(post.updated_at))),
        byCategory,
        surveys: latest((surveys.data ?? []).map((survey) => new Date(survey.created_at))),
        notices: latest((notices.data ?? []).map((notice) => new Date(notice.updated_at))),
        ranking: latest(
          (matches.data ?? []).flatMap((match) =>
            match.finished_at ? [new Date(match.finished_at)] : [],
          ),
        ),
      }),
      ...postRows.map((post) => ({
        url: absoluteUrl(ROUTES.post(post.id)),
        lastModified: new Date(post.updated_at),
      })),
      ...(surveys.data ?? []).map((survey) => ({
        url: absoluteUrl(ROUTES.survey(survey.id)),
        lastModified: new Date(survey.created_at),
      })),
      ...(matches.data ?? []).map((match) => ({
        url: absoluteUrl(ROUTES.match(match.id)),
        // 결과가 없으면 lastModified를 생략한다 — 없는 값을 now()로 채우면 사이트맵을 부를
        // 때마다 "방금 바뀌었다"는 거짓 신호가 나간다
        ...(match.finished_at ? { lastModified: new Date(match.finished_at) } : {}),
      })),
      ...(notices.data ?? []).map((notice) => ({
        url: absoluteUrl(ROUTES.notice(notice.id)),
        // ⚠ `opens_at`이 아니라 `updated_at`이다 — 예약 공지의 `opens_at`은 **미래 시각**이라
        //   입축구의 `closes_at`과 같은 함정이다(정책이 감춰 여기 오지 않더라도 규약은 같다).
        lastModified: new Date(notice.updated_at),
      })),
    ];
  } catch (e) {
    // 프레임워크 내부 에러를 삼키면 라우트가 조용히 망가진다
    unstable_rethrow(e);
    console.error("[sitemap] 조회 실패:", e);
    // ⚠ 빈 사이트맵을 내보내지 않는다 — 조회가 잠깐 실패했다고 목록 URL까지 사라지면
    //   크롤러에게 "이 사이트에 페이지가 없다"고 말하는 셈이다.
    return statics;
  }
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return fetchEntries();
}

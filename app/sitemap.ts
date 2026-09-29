import { cache } from "react";
import type { MetadataRoute } from "next";
import { unstable_rethrow } from "next/navigation";
import { ROUTES, absoluteUrl } from "@/shared/config";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";

/**
 * 사이트맵.
 *
 * ⚠ **홈(`/`)을 넣지 않는다.** `app/page.tsx`가 `/transfers`로 리다이렉트하는데, 사이트맵에 실린
 *   URL이 리다이렉트면 Search Console이 "리다이렉션이 있는 페이지"로 제외 처리한다.
 *   목적지인 `/transfers`가 이미 들어 있으므로 잃는 것이 없다.
 *
 * ⚠ **정렬·리그 쿼리(`?sort=`·`?league=`)를 넣지 않는다.** 같은 집합의 순서·부분집합이라
 *   사이트맵은 **canonical만** 담는다.
 *
 * ⚠ **쿠키를 보지 않고 항상 익명 클라이언트다.** 사이트맵은 크롤러가 읽는 문서라 누가 부르든
 *   공개분만 담아야 한다 — 쿠키 클라이언트면 `cookies()` 때문에 라우트가 동적이 되어
 *   **크롤마다 목록 수만큼 DB 조회**가 나간다. 익명이면 fetch가 Data Cache를 타 라우트가
 *   `ANON_REVALIDATE` 주기의 ISR이 된다. 대가로 새 딜이 최대 그 주기만큼 늦게 반영된다.
 */

/**
 * 한 번에 받는 행 수 — PostgREST `max_rows`(`supabase/config.toml`)와 같은 값이다.
 * ⚠ 이보다 크게 `.limit()`을 걸어도 응답은 **조용히** 이 수에서 잘린다(`api-and-db.md`의 PostgREST 절).
 *   전에는 `.limit(10_000)` 하나로 받아 딜이 1,000건을 넘는 순간부터 그 뒤 딜이 경고 없이 빠지는
 *   구조였다 → 이 크기로 페이지를 넘긴다(`offset`·`limit`이 URL에 실려 페이지마다 Data Cache 키가 다르다).
 */
const PAGE_SIZE = 1_000;

/**
 * 한 사이트맵 파일의 URL 상한 — sitemaps.org의 50,000.
 * ⚠ 딜이 이 수를 넘으면 **넘긴 딜이 사이트맵에서 사라진다** → 그때는 `generateSitemaps`로 쪼개
 *   사이트맵 인덱스를 만든다(Next 공식 API). 닿으면 경고를 남겨 그 시점을 놓치지 않게 한다.
 */
const URL_LIMIT = 50_000;

interface DealRow {
  id: number;
  latest_reported_at: string;
}

/** 딜을 `PAGE_SIZE`씩 넘기며 전부 받는다 — 페이지가 덜 차면 끝이다 */
async function fetchDealPages(
  supabase: NonNullable<ReturnType<typeof createSupabaseAnonClient>>,
): Promise<DealRow[]> {
  const rows: DealRow[] = [];
  for (let from = 0; from < URL_LIMIT; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, URL_LIMIT) - 1;
    const { data, error } = await supabase
      .from("transfer_deal")
      // 상세도 보드도 `latest_reported_at`(최신 보도 시각)이 lastModified다 — 아래 주석 참고.
      // ⚠ 범위 필터를 걸지 않는다 — 상세 URL은 창이 지나도 살아 있다(`/transfers/[id]`).
      .select("id, latest_reported_at")
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw error;
    rows.push(...data);
    if (data.length < to - from + 1) return rows;
  }
  console.warn(`[sitemap] 딜이 ${URL_LIMIT}건을 넘었다 — generateSitemaps로 쪼갤 때다`);
  return rows;
}

/** 값이 있을 때만 `lastModified`를 싣는다 */
function withLastModified(url: string, lastModified: Date | undefined) {
  return lastModified ? { url, lastModified } : { url };
}

/**
 * 경로가 고정된 URL.
 *
 * ⚠ **`lastModified`를 요청 시각(`new Date()`)으로 채우지 않는다.** 사이트맵을 부를 때마다
 *   "방금 바뀌었다"가 되는데, 구글은 이 값이 실제 변경과 맞지 않으면 사이트 전체의
 *   lastmod를 무시한다 — 상세 URL들의 정확한 값까지 함께 신호를 잃는다.
 *   그래서 그 목록에 실리는 항목의 최신 시각을 쓰고, 알 수 없으면 **생략한다.**
 */
function staticEntries(transfers: Date | undefined): MetadataRoute.Sitemap {
  return [withLastModified(absoluteUrl(ROUTES.transferList), transfers)];
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
  const statics = staticEntries(undefined);

  try {
    const supabase = createSupabaseAnonClient();
    if (!supabase) return statics;

    const rows = await fetchDealPages(supabase);

    // 미래 시각을 lastmod로 싣지 않기 위한 기준 — 데이터를 읽은 시각이다
    const nowMs = Date.now();
    // ⚠ 미래 시각을 싣지 않는다 — 수집기가 10분 여유로 거르지만 CHECK 상한은 +1일이다
    const deals = rows.filter((deal) => Date.parse(deal.latest_reported_at) <= nowMs);

    return [
      ...staticEntries(latest(deals.map((deal) => new Date(deal.latest_reported_at)))),
      ...rows.map((deal) => ({
        url: absoluteUrl(ROUTES.transfer(deal.id)),
        // ⚠ `updated_at`(파생 시각)이 아니라 `latest_reported_at`이다 — `updated_at`은 파생 컬럼
        //   **아무것이나** 바뀐 시각이라(한국어 표기가 새로 붙어도 움직인다) 보도가 새로 나온
        //   시각과 맞지 않는다. 화면이 그리는 "업데이트 N분 전"도 이 값이다.
        // ⚠ 미래 시각은 싣지 않는다
        ...(Date.parse(deal.latest_reported_at) <= nowMs
          ? { lastModified: new Date(deal.latest_reported_at) }
          : {}),
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

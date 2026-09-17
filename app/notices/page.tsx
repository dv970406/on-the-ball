import { cache } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { OG_IMAGE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
// ⚠ 배럴이 아니라 직접 경로 — 매퍼·빌더는 "use client"가 없어 서버에서 쓸 수 있다.
//   select 문자열·정렬·상한을 클라이언트 훅과 **공유해야** 하이드레이션 직후 목록이 안 흔들린다.
import { buildNoticeListQuery } from "@/entities/notice/api/list-query";
import { buildNoticeListItem } from "@/entities/notice/api/mappers";
import type { NoticeListItem } from "@/entities/notice/model/types";
import { NoticeListView } from "@/views/notice-list";

export const metadata: Metadata = {
  title: "공지사항",
  description: "온더볼의 공지사항이에요.",
  // 필터도 정렬도 없지만 자기 참조 canonical을 둔다 — `?utm_…`이 붙은 URL이 별개 페이지로
  // 색인되는 것을 막는다(목록 화면들과 같은 처리).
  alternates: { canonical: ROUTES.noticeList },
  openGraph: {
    ...OG_SITE,
    type: "website",
    title: "공지사항",
    url: absoluteUrl(ROUTES.noticeList),
    // ⚠ 세그먼트가 openGraph를 채우면 루트 이미지 상속이 통째로 사라진다 → 명시한다
    images: OG_IMAGE,
  },
  twitter: { card: "summary_large_image", title: "공지사항", images: OG_IMAGE },
};

interface NoticeList {
  /** 프리페치 결과 — 실패하면 undefined를 넘겨 클라이언트 조회로 폴백한다 */
  items?: NoticeListItem[];
}

/**
 * ⚠ **쿠키를 보지 않고 항상 익명 클라이언트다.** 공지에는 개인화가 한 조각도 없고
 *   (`notice_select_live` 정책이 `auth.uid()`를 아예 보지 않는다) 응답이 모든 요청에
 *   동일하다 → Data Cache를 태워도 사용자별로 갈릴 값이 없다. 경기 상세의 라인업·스탯이
 *   같은 이유로 `hasSessionCookie()` 갈림 없이 익명으로 가는 것과 같은 자리다.
 * ⚠ 서버 시각을 내리지 않는다 — 공지 날짜는 연도까지 붙인 절대 표기라(`formatDate`) 기준
 *   시각이 필요 없다. 상대시각을 되살리면 그때 `nowMs`를 캐시 **밖**에서 찍어 함께 내린다.
 * ⚠ `cache()`로 감싼다 — 지금은 소비자가 `Page` 하나지만 `generateMetadata`를 동적으로
 *   바꾸는 순간 요청당 2회가 된다.
 */
const fetchNoticeList = cache(async (): Promise<NoticeList> => {
  try {
    const supabase = createSupabaseAnonClient();
    if (!supabase) return {};

    const { data, error } = await buildNoticeListQuery(supabase);
    if (error) return {};

    return { items: (data ?? []).map(buildNoticeListItem) };
  } catch (e) {
    // 프레임워크 내부 에러를 삼키면 라우트가 조용히 정적 프리렌더된다
    unstable_rethrow(e);
    console.error("[notices] 목록 조회 실패:", e);
    return {};
  }
});

export default async function Page() {
  const { items } = await fetchNoticeList();
  return <NoticeListView initialNotices={items} />;
}

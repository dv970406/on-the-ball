import { cache } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { OG_IMAGE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
// ⚠ 배럴이 아니라 직접 경로 — 조립·매퍼는 "use client"가 없어 서버에서 쓸 수 있다(훅과 같은 조립이어야 한다)
import { buildClubListQuery } from "@/entities/transfer/api/list-query";
import { buildClubList } from "@/entities/transfer/api/mappers";
import type { TransferClub } from "@/entities/transfer/model/types";
import { TransferClubListView } from "@/views/transfer-club-list";

const TITLE = "구단별 이적시장";
const DESCRIPTION = "프리미어리그·라리가·분데스리가·세리에 A·리그 1 구단별 영입·방출 소식을 모아 봅니다.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.transferClubs },
  // ⚠ openGraph를 채우는 순간 루트 이미지 상속이 사라지므로 `images`를 함께 명시한다
  openGraph: {
    ...OG_SITE,
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(ROUTES.transferClubs),
    images: OG_IMAGE,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: OG_IMAGE },
};

interface ClubList {
  /** 프리페치 결과 — 실패하면 undefined를 넘겨 클라이언트 조회로 폴백한다 */
  clubs?: TransferClub[];
  /** 이 목록을 읽은 시각 — 신선도의 기준. ⚠ 렌더 본문이 아니라 여기서 찍는다 */
  nowMs: number;
}

/**
 * ⚠ `cache()`로 감싼다 — 지금은 메타데이터가 정적이라 소비자가 `Page` 하나지만, 메타데이터가 이 조회를 쓰게 되는 순간 요청당
 *   2회가 된다(다른 목록과 같다).
 * ⚠ **쿠키를 보지 않고 항상 익명 클라이언트다** — 구단 표는 공개(`using (true)`)이고 "나"와 무관하다(`app/sitemap.ts`와 같은 판단).
 *   쿠키를 읽지 않아 이 라우트는 정적(`○`)이고 `ANON_REVALIDATE`가 ISR 주기가 된다.
 */
const fetchClubs = cache(async (): Promise<ClubList> => {
  const nowMs = Date.now();
  try {
    const supabase = createSupabaseAnonClient();
    if (!supabase) return { nowMs };
    const { data, error } = await buildClubListQuery(supabase);
    if (error) {
      console.error("[transfers/club] 구단 목록 조회 실패:", error);
      return { nowMs };
    }
    return { clubs: buildClubList(data ?? []), nowMs };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[transfers/club] 구단 목록 조회 실패:", e);
    return { nowMs };
  }
});

export default async function Page() {
  const { clubs, nowMs } = await fetchClubs();
  return <TransferClubListView initialClubs={clubs} serverNowMs={nowMs} />;
}

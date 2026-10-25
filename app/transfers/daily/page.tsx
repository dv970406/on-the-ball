import { cache } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { OG_IMAGE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
// ⚠ 배럴이 아니라 직접 경로 — 조립은 "use client"가 없어 서버에서 쓸 수 있다(훅과 같은 조립이어야 한다)
import { daySummaryStartKey, queryDaySummaries } from "@/entities/transfer/api/list-query";
import type { TransferDaySummary } from "@/entities/transfer/model/types";
import { TransferDayListView } from "@/views/transfer-day-list";

const TITLE = "날짜별 이적 소식";
const DESCRIPTION = "하루 동안 나온 유럽 5대 리그 이적 보도를 딜마다 모아 날짜별로 봅니다.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.transferDays },
  // ⚠ openGraph를 채우는 순간 루트 이미지 상속이 사라지므로 `images`를 함께 명시한다
  openGraph: {
    ...OG_SITE,
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(ROUTES.transferDays),
    images: OG_IMAGE,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: OG_IMAGE },
};

interface DayList {
  /** 프리페치 결과 — 실패하면 undefined를 넘겨 클라이언트 조회로 폴백한다 */
  days?: TransferDaySummary[];
  /** 목록의 시작 날 — 쿼리 키라 클라이언트가 같은 값을 쓴다 */
  startKey: string;
  /** 이 목록을 읽은 시각 — ⚠ 렌더 본문이 아니라 여기서 찍는다 */
  nowMs: number;
}

/**
 * ⚠ `cache()`로 감싼다 — 메타데이터가 이 조회를 쓰게 되는 순간 요청당 2회가 된다(다른 목록과 같다).
 * ⚠ **항상 익명 클라이언트다** — 보도 시각은 공개이고 "나"와 무관하다(`app/sitemap.ts`와 같은 판단). 조회 조건(시작 날)은
 *   하루에 한 번만 바뀌어 Data Cache를 탄다. 미래 보도는 조건이 아니라 매퍼가 `nowMs`로 거른다.
 */
const fetchDays = cache(async (): Promise<DayList> => {
  const nowMs = Date.now();
  const startKey = daySummaryStartKey(nowMs);
  try {
    const supabase = createSupabaseAnonClient();
    if (!supabase) return { startKey, nowMs };
    return { days: await queryDaySummaries(supabase, startKey, nowMs), startKey, nowMs };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[transfers/daily] 날짜 목록 조회 실패:", e);
    return { startKey, nowMs };
  }
});

/**
 * ⚠ **요청마다 렌더한다**(`connection()`) — 목록이 "오늘"에 묶여 있다. 쿠키를 읽지 않아 그대로 두면 빌드 때 정적으로
 *   굳어, 다음 빌드까지 목록의 시작 날·오늘의 날짜가 빌드한 날에 멈춘다(ISR이 다시 그려도 그 시각에 다시 굳을 뿐이다).
 *   조회는 익명 Data Cache를 타므로 요청마다 DB에 가지 않는다.
 */
export default async function Page() {
  await connection();
  const { days, startKey, nowMs } = await fetchDays();
  return <TransferDayListView startKey={startKey} initialDays={days} serverNowMs={nowMs} />;
}

import { cache } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound, unstable_rethrow } from "next/navigation";
import { NOT_FOUND_TITLE, OG_IMAGE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
import { kstDateKey, kstDateLabel, parseKstDateKey } from "@/shared/lib/date-key";
import { clamp } from "@/shared/lib/text";
// ⚠ 배럴이 아니라 직접 경로 — 조립·표시명은 "use client"가 없어 서버에서 쓸 수 있다(훅과 같은 조립이어야 한다)
import { queryTransferDay } from "@/entities/transfer/api/list-query";
import { playerName } from "@/entities/transfer/lib/player-name";
import type { TransferDay } from "@/entities/transfer/model/types";
import { TransferDayView } from "@/views/transfer-day";

/** 없는 날·형식이 틀린 키 — `Page`가 `notFound()`를 부르므로 **404 화면과 같은 제목**이어야 한다 */
const NOT_FOUND_METADATA: Metadata = { title: NOT_FOUND_TITLE };

type DayHead =
  | {
      state: "found" | "unknown";
      /** 그 날의 소식 — `unknown`(조회 실패)이면 없다(클라이언트가 받는다) */
      day?: TransferDay;
      /** 이 데이터를 읽은 시각 — ⚠ 렌더 본문이 아니라 여기서 찍는다(`react-hooks/purity`) */
      nowMs: number;
    }
  /** 미래 · 소식이 없는 지난 날 → 404 */
  | { state: "missing" };

/**
 * ⚠ `cache()`로 감싼다 — `generateMetadata`(제목·설명)와 `Page`가 같은 데이터를 쓴다. 인자는 **원시값**(날짜 키)이다.
 * ⚠ **항상 익명 클라이언트다** — 보도·딜은 공개이고 이 화면은 관심 표시를 그리지 않는다(`TransferDayDeal`). 조회 조건은 하루의
 *   경계(자정)라 요청마다 같아 Data Cache를 탄다.
 * ⚠ 판정:
 *   - 미래의 날 → 404(조회하지 않는다).
 *   - 소식이 없는 지난 날 → 404. 이전·다음 날 링크와 날짜 목록·사이트맵은 소식이 있는 날만 잇는다 — 빈 날이 색인되지 않는다.
 *   - 소식이 없는 오늘 → 200(빈 화면, `noindex` — 들어오는 중인 날이다).
 *   - 조회 실패 → 200(`unknown` — 클라이언트 조회로 폴백한다). 일시 장애로 소식이 있는 날을 404로 단정하지 않는다.
 */
const fetchDayHead = cache(async (dateKey: string): Promise<DayHead> => {
  const nowMs = Date.now();
  const day = parseKstDateKey(dateKey);
  const todayKey = kstDateKey(nowMs);
  // 키가 `YYYY-MM-DD`라 문자열 비교가 곧 날짜 비교다
  if (!day || day.key > todayKey) return { state: "missing" };
  try {
    const supabase = createSupabaseAnonClient();
    if (!supabase) return { state: "unknown", nowMs };
    const result = await queryTransferDay(supabase, day, nowMs);
    // 오늘은 소식이 없어도 404가 아니다 — 아직 들어오는 중인 날이다
    if (result.entries.length === 0 && day.key !== todayKey) return { state: "missing" };
    return { state: "found", day: result, nowMs };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[transfers/daily/[date]] 날짜별 소식 조회 실패:", e);
    return { state: "unknown", nowMs };
  }
});

/**
 * 하루의 설명 — 딜·보도 수와 그 날 소식이 나온 선수 몇 명(화면이 그리는 값). ⚠ 120자에서 자른다(`clamp`).
 * 선수는 화면의 순서(구간 → 그 날 가장 늦은 보도)가 아니라 **그 날 보도가 많은 순**이다 — 설명이 그 날의 큰 이야기를 먼저 말하게.
 */
function dayDescription(label: string, day: TransferDay): string {
  if (day.entries.length === 0) return `${label} 유럽 5대 리그 이적 소식을 모아 봅니다.`;
  const names = day.entries
    .slice()
    .sort((a, b) => b.reports.length - a.reports.length)
    .slice(0, 4)
    .map((entry) => playerName(entry.deal));
  return clamp(
    `${label} 이적 소식 — 딜 ${day.entries.length}건 · 보도 ${day.reportCount}건. ${names.join("·")} 등의 이적설을 한국어 요약으로 모아 봅니다.`,
    120,
  );
}

export async function generateMetadata(props: PageProps<"/transfers/daily/[date]">): Promise<Metadata> {
  const { date } = await props.params;
  const head = await fetchDayHead(date);
  if (head.state === "missing") return NOT_FOUND_METADATA;

  const label = kstDateLabel(date, { weekday: false });
  const title = `${label} 이적 소식`;
  // ⚠ 조회가 실패해도 canonical은 키만으로 만들 수 있으니 싣는다(딜 상세의 `fallbackMetadata`와 같은 판단)
  if (!head.day) return { title, alternates: { canonical: ROUTES.transferDay(date) } };

  const description = dayDescription(label, head.day);
  return {
    title,
    description,
    alternates: { canonical: ROUTES.transferDay(date) },
    // ⚠ 소식이 아직 없는 오늘은 색인하지 않는다 — 빈 화면이 그 날의 검색 결과로 굳지 않게. 소식이 들어오면 다음 크롤이 색인한다.
    //   canonical은 자기 자신이라 `noindex`와 상충하지 않는다(상충은 canonical이 다른 주소를 가리킬 때다 — `nextjs.md` 필터 절).
    ...(head.day.entries.length === 0 ? { robots: { index: false, follow: true } } : {}),
    // ⚠ openGraph를 채우는 순간 루트 이미지 상속이 사라지므로 `images`를 함께 명시한다. `og:url`은 Next가 만들지 않는다
    openGraph: {
      ...OG_SITE,
      type: "website",
      title,
      description,
      url: absoluteUrl(ROUTES.transferDay(date)),
      images: OG_IMAGE,
    },
    twitter: { card: "summary_large_image", title, description, images: OG_IMAGE },
  };
}

/**
 * ⚠ 날짜 키는 `parseKstDateKey`로만 판정한다 — 같은 날의 별칭 주소(`2026-10-7`)를 만들지 않는다. 틀리면 조회 없이 404다.
 * ⚠ `notFound()`는 `Page`에서 부른다 — `generateMetadata`에서 부르면 응답이 200으로 나간다.
 * ⚠ **요청마다 렌더한다**(`connection()`) — 미래 판정·"오늘"이 요청 시각에 묶여 있다. 쿠키를 읽지 않는 라우트라 그대로 두면 처음
 *   그린 결과가 굳어(빈 오늘 · 아직 미래였던 날의 404) 다음 재검증까지 남는다. 조회는 익명 Data Cache를 탄다.
 */
export default async function Page(props: PageProps<"/transfers/daily/[date]">) {
  await connection();
  const { date } = await props.params;
  const head = await fetchDayHead(date);
  if (head.state === "missing") notFound();

  return <TransferDayView dateKey={date} initialDay={head.day} serverNowMs={head.nowMs} />;
}

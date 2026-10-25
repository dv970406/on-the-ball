import { cache } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { NOT_FOUND_TITLE, OG_IMAGE, OG_SITE, ROUTES, absoluteUrl, boardScopeStartMs, trackedTransferWindow } from "@/shared/config";
import { createSupabaseServerClient, hasSessionCookie } from "@/shared/api/supabase-server";
import { createSupabaseAnonClient } from "@/shared/api/supabase-anon";
import { clamp } from "@/shared/lib/text";
// ⚠ 배럴이 아니라 직접 경로 — 조립·매퍼·판정은 "use client"가 없어 서버에서 쓸 수 있다.
//   딜 목록은 보드와 **같은 조립·같은 키**다(보드 ↔ 구단 화면이 캐시를 함께 쓴다 — `useClubBoard` 주석).
import { buildClubListQuery, buildDealListQuery } from "@/entities/transfer/api/list-query";
import { buildClubList, buildDealListItem } from "@/entities/transfer/api/mappers";
import { parseTransferClub } from "@/entities/transfer/lib/league";
import { splitClubDeals } from "@/entities/transfer/lib/club-deals";
import { playerName } from "@/entities/transfer/lib/player-name";
import type { TransferClub, TransferDealListItem } from "@/entities/transfer/model/types";
import { TransferClubView } from "@/views/transfer-club";

/** 없는 구단·형식이 틀린 코드 — `Page`가 `notFound()`를 부르므로 **404 화면과 같은 제목**이어야 한다 */
const NOT_FOUND_METADATA: Metadata = { title: NOT_FOUND_TITLE };

type ClubHead =
  | {
      state: "found" | "unknown";
      /** 5대 리그 구단 전부 — `unknown`(구단 조회 실패)이면 없다(클라이언트가 받는다) */
      clubs?: TransferClub[];
      club?: TransferClub;
      /** 보드 범위 안 딜 전부(보드와 같은 목록) — 실패하면 undefined(클라이언트 조회로 폴백한다) */
      deals?: TransferDealListItem[];
      /** ⚠ 딜 목록의 쿼리 키가 userId로 스코프된다 — 그 값도 함께 내려야 캐시에 닿는다 */
      userId: string | undefined;
      /** 이 데이터를 읽은 시각 — ⚠ 렌더 본문이 아니라 여기서 찍는다(`react-hooks/purity`) */
      nowMs: number;
      /** 보드 범위 시작(ISO, **분 단위로 내린 값**) — 쿼리 키와 조회 조건이 같은 문자열을 본다(`app/transfers/page.tsx`와 같다) */
      scopeStartIso: string;
    }
  /** 구단 표를 받았는데 그 코드가 없다(또는 5대 리그 밖이다) → 404 */
  | { state: "missing" };

/** 분 단위로 내린 ISO — 캐시 키가 요청 수만큼 늘지 않게(보드와 같다) */
function toMinuteIso(ms: number): string {
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
}

/**
 * ⚠ `cache()`로 감싼다 — `generateMetadata`(구단 이름·딜 수)와 `Page`가 같은 데이터를 쓴다. 인자는 **원시값**(코드)이다.
 *
 * 조회 셋을 **병렬로** 보낸다(서로의 결과를 쓰지 않는다):
 * - 구단 표 — **항상 익명 클라이언트다**(공개이고 "나"와 무관하다 — 구단 목록 화면과 같다). 존재 판정(404)이 여기서 나온다.
 * - 딜 목록 — 보드와 같은 갈림이다: 세션이 없으면 익명(Data Cache), 있으면 쿠키 클라이언트(관심 임베딩이 "내 행만"). 사유는
 *   `app/transfers/page.tsx`의 `fetchTransferBoard` 주석이다.
 * - 사용자 확인 — 세션이 있을 때만 `getClaims()`(GoTrue 왕복 없음).
 * ⚠ 구단 조회 실패(`unknown`)와 없는 구단(`missing`)을 가른다 — 일시 장애로 멀쩡한 구단을 404로 단정하지 않는다.
 * ⚠ 딜 목록은 곁다리다 — 실패해도 구단이 있으면 화면을 그대로 내보내고 목록만 클라이언트가 받는다.
 */
const fetchClubHead = cache(async (code: string): Promise<ClubHead> => {
  const nowMs = Date.now();
  const scopeStartIso = toMinuteIso(boardScopeStartMs(nowMs));
  const unknown = { state: "unknown", userId: undefined, nowMs, scopeStartIso } as const;
  try {
    const anon = createSupabaseAnonClient();
    if (!anon) return unknown;
    const signedIn = await hasSessionCookie();
    const supabase = signedIn ? await createSupabaseServerClient() : anon;
    if (!supabase) return unknown;

    const [clubsResult, dealsResult, auth] = await Promise.all([
      buildClubListQuery(anon),
      buildDealListQuery(supabase, scopeStartIso),
      signedIn ? supabase.auth.getClaims() : null,
    ]);
    const userId = auth?.data?.claims.sub;
    const deals = dealsResult.error ? undefined : (dealsResult.data ?? []).map(buildDealListItem);
    if (dealsResult.error) console.error("[transfers/club/[code]] 딜 목록 조회 실패:", dealsResult.error);

    if (clubsResult.error) {
      console.error("[transfers/club/[code]] 구단 조회 실패:", clubsResult.error);
      return { ...unknown, deals, userId };
    }
    const clubs = buildClubList(clubsResult.data ?? []);
    const club = clubs.find((c) => c.code === code);
    if (!club) return { state: "missing" };
    return { state: "found", clubs, club, deals, userId, nowMs, scopeStartIso };
  } catch (e) {
    // cookies()가 던지는 프레임워크 내부 에러를 삼키면 라우트가 조용히 정적 프리렌더된다
    unstable_rethrow(e);
    console.error("[transfers/club/[code]] 조회 실패:", e);
    return unknown;
  }
});

/**
 * 구단 화면의 설명 — 이번 창의 영입·방출 건수와 영입 쪽 선수 몇 명. 화면이 그리는 값으로 만든다(`nextjs.md` 메타데이터 절).
 * ⚠ 120자에서 자른다(`clamp` — 코드포인트 단위).
 */
function clubDescription(club: TransferClub, deals: TransferDealListItem[] | undefined, windowLabel: string): string {
  const base = `${club.name}(${club.league ?? "5대 리그"})의 ${windowLabel} 이적 창 영입·방출 소식`;
  if (!deals) return `${base}을 단계별로 모아 봅니다.`;
  const groups = splitClubDeals(deals, club.code);
  if (groups.length === 0) return `${base} — 아직 보도된 딜이 없어요.`;
  const counts = groups.map((g) => `${g.label} ${g.deals.length}건`).join(" · ");
  const names = groups.flatMap((g) => g.deals).slice(0, 3).map(playerName);
  return clamp(`${base} — ${counts}. ${names.join("·")} 등의 이적설을 단계별로 모아 봅니다.`, 120);
}

export async function generateMetadata(props: PageProps<"/transfers/club/[code]">): Promise<Metadata> {
  const code = parseTransferClub((await props.params).code);
  if (code === null) return NOT_FOUND_METADATA;

  const head = await fetchClubHead(code);
  if (head.state === "missing") return NOT_FOUND_METADATA;
  // ⚠ 조회가 실패해도 canonical은 코드만으로 만들 수 있으니 싣는다(딜 상세의 `fallbackMetadata`와 같은 판단)
  if (!head.club) return { title: "구단 이적시장", alternates: { canonical: ROUTES.transferClub(code) } };

  const { club, deals, nowMs } = head;
  const title = `${club.shortName} 이적시장 · 영입·방출 소식`;
  const description = clubDescription(club, deals, trackedTransferWindow(nowMs).label);
  return {
    title,
    description,
    // ⚠ 자기 참조 canonical — 추적 파라미터가 붙은 주소가 별개 페이지로 색인되지 않게
    alternates: { canonical: ROUTES.transferClub(code) },
    // ⚠ openGraph를 채우는 순간 루트 이미지 상속이 사라지므로 `images`를 함께 명시한다. `og:url`은 Next가 만들지 않는다
    openGraph: {
      ...OG_SITE,
      type: "website",
      title,
      description,
      url: absoluteUrl(ROUTES.transferClub(code)),
      images: OG_IMAGE,
    },
    twitter: { card: "summary_large_image", title, description, images: OG_IMAGE },
  };
}

/**
 * ⚠ 코드는 `parseTransferClub`로만 판정한다(보드의 `?club=`과 같은 형식 판정) — 형식이 틀리면 조회 없이 404다.
 *   path의 모르는 슬러그는 404다(query의 모르는 값은 기본값으로 폴백하지만 — `nextjs.md` 필터 절).
 * ⚠ `notFound()`는 `Page`에서 부른다 — `generateMetadata`에서 부르면 응답이 200으로 나간다.
 * ⚠ 이 라우트는 동적(`ƒ`)이다 — 쿠키(`hasSessionCookie`)를 읽는다.
 */
export default async function Page(props: PageProps<"/transfers/club/[code]">) {
  const code = parseTransferClub((await props.params).code);
  if (code === null) notFound();

  const head = await fetchClubHead(code);
  if (head.state === "missing") notFound();

  return (
    <TransferClubView
      code={code}
      initialClubs={head.clubs}
      initialDeals={head.deals}
      initialUserId={head.userId}
      serverNowMs={head.nowMs}
      scopeStartIso={head.scopeStartIso}
    />
  );
}

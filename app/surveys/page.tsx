import { cache } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
// ⚠ 배럴이 아니라 직접 경로 — 매퍼는 "use client"가 없어 서버에서 쓸 수 있다.
//   select 문자열·빌더·상한을 클라이언트 훅과 **공유해야** 같은 목록이 나온다.
import { buildSurveyListItem } from "@/entities/survey/api/mappers";
import { buildSurveyListQuery } from "@/entities/survey/api/list-query";
import type { SurveyListItem } from "@/entities/survey/model/types";
import { SurveyListView } from "@/views/survey-list";

export const metadata: Metadata = {
  title: "서베이",
  // ⚠ 정렬·필터가 없어도 자기 참조 canonical을 둔다 — 임의의 쿼리(`?utm_…`)가 붙은 URL이
  //   별개 페이지로 색인되는 것을 막는다(글 목록과 같은 처리).
  alternates: { canonical: ROUTES.surveyList },
  // description을 적지 않는다 — 루트 layout의 값을 상속한다(목록 화면과 같은 이유).
};

interface SurveyList {
  items?: SurveyListItem[];
  userId: string | undefined;
  /**
   * 이 목록을 읽은 시각.
   * ⚠ **이게 없으면 화면이 통째로 스켈레톤이다** — 뷰가 진행/마감을 이 값으로 가른다.
   * ⚠ 렌더 본문이 아니라 여기서 찍는다(`react-hooks/purity`가 서버 컴포넌트에서도 막는다).
   */
  nowMs: number;
}

const fetchSurveyList = cache(async (): Promise<SurveyList> => {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { userId: undefined, nowMs: Date.now() };

    // ⚠ 쿠키 기반 클라이언트라 `auth.uid()`가 잡힌다 → `survey_vote` 임베딩("내 행만")이
    //   그 사용자 기준으로 채워져 카드의 참여 표시가 서버·클라에서 갈리지 않는다.
    // ⚠ 두 요청은 서로의 결과를 쓰지 않는다 → **병렬로** 보낸다(직렬이면 왕복이 그대로 쌓인다).
    // ⚠ 목록 조립은 `buildSurveyListQuery`가 소유한다 — 서버가 정렬·상한·select를 다시 짜면
    //   하이드레이션 직후 목록이 재배열된다.
    const [{ data: auth }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      buildSurveyListQuery(supabase),
    ]);

    if (error) return { userId: auth.user?.id, nowMs: Date.now() };
    return {
      items: (data ?? []).map(buildSurveyListItem),
      userId: auth.user?.id,
      nowMs: Date.now(),
    };
  } catch (e) {
    // cookies()가 던지는 프레임워크 내부 에러를 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가진다.
    unstable_rethrow(e);
    console.error("[surveys] 목록 조회 실패:", e);
    return { userId: undefined, nowMs: Date.now() };
  }
});

export default async function Page() {
  const { items, userId, nowMs } = await fetchSurveyList();
  return (
    <SurveyListView
      initialSurveys={items ? { items } : undefined}
      initialUserId={userId}
      serverNowMs={nowMs}
    />
  );
}

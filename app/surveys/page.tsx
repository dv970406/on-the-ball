import { cache } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
// ⚠ 배럴이 아니라 직접 경로 — 매퍼는 "use client"가 없어 서버에서 쓸 수 있다.
//   select 문자열·빌더·상한을 클라이언트 훅과 **공유해야** 같은 목록이 나온다.
import { buildSurveyListItem, buildSurveyResult } from "@/entities/survey/api/mappers";
import { buildSurveyListQuery } from "@/entities/survey/api/list-query";
// ⚠ 마감 판정은 이 함수가 단독으로 소유한다 — 서버가 조건을 다시 짜면 클라이언트와 갈린다
import { isSurveyOpen } from "@/entities/survey/lib/open";
import type { SurveyListItem, SurveyResult } from "@/entities/survey/model/types";
import { SurveyListView } from "@/views/survey-list";

export const metadata: Metadata = {
  title: "입축구",
  // ⚠ 정렬·필터가 없어도 자기 참조 canonical을 둔다 — 임의의 쿼리(`?utm_…`)가 붙은 URL이
  //   별개 페이지로 색인되는 것을 막는다(글 목록과 같은 처리).
  alternates: { canonical: ROUTES.surveyList },
  // description을 적지 않는다 — 루트 layout의 값을 상속한다(목록 화면과 같은 이유).
};

interface SurveyList {
  items?: SurveyListItem[];
  /**
   * 참여한 **진행 중** 문항의 집계 — 문항 id로 찾는다.
   *
   * ⚠ **참여했을 때만 담는다.** `undefined`(담기지 않음)와 `[]`(열렸는데 0표)는 다른 뜻이라,
   *   미참여자에게 오는 0행을 `[]`로 넣으면 결과 패널이 열려 버린다(상세와 같은 규약).
   * ⚠ 마감된 문항은 담지 않는다 — 목록에서 `SurveyCard`(링크 한 줄)로 그려져 집계를 쓰지 않는다.
   */
  results?: Record<number, SurveyResult[]>;
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

    const nowMs = Date.now();
    const items = (data ?? []).map(buildSurveyListItem);

    /*
     * ⚠ **참여한 문항의 집계도 서버가 그린다.** 없으면 `SurveyVote`가 결과 막대를 스켈레톤으로
     *   그렸다가 하이드레이션 직후 늘려서 카드가 밀린다 — `nextjs.md`의 "사용자별 상태도 끝까지
     *   서버가 그려야 시프트가 안 생긴다"가 상세에만 적용돼 있던 자리다.
     * ⚠ **목록을 받은 뒤라 왕복이 하나 늘지만, 비로그인·미참여자에게는 늘지 않는다** —
     *   `answered`가 비면 조회 자체를 하지 않는다(크롤러가 받는 경로가 그쪽이다).
     * ⚠ 마감 판정을 여기서 다시 짜지 않는다 — `isSurveyOpen`이 단독으로 소유한다.
     */
    const answered = items.filter(
      (survey) => survey.myOptionId !== null && isSurveyOpen(survey, nowMs),
    );
    let results: Record<number, SurveyResult[]> | undefined;
    if (answered.length > 0) {
      const rows = await Promise.all(
        answered.map((survey) => supabase.rpc("survey_results", { p_survey_id: survey.id })),
      );
      results = {};
      answered.forEach((survey, index) => {
        // ⚠ 실패한 문항은 **담지 않는다** — `[]`로 접으면 "열렸는데 0표"라는 거짓이 되고,
        //   담지 않으면 그 카드만 클라이언트 조회로 폴백한다(상세와 같은 판단).
        const { data: rowsForSurvey, error: resultsError } = rows[index];
        if (resultsError) return;
        results![survey.id] = (rowsForSurvey ?? []).map(buildSurveyResult);
      });
    }

    return { items, results, userId: auth.user?.id, nowMs };
  } catch (e) {
    // cookies()가 던지는 프레임워크 내부 에러를 삼키면 페이지가 스켈레톤 상태로 정적
    // 프리렌더되어 조용히 망가진다.
    unstable_rethrow(e);
    console.error("[surveys] 목록 조회 실패:", e);
    return { userId: undefined, nowMs: Date.now() };
  }
});

export default async function Page() {
  const { items, results, userId, nowMs } = await fetchSurveyList();
  return (
    <SurveyListView
      initialSurveys={items ? { items } : undefined}
      initialResults={results}
      initialUserId={userId}
      serverNowMs={nowMs}
    />
  );
}

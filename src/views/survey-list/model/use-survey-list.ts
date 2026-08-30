"use client";

import {
  type SurveyListItem,
  type SurveyListPage,
  isSurveyOpen,
  useSurveyListQuery,
} from "@/entities/survey";
import { useSessionStore } from "@/entities/session";
import { useNowMs } from "@/shared/lib";

interface UseSurveyListArgs {
  initialSurveys?: SurveyListPage;
  initialUserId?: string;
  serverNowMs?: number;
}

/**
 * 입축구 목록의 **조회·대기·구역 판정**을 소유한다.
 *
 * 뷰에 두지 않는 이유가 규약이다 — 세션 상태·서버가 내려준 prop·시각 셋이 서로를 조건으로
 * 삼고, 아래처럼 **적어 둘 실패 모드**가 여럿이다(`code-quality.md`의 "여러 신호가 얽힌 판정").
 * 화면은 이 훅이 돌려주는 값을 그리기만 한다.
 */
export function useSurveyList({ initialSurveys, initialUserId, serverNowMs }: UseSurveyListArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 **서버가 알려준 사용자**를 키로 쓴다 — 키가 갈리면 서버가 채운
  // 캐시에 닿지 못하고 다시 조회한다(그 순간 화면이 스켈레톤으로 되돌아간다).
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  const { data, isPending, isPlaceholderData, error, refetch } = useSurveyListQuery(
    userId,
    // ⚠ 프리페치가 있으면 복원을 기다리지 않는다 — 서버가 이미 정답(같은 userId 기준)을
    //   채워 놨고, 기다리면 그 HTML을 스켈레톤으로 덮어 SSR이 헛일이 된다(실측).
    initialSurveys !== undefined || sessionStatus !== "loading",
    initialSurveys,
  );

  /**
   * ⚠ `null`이면 진행/마감을 가를 수 없다 → 아래에서 스켈레톤을 유지한다.
   *   `false`로 접으면 첫 프레임에 진행 중 입축구가 전부 "마감" 구역으로 떨어진다.
   *   서버가 `serverNowMs`를 주면 애초에 `null`이 되지 않는다.
   */
  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 모듈 스코프에 세션당 한 번 고정되어 앱을
  //   처음 연 순간에 굳는다(사유는 `use-now.ts`). 그 값을 앞에 두면 갓 받은 서버 시각을
  //   낡은 클라 시계가 이긴다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs ?? null;
  const surveys = data?.items;

  // 목록을 **기간으로** 가른다 — 진행 중은 분할 카드로 그 자리에서 투표하고,
  // 마감된 것만 한 줄 카드로 내려가 상세에서 결과를 본다.
  // ⚠ 한 번만 순회한다(`filter` 두 번이면 같은 배열을 두 번 훑는다).
  const open: SurveyListItem[] = [];
  const closed: SurveyListItem[] = [];
  if (nowMs !== null) {
    for (const survey of surveys ?? []) {
      (isSurveyOpen(survey, nowMs) ? open : closed).push(survey);
    }
  }

  return {
    surveys,
    open,
    closed,
    /** 서버가 그린 목록이 있으면 세션 복원을 기다리지 않는다(위 `enabled`와 같은 판정) */
    isLoading:
      isPending || (initialSurveys === undefined && sessionStatus === "loading") || nowMs === null,
    isPlaceholderData,
    error,
    refetch,
  };
}

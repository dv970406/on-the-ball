"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Survey, SurveyResult } from "@/entities/survey";
import { SurveyVote } from "@/features/cast-survey-vote";
import { ROUTES, signInWithNext } from "@/shared/config";
import { Dialog, EmptyState, Skeleton } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { useSurveyDetail } from "../model/use-survey-detail";

/**
 * 서베이 상세 — 제목 + 선택지 + (참여 후) 결과.
 *
 * 하단 탭바를 렌더하지 않는다(글 상세와 같다 — 서브헤더 화면이다).
 *
 * ⚠ 세션이 확정된 뒤에만 조회한다. 키가 userId로 스코프돼 있어 복원 중에 부르면
 *   세션이 선 뒤 키가 바뀌며 **블록이 언마운트→리마운트되어 레이아웃이 두 번 튄다.**
 */
interface SurveyDetailViewProps {
  surveyId: number;
  /**
   * 서버가 미리 조회한 서베이. **SEO를 위해 초기 HTML에 제목·선택지가 담기게 하는 장치다.**
   * ⚠ 서버 조회가 실패하면 `undefined`가 오고 화면은 클라이언트 쿼리로 폴백한다.
   */
  initialSurvey?: Survey;
  /**
   * 서버가 본 로그인 사용자.
   *
   * ⚠ **이게 없으면 프리페치가 무의미해진다.** `surveyKeys.detail`이 userId로 스코프돼
   *   있어서, 세션 복원 전(`status === "loading"`)에 `undefined` 키로 찾으면 서버가 채운
   *   캐시에 닿지 못하고 다시 조회한다 — 화면이 한 번 스켈레톤으로 되돌아간다.
   * ⚠ 쿠키가 같으니 복원 후 값도 같다. 다르면(세션 만료) 키가 바뀌며 리페치되는데,
   *   그건 서버가 부정된 상황이라 다시 받는 것이 맞다.
   */
  initialUserId?: string;
  /** 서버가 미리 조회한 집계 — 참여했을 때만 온다(막대 시프트를 막는다) */
  initialResults?: SurveyResult[];
  /**
   * 서버가 렌더한 시점의 시각.
   * ⚠ **`SurveyVote`까지 흘려보내야 한다** — 거기서 마감을 판정하는데 `useNowMs()`는
   *   서버에서 `null`이라, 이 값이 없으면 **마감된 서베이가 참여 가능한 상태로 SSR된다.**
   */
  serverNowMs?: number;
}

export function SurveyDetailView({
  surveyId,
  initialSurvey,
  initialUserId,
  initialResults,
  serverNowMs,
}: SurveyDetailViewProps) {
  // 조회·대기 판정은 `model/use-survey-detail`이 소유한다(사유는 그 훅 주석)
  const { survey, isLoading, error, refetch } = useSurveyDetail({
    surveyId,
    initialSurvey,
    initialUserId,
  });

  /** 비로그인이 선택지를 눌렀을 때의 안내 — 목록 화면과 같은 이유로 **뷰가 소유한다** */
  const [askSignIn, setAskSignIn] = useState(false);
  const router = useRouter();

  // 헤더 라벨은 크롬이자 공유 시트에 실리는 이름이다 — 화면의 h1은 아래 제목이 따로 갖는다.
  // ⚠ titleHidden: 바로 아래에 제목이 있어 라벨을 그리면 두 번 읽힌다(글 상세와 같은 처리).
  const header = <SubHeader title="서베이" titleHidden fallbackHref={ROUTES.surveyList} />;

  if (isLoading) {
    return (
      <>
        {header}
        <main className="flex flex-col gap-3 px-5 py-6">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="mt-3 h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </main>
      </>
    );
  }

  /**
   * ⚠ 에러 화면으로 갈아치우는 건 **보여줄 데이터가 없을 때뿐이다.** 참여 한 번
   * (`onSettled` 무효화)에 네트워크가 잠깐 끊겨도 읽던 서베이가 사라지면 안 된다.
   */
  if (error && !survey) {
    return (
      <>
        {header}
        <main className="px-5 py-6">
          <EmptyState
            title="서베이를 불러오지 못했어요"
            description={error.message}
            onRetry={() => void refetch()}
          />
        </main>
      </>
    );
  }

  // 서버가 이미 존재를 확인하고 404를 낸다 — 여기서 null인 것은 그 사이에 지워졌을 때뿐이다
  if (!survey) {
    return (
      <>
        {header}
        <main className="px-5 py-6">
          <EmptyState
            title="서베이를 찾을 수 없어요"
            description="삭제되었거나 주소가 잘못됐어요."
          />
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className="px-5 pb-10 pt-5">
        <h1 className="text-[19px] font-semibold leading-[1.4] tracking-[-0.4px] text-ink">
          {survey.title}
        </h1>

        {/*
          ⚠ `initialUserId`·`serverNowMs`를 **그 아래까지** 흘려보낸다. 집계 쿼리 키가
            userId로 스코프돼 있고 마감 판정이 시각에 걸려 있어, 뷰에서 멈추면 SSR이 헛일이 된다.
        */}
        <SurveyVote
          survey={survey}
          initialResults={initialResults}
          initialUserId={initialUserId}
          serverNowMs={serverNowMs}
          onSignInRequired={() => setAskSignIn(true)}
        />

        {/* 캐시된 내용은 그대로 두고 최신화 실패만 알린다 */}
        {error && (
          <p className="mt-3 text-[12px] text-ink-mute">최신 결과를 불러오지 못했어요.</p>
        )}
      </main>
      <Dialog
        open={askSignIn}
        onCancel={() => setAskSignIn(false)}
        // ⚠ 경로는 **누른 시점에** 읽는다(목록 화면과 같은 이유 — `rerender-defer-reads`)
        onConfirm={() => router.push(signInWithNext(window.location.pathname))}
        title="로그인이 필요해요"
        description="서베이에 참여하려면 먼저 로그인해 주세요. 로그인하면 이 화면으로 돌아와요."
        cancelLabel="닫기"
        confirmLabel="로그인하기"
      />
    </>
  );
}

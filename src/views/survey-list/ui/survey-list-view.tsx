"use client";

import { useState } from "react";

import { ClipboardList } from "lucide-react";
import { SURVEY_LIST_LIMIT, type SurveyListPage, SurveyCard } from "@/entities/survey";
import { cn, formatCount } from "@/shared/lib";
import { EmptyState, SignInDialog, StaleBanner } from "@/shared/ui";
import { AppBar } from "@/widgets/app-bar";
import { AuthStatus } from "@/widgets/auth-status";
import { BottomTabBar } from "@/widgets/bottom-tab-bar";
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { useSurveyList } from "../model/use-survey-list";
import { SurveyOpenItem } from "./survey-open-item";
import { SurveyListSkeleton } from "./survey-list-skeleton";

/**
 * 서베이 목록.
 *
 * 필터·정렬·글쓰기 FAB가 없다 — 문항을 만드는 것은 운영진이고 그 경로는 마이그레이션이다.
 *
 * ⚠ 세션이 확정된 뒤에만 조회한다. 키가 userId로 스코프돼 있어(카드의 "참여 완료" 표시가
 *   `survey_vote` 임베딩에서 온다) 복원 중에 부르면 목록이 통째로 다시 마운트된다.
 */
interface SurveyListViewProps {
  /** 서버 프리페치 결과 — 실패하면 undefined가 오고 클라이언트가 조회한다 */
  initialSurveys?: SurveyListPage;
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ **이게 없으면 프리페치가 무의미해진다** — `surveyKeys.list`가 userId로 스코프돼 있어
   *   복원 전 `undefined` 키로 찾으면 서버가 채운 캐시에 닿지 못하고 다시 조회한다.
   */
  initialUserId?: string;
  /**
   * 서버가 렌더한 시점의 시각.
   * ⚠ **이게 없으면 SSR HTML이 통째로 비어 있다** — 진행/마감을 가르지 못해 카드가 0개가
   *   되고 아래 스켈레톤 분기가 걸린다(글 목록의 HOT 배지보다 훨씬 강한 결합이다).
   */
  serverNowMs?: number;
}

export function SurveyListView({
  initialSurveys,
  initialUserId,
  serverNowMs,
}: SurveyListViewProps) {
  // 조회·대기·구역 판정은 `model/use-survey-list`가 소유한다(사유는 그 훅 주석)
  const { surveys, open, closed, isLoading, isPlaceholderData, error, refetch } = useSurveyList({
    initialSurveys,
    initialUserId,
    serverNowMs,
  });

  /**
   * 비로그인이 선택지를 눌렀을 때의 안내 — **뷰가 소유한다.**
   * ⚠ `SurveyVote` 안에 두면 `Dialog`의 `absolute`가 `TabScrollArea`의 relative 스크롤
   *   영역을 기준으로 잡아 스크롤한 만큼 화면 밖에 뜨고, 목록에는 카드 수만큼 생긴다.
   */
  const [askSignIn, setAskSignIn] = useState(false);

  return (
    <>
      <TabScrollArea>
        <AppBar leading={<AuthStatus />} />

        {/* ⚠ 화면 제목은 sr-only다 — 현재 탭은 하단 탭바가 이미 알린다(목록 화면과 같은 처리) */}
        <h1 className="sr-only">서베이</h1>

        {isLoading && <SurveyListSkeleton />}

        {/*
          ⚠ 에러 화면은 **보여줄 데이터가 없을 때만** 띄운다.
            TanStack Query는 성공 후 리페치가 실패해도 data를 유지하므로, 조건을 나누지 않으면
            에러 박스와 정상 목록이 한 화면에 공존한다(모순된 화면).
        */}
        {error && !surveys && (
          <EmptyState
            title="서베이를 불러오지 못했어요"
            description={error.message}
            onRetry={() => refetch()}
          />
        )}

        {/* 캐시된 목록은 그대로 두고 최신화 실패만 알린다 */}
        {error && surveys && (
          <StaleBanner noun="서베이" onRetry={() => refetch()} />
        )}

        {surveys && surveys.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="아직 서베이가 없어요"
            description="새 문항이 열리면 여기에 올라와요."
          />
        )}

        {open.length > 0 && (
          <section>
            {/* 구역 헤딩 — 왜 어떤 건 카드고 어떤 건 한 줄인지 설명한다 */}
            <h2 className="px-5 pt-4 text-[13px] font-medium text-ink-mute">진행 중</h2>
            <ul>
              {open.map((survey) => (
                <SurveyOpenItem
                  key={survey.id}
                  survey={survey}
                  onSignInRequired={() => setAskSignIn(true)}
                  initialUserId={initialUserId}
                  serverNowMs={serverNowMs}
                />
              ))}
            </ul>
          </section>
        )}

        {closed.length > 0 && (
          <section>
            <h2 className="border-b border-hairline-cool px-5 pb-2 pt-5 text-[13px] font-medium text-ink-mute">
              마감된 서베이
            </h2>
            {/* 계정이 바뀌는 동안(placeholderData) 이전 목록이 남아 있다는 걸 은은하게 알린다 */}
            <ul
              className={cn(
                "transition-opacity duration-150 ease-otb",
                isPlaceholderData && "opacity-50",
              )}
            >
              {closed.map((survey) => (
                <SurveyCard key={survey.id} survey={survey} serverNowMs={serverNowMs} />
              ))}
            </ul>
          </section>
        )}

        {/*
          잘림 안내 — 목록·댓글과 같은 규칙이다. 없으면 상한 뒤의 문항은 화면에서 사라진 채
          사용자에게 아무 단서도 남지 않는다.
          ⚠ 판정은 **응답 길이만으로** 한다. 서버 카운트와 비교하면 리페치 시점이 달라
            잘못된 안내가 뜬다.
        */}
        {surveys && surveys.length >= SURVEY_LIST_LIMIT && (
          <p className="px-5 pt-3 text-center text-[12px] text-ink-mute-2">
            최근 {formatCount(SURVEY_LIST_LIMIT)}개만 표시하고 있어요.
          </p>
        )}
      </TabScrollArea>
      <BottomTabBar />
      <SignInDialog
        open={askSignIn}
        onClose={() => setAskSignIn(false)}
        action="서베이에 참여하려면"
      />
    </>
  );
}

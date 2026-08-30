"use client";

import { CalendarDays } from "lucide-react";
import {
  MATCH_PAST_LIMIT,
  MATCH_UPCOMING_LIMIT,
  type MatchListPage,
  MatchCard,
} from "@/entities/match";
import { cn, formatCount } from "@/shared/lib";
import { EmptyState, StaleBanner } from "@/shared/ui";
import { AppBar } from "@/widgets/app-bar";
import { AuthStatus } from "@/widgets/auth-status";
import { BottomTabBar } from "@/widgets/bottom-tab-bar";
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { useMatchAccuracy } from "../model/use-match-accuracy";
import { useMatchList } from "../model/use-match-list";
import { MatchListSkeleton } from "./match-list-skeleton";

interface MatchListViewProps {
  /** 서버 프리페치 결과 — 실패하면 undefined가 오고 클라이언트가 조회한다 */
  initialMatches?: MatchListPage;
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ **이게 없으면 프리페치가 무의미해진다** — `matchKeys.list`가 userId로 스코프돼 있어
   *   복원 전 `undefined` 키로 찾으면 서버가 채운 캐시에 닿지 못하고 다시 조회한다.
   */
  initialUserId?: string;
  /**
   * 서버가 렌더한 시점의 시각 — 카드의 킥오프 표기가 연도를 붙일지 정한다.
   * ⚠ 구역 분할에는 더 이상 쓰이지 않는다(조회가 이미 갈라 준다) — 없어도 목록은 그려진다.
   */
  serverNowMs?: number;
}

/**
 * 경기 목록 — 지난 며칠의 결과와 다가오는 경기.
 *
 * 글쓰기 FAB가 없다 — 일정을 만드는 것은 사용자가 아니고, 그 경로는 동기화 스크립트다.
 *
 * ⚠ **결과를 먼저, 예측을 나중에** 배치한다 — 사유는 `MATCH_LIST_LOOKBACK_MS`(`api/mappers.ts`).
 */
export function MatchListView({
  initialMatches,
  initialUserId,
  serverNowMs,
}: MatchListViewProps) {
  // 조회·대기 판정은 `model/use-match-list`가 소유한다(사유는 그 훅 주석)
  const { page, isLoading, isPlaceholderData, error, refetch } = useMatchList({
    initialMatches,
    initialUserId,
  });
  const { accuracy, truncated: accuracyTruncated } = useMatchAccuracy(initialUserId);

  const past = page?.past ?? [];
  const upcoming = page?.upcoming ?? [];
  const isEmpty = page !== undefined && past.length === 0 && upcoming.length === 0;

  return (
    <>
      <TabScrollArea>
        <AppBar leading={<AuthStatus />} />

        {/* ⚠ 화면 제목은 sr-only다 — 현재 탭은 하단 탭바가 이미 알린다(다른 목록과 같은 처리) */}
        <h1 className="sr-only">승부예측</h1>

        {/*
          내 적중률 — 이 기능이 주는 유일한 누적 지표이고, 다시 돌아올 이유의 대부분이다.
          ⚠ 보여줄지 말지는 `useMatchAccuracy`가 판정한다(사유는 그 훅에) — 여기서는 값이
            오면 그린다.
          ⚠ 색을 쓰지 않는다 — 목록 카드의 적중/실패 배지가 이미 컬러 이벤트를 갖는다.
        */}
        {/*
          ⚠ **잘렸으면 그 사실을 말한다.** 그냥 숨기면 가장 오래 쓴 사용자가 어느 날 자기
            숫자가 사라진 것을 발견하고 아무 설명도 받지 못한다(사유는 `useMyAccuracyQuery`).
        */}
        {accuracyTruncated && (
          <p className="border-b border-hairline-cool bg-canvas-soft px-5 py-3 text-[13px] text-ink-mute">
            예측이 많아 적중률을 정확히 셀 수 없어요.
          </p>
        )}

        {accuracy && (
          <p className="border-b border-hairline-cool bg-canvas-soft px-5 py-3 text-[13px] text-ink-mute">
            내 적중률{" "}
            <span className="font-mono font-semibold tabular-nums text-ink">
              {Math.round((accuracy.hits / accuracy.total) * 100)}%
            </span>{" "}
            <span className="text-ink-mute-2">
              ({formatCount(accuracy.hits)}/{formatCount(accuracy.total)})
            </span>
          </p>
        )}

        {isLoading && <MatchListSkeleton />}

        {/*
          ⚠ 에러 화면은 **보여줄 데이터가 없을 때만** 띄운다. 리페치가 실패해도 data는
            유지되므로, 조건을 나누지 않으면 에러 박스와 정상 목록이 한 화면에 공존한다.
        */}
        {error && !page && (
          <EmptyState
            title="경기를 불러오지 못했어요"
            description={error.message}
            onRetry={() => refetch()}
          />
        )}

        {/* 캐시된 목록은 그대로 두고 최신화 실패만 알린다 */}
        {error && page && <StaleBanner noun="경기" onRetry={() => refetch()} />}

        {isEmpty && (
          <EmptyState
            icon={CalendarDays}
            title="표시할 경기가 없어요"
            /* ⚠ "등록된 경기가 없다"고 말하지 않는다 — 최근 구역은 7일 창으로 잘리므로
               비시즌에는 DB에 380경기가 있어도 두 구역이 모두 빈다(다른 말이다). */
            description="새 라운드 일정이 올라오면 여기에 뜨고, 경기를 열어 예측할 수 있어요."
          />
        )}

        {/* 계정이 바뀌는 동안(placeholderData) 이전 목록이 남아 있다는 걸 은은하게 알린다 */}
        <div
          className={cn(
            "transition-opacity duration-150 ease-otb",
            isPlaceholderData && "opacity-50",
          )}
        >
          {past.length > 0 && (
            <section>
              {/* ⚠ "지난"이 아니라 "최근"이다 — 킥오프가 지났을 뿐 진행 중인 경기가 섞인다 */}
              <h2 className="px-5 pt-4 text-[13px] font-medium text-ink-mute">최근 경기</h2>
              <ul>
                {past.map((match) => (
                  <MatchCard key={match.id} match={match} serverNowMs={serverNowMs} />
                ))}
              </ul>
              {/*
                ⚠ **안내는 자기 구역 바로 아래 둔다.** 둘을 페이지 맨 아래에 몰아 두었더니
                  최근 경기 안내가 자기가 설명하는 구역에서 **카드 20장 아래**에 있었고,
                  순서도 화면 순서와 반대였다(실측).
                ⚠ 판정은 **응답 길이만으로** 한다 — 서버 카운트와 비교하면 리페치 시점이 달라
                  잘못된 안내가 뜬다.
              */}
              {past.length >= MATCH_PAST_LIMIT && (
                <p className="px-5 pb-1 pt-2 text-center text-[12px] text-ink-mute-2">
                  최근 경기는 {formatCount(MATCH_PAST_LIMIT)}경기까지만 표시하고 있어요.
                </p>
              )}
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="border-b border-hairline-cool px-5 pb-2 pt-5 text-[13px] font-medium text-ink-mute">
                다가오는 경기
              </h2>
              <ul>
                {upcoming.map((match) => (
                  <MatchCard key={match.id} match={match} serverNowMs={serverNowMs} />
                ))}
              </ul>
              {upcoming.length >= MATCH_UPCOMING_LIMIT && (
                <p className="px-5 pb-1 pt-2 text-center text-[12px] text-ink-mute-2">
                  다가오는 경기는 {formatCount(MATCH_UPCOMING_LIMIT)}경기까지만 표시하고 있어요.
                </p>
              )}
            </section>
          )}

          {/*
            ⚠ **다가오는 경기가 0건인 것을 말해 준다.** `isEmpty`는 두 구역이 **모두** 빌 때만
              참이라, 최근 경기만 있으면 이 기능의 **핵심 행동(예측)이 아무 설명 없이 사라진
              화면**이 됐다 — 덜 로드된 건지 더 스크롤해야 하는지 알 수 없었다(실측).
          */}
          {!isEmpty && upcoming.length === 0 && (
            <p className="px-5 pb-2 pt-5 text-center text-[12px] text-ink-mute-2">
              다음 라운드 일정이 아직 없어요. 올라오면 여기에 뜹니다.
            </p>
          )}
        </div>

      </TabScrollArea>
      {/*
        ⚠ **`SignInDialog`를 두지 않는다.** 목록은 카드(링크)만 그리고 예측은 상세에서 한다 —
          비로그인이 여기서 가로채일 액션이 없다. 한때 다이얼로그를 배선해 뒀는데 그것을
          여는 코드가 없어 영원히 닫힌 상태였다. 목록에서 바로 예측하게 만든다면
          (`SurveyOpenItem`이 그 형태다) 그때 `MatchPrediction`과 함께 되살린다.
      */}
      <BottomTabBar />
    </>
  );
}

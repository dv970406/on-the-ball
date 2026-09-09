"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  MATCH_PAST_LIMIT,
  MATCH_UPCOMING_LIMIT,
  type MatchListPage,
  MatchCard,
  groupMatchesByDay,
} from "@/entities/match";
import { cn, formatCount, useNowMs } from "@/shared/lib";
import { EmptyState, StaleBanner } from "@/shared/ui";
import { AppBar } from "@/widgets/app-bar";
import { AuthStatus } from "@/widgets/auth-status";
import { BottomTabBar } from "@/widgets/bottom-tab-bar";
import { TabScrollArea } from "@/widgets/tab-scroll-area";
import { useMatchAccuracy } from "../model/use-match-accuracy";
import { useMatchList } from "../model/use-match-list";
import { MatchListSkeleton } from "./match-list-skeleton";
import {
  MatchListTabs,
  type MatchListTabId,
  listPanelId,
  listTabId,
} from "./match-list-tabs";

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
   * 서버가 렌더한 시점의 시각 — **날짜 헤딩의 "오늘"·"내일"** 과 카드의 상태 배지가 이 값을 본다.
   * ⚠ 구역 분할에는 쓰이지 않는다(조회가 이미 갈라 준다) — 없어도 목록은 그려진다.
   *   다만 없으면 헤딩이 전부 절대 날짜가 되고, 카드가 `진행 중`·`결과 대기`를 말하지 못한다.
   */
  serverNowMs?: number;
}

/**
 * 경기 목록 — 최근 며칠의 결과와 다가오는 경기를 **탭 두 개**로 가른다.
 *
 * 글쓰기 FAB가 없다 — 일정을 만드는 것은 사용자가 아니고, 그 경로는 동기화 스크립트다.
 *
 * ⚠ **탭이 두 구역을 세로로 잇던 것을 대체한다.** 한 화면에 다 쌓으면 최근 10 + 다가오는 20
 *   경기에 날짜 헤딩까지 얹혀 목록이 길어지는데, 이 화면에서 가장 자주 하는 일(다음 경기
 *   예측)이 그 아래에 묻힌다.
 * ⚠ **그래도 두 패널을 모두 렌더하고 `hidden`으로만 가린다.** 이 라우트는 색인 대상이라
 *   초기 HTML에 목록이 담겨야 한다(`nextjs.md`의 "화면을 탭으로 갈라도 HTML에는 전부
 *   남긴다") — 비활성 패널을 조건부 렌더로 빼면 그 결정이 탭 하나로 무너진다.
 *   ⚠ 그래서 패널에 `flex`·`grid` 같은 display 유틸을 얹지 않는다 — 작성자 스타일이 UA의
 *     `[hidden] { display: none }`을 이겨 **가린 패널이 그대로 보인다.**
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

  /**
   * 사용자가 **직접 고른** 탭. 기본값을 여기 담지 않는 이유가 있다 —
   * 어느 쪽을 먼저 보여줄지는 **데이터가 도착해야 정해지고**(시즌 시작 전에는 최근 경기가
   * 0건이다), `useState(초기탭)`으로 굳히면 프리페치가 실패해 클라이언트 조회가 나중에
   * 도착하는 경로에서 계산이 달라져도 반영할 길이 없다(`MatchDetailView`와 같은 형태).
   * → 고른 적이 없으면(`null`) 아래에서 매번 기본값을 계산한다.
   */
  const [pickedTab, setPickedTab] = useState<MatchListTabId | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 세션당 한 번 고정되므로 클라 값을 앞에 두면
  //   낡은 시계가 갓 받은 서버 시각을 이겨 **어제 경기가 "오늘"로 그려진다**
  //   (`data-and-state.md`에 실측). `??`가 단축평가라 훅은 먼저 무조건 부른다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs ?? null;

  const past = page?.past ?? [];
  const upcoming = page?.upcoming ?? [];
  const isEmpty = page !== undefined && past.length === 0 && upcoming.length === 0;
  /** 두 구역이 **모두** 비면 탭이 아니라 `EmptyState` 한 장이 화면을 갖는다 */
  const tabbed = page !== undefined && !isEmpty;
  /**
   * ⚠ 최근 경기가 0건이면 다가오는 경기를 기본으로 연다 — 시즌 시작 전에 들어온 사람이
   *   빈 탭을 마주하고 한 번 더 눌러야 예측할 경기를 보는 일이 없게.
   */
  const activeTab: MatchListTabId = pickedTab ?? (past.length > 0 ? "past" : "upcoming");

  /**
   * 탭을 바꾸면 **새 목록의 처음부터** 보게 한다.
   *
   * ⚠ 스크롤 위치는 탭이 바뀌어도 그대로 남는다 — 최근 경기를 끝까지 내려 보다가 다가오는
   *   경기로 옮기면 목록 한가운데에 떨어져 "내가 어디에 있는지"를 잃는다.
   * ⚠ 스크롤 컨테이너는 `TabScrollArea`가 소유하므로(`<main>`) ref를 넘겨받지 않고
   *   DOM에서 거슬러 찾는다 — 위젯에 스크롤 제어 prop을 새로 여는 것보다 좁은 변경이다.
   * ⚠ **맨 위로 보낸다.** 탭바는 sticky가 아니라(말머리 레일과 같은 형태) 중간에 멈추면
   *   방금 고른 탭이 화면 밖에 남는다.
   */
  const handleTabChange = (id: MatchListTabId) => {
    setPickedTab(id);
    const main = tabsRef.current?.closest("main");
    if (main) main.scrollTop = 0;
  };

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
          ⚠ **탭 위에 둔다.** 두 구역 어느 쪽에도 속하지 않는 화면 전체의 요약이라, 탭 안에
            넣으면 한쪽 탭에서만 보이는 값이 된다.
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
          {tabbed && (
            <div ref={tabsRef}>
              <MatchListTabs active={activeTab} onChange={handleTabChange} />
            </div>
          )}

          {/*
            ⚠ 패널은 **포커스를 받을 수 있어야 한다**(`tabIndex=0`)는 WAI-ARIA 탭 패턴을
              여기서는 따르지 않는다 — 목록은 카드가 전부 링크라 안에 포커스 가능한 요소가
              늘 있고, 컨테이너까지 정거장으로 만들면 Tab 한 번이 그냥 낭비된다
              (읽기 전용이라 들어갈 길이 없던 경기 상세의 라인업·기록과 갈리는 지점이다).
            ⚠ 구역 이름은 `sr-only` h2가 갖는다 — 탭 라벨이 이미 눈에 보이는 이름이라
              같은 글자를 두 번 그리지 않으면서 헤딩 계층(h1 → h2 → h3 → h4)은 지킨다.
          */}
          {tabbed && (
            <section
              id={listPanelId("past")}
              role="tabpanel"
              aria-labelledby={listTabId("past")}
              hidden={activeTab !== "past"}
            >
              {/* ⚠ "지난"이 아니라 "최근"이다 — 킥오프가 지났을 뿐 진행 중인 경기가 섞인다 */}
              <h2 className="sr-only">최근 경기</h2>

              {/*
                ⚠ **날짜는 헤딩이 갖고 카드는 시각만 갖는다.** 예전에는 카드마다
                  "8월 28일 (금) 13:05"이 통째로 반복돼 이 화면에서 가장 긴 텍스트였다.
                ⚠ 두 패널이 같은 형태를 쓰지만 **공용 컴포넌트로 빼지 않는다** — 중복이 2회뿐이라
                  `code-quality.md`의 공용화 기준("3회 이상")에 못 미친다.
              */}
              {groupMatchesByDay(past, nowMs).map((group) => (
                <section key={group.key}>
                  {/* h1(sr-only) → h2(구역) → h3(날짜) → h4(대진, MatchCard) */}
                  <h3 className="px-5 pb-2 pt-4 text-[12px] font-semibold tracking-[-0.2px] text-ink">
                    {group.label}
                  </h3>
                  <ul>
                    {group.matches.map((match) => (
                      <MatchCard key={match.id} match={match} serverNowMs={serverNowMs} />
                    ))}
                  </ul>
                </section>
              ))}

              {/*
                ⚠ **비어 있으면 그 사실을 말한다.** 탭은 눌러야 보이므로 침묵하면 "덜 로드된
                  건가"로 읽힌다 — 이 화면이 다가오는 경기 0건에 대해 이미 하고 있던 처리를
                  두 구역 모두에 적용한 것이다.
              */}
              {past.length === 0 && (
                <p className="px-5 pb-2 pt-6 text-center text-[12px] text-ink-mute-2">
                  최근 일주일 안에 치러진 경기가 없어요.
                </p>
              )}

              {/*
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

          {tabbed && (
            <section
              id={listPanelId("upcoming")}
              role="tabpanel"
              aria-labelledby={listTabId("upcoming")}
              hidden={activeTab !== "upcoming"}
            >
              <h2 className="sr-only">다가오는 경기</h2>

              {groupMatchesByDay(upcoming, nowMs).map((group) => (
                <section key={group.key}>
                  <h3 className="px-5 pb-2 pt-4 text-[12px] font-semibold tracking-[-0.2px] text-ink">
                    {group.label}
                  </h3>
                  <ul>
                    {group.matches.map((match) => (
                      <MatchCard key={match.id} match={match} serverNowMs={serverNowMs} />
                    ))}
                  </ul>
                </section>
              ))}

              {/*
                ⚠ **다가오는 경기가 0건인 것을 말해 준다.** 이 기능의 **핵심 행동(예측)이 아무
                  설명 없이 사라진 화면**이 되면 덜 로드된 건지 더 스크롤해야 하는지 알 수 없다.
              */}
              {upcoming.length === 0 && (
                <p className="px-5 pb-2 pt-6 text-center text-[12px] text-ink-mute-2">
                  다음 라운드 일정이 아직 없어요. 올라오면 여기에 뜹니다.
                </p>
              )}

              {upcoming.length >= MATCH_UPCOMING_LIMIT && (
                <p className="px-5 pb-1 pt-2 text-center text-[12px] text-ink-mute-2">
                  다가오는 경기는 {formatCount(MATCH_UPCOMING_LIMIT)}경기까지만 표시하고 있어요.
                </p>
              )}
            </section>
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

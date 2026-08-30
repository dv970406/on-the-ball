"use client";

import { useNowMs } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import {
  type Survey,
  SplitCard,
  SurveyBlock,
  type SurveyResult,
  isSurveyOpen,
  splitCount,
  useSurveyResultsQuery,
} from "@/entities/survey";
import { useCastSurveyVote } from "../model/use-cast-survey-vote";

interface SurveyVoteProps {
  survey: Survey;
  /**
   * 비로그인이 선택지를 눌렀다.
   *
   * ⚠ **다이얼로그를 여기서 렌더하지 않고 위로 올린다.** `Dialog`는 `absolute`라
   *   가장 가까운 positioned 조상을 기준으로 잡는데, 목록은 `TabScrollArea`의
   *   `relative` 스크롤 영역 안이라 스크롤을 내린 만큼 화면 밖에 뜬다.
   *   ⚠ 게다가 목록에는 이 컴포넌트가 여러 벌 있어 다이얼로그도 여러 벌이 된다 —
   *     `ToastViewport`를 루트에 하나만 두는 것과 같은 이유다.
   */
  onSignInRequired: () => void;
  /** 서버가 미리 조회한 집계 — 참여했을 때만 온다(막대 시프트를 막는다) */
  initialResults?: SurveyResult[];
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ **집계 쿼리 키가 userId로 스코프된다**(`surveyKeys.results`). 이 값이 없으면 세션 복원
   *   전 `undefined` → `"guest"` 키에 위 `initialResults`가 앉고, 복원되는 순간 키가 바뀌어
   *   **같은 집계를 한 번 더 받는다**(첫 응답은 아무도 안 읽는 키에 남는다). 그 순간 결과
   *   막대가 로딩을 거쳐 다시 그려져 SSR이 헛일이 된다. `PollVote`와 같은 형태·같은 이유.
   */
  initialUserId?: string;
  /**
   * 서버가 렌더한 시점의 시각.
   * ⚠ **없으면 마감된 입축구가 참여 가능한 상태로 SSR된다** — `useNowMs()`가 서버에서
   *   `null`이라 `open`이 `null`이 되고 아래 마감 분기를 타지 못한다. 하이드레이션 직후
   *   읽기 전용 UI로 통째로 갈아치워지고, 크롤러에게는 참여 가능한 문항으로 나간다.
   */
  serverNowMs?: number;
}

/**
 * 입축구에 세션·기간·뮤테이션을 붙인다 — **목록과 상세가 이 컴포넌트를 공유한다.**
 * 그리는 일은 `entities/survey`의 `SplitCard`·`SurveyBlock`이 한다.
 *
 * ⚠ **세션 `status`를 3분기한다.** `loading`을 비로그인과 같이 다루면 콜드 로드 직후
 *   로그인한 사용자가 선택지를 눌렀을 때 로그인 안내를 본다.
 * ⚠ `!== "authenticated"`가 아니라 **`=== "guest"`로 판정한다** — 상태가 하나 늘면
 *   부정형만 그 새 상태를 조용히 게스트로 취급한다.
 */
export function SurveyVote({
  survey,
  onSignInRequired,
  initialResults,
  initialUserId,
  serverNowMs,
}: SurveyVoteProps) {
  const status = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 서버가 알려준 사용자를 키로 쓴다(위 initialUserId 주석)
  const userId = status === "loading" ? initialUserId : storeUserId;
  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 모듈 스코프에 세션당 한 번 고정되어 앱을
  //   처음 연 순간에 굳는다(사유는 `use-now.ts`). 그 값을 앞에 두면 갓 받은 서버 시각을
  //   낡은 클라 시계가 이긴다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs ?? null;
  const castVote = useCastSurveyVote(survey.id);

  /**
   * 아직 참여할 수 있는가. **`null`은 "아직 판정 전"** 이다(마운트 전 프레임) —
   * `false`로 접으면 멀쩡한 입축구가 한 프레임 "마감됨"으로 보인다.
   */
  const open = nowMs === null ? null : isSurveyOpen(survey, nowMs);
  const answered = survey.myOptionId !== null;

  /**
   * 집계 조회는 **뮤테이션과 같은 자리**에 있어야 한다.
   *
   * ⚠ `enabled`를 `myOptionId != null`에만 걸면 안 된다. 그 값은 `onMutate`가 낙관적으로
   *   먼저 채우므로, **표가 서버에 커밋되기 전에** 쿼리가 켜진다 → `survey_results`는 아직
   *   미참여자로 보고 0행을 돌려주고, 화면에 `0명이 참여했어요` + 전 항목 `0%`라는
   *   **거짓 결과**가 뜬다. 뮤테이션이 실패하면 그 `[]`가 캐시에 눌러앉아 참여하지 않은
   *   사용자에게 결과 패널이 계속 보인다(리페치도 안 된다).
   *   → 진행 중에는 끈다. `enabled: false`는 이미 받은 데이터를 지우지 않으므로
   *     갈아타기 중에도 화면이 비지 않는다.
   */
  const resultsQuery = useSurveyResultsQuery(
    survey.id,
    userId,
    answered && !castVote.isPending,
    initialResults,
  );
  const results = resultsQuery.data ?? null;
  /**
   * ⚠ **실패를 "아직"과 구분해서 내려보낸다.** `SurveyBlock`이 `results === null`만 보고
   *   스켈레톤을 그리면, 집계 조회가 실패했을 때 막대가 **영원히 돈다**(재시도 계기도 없다).
   */
  const resultsPending = answered && !resultsQuery.isError;

  /**
   * 선택지를 누를 수 있는가.
   *
   * ⚠ **비로그인에게도 연결한다** — 눌러야 로그인 팝업이 뜬다. 읽기 전용으로 두면
   *   "왜 안 눌리지"가 되고, 별도의 안내 링크를 다시 붙여야 한다.
   * ⚠ `loading`은 판단을 미루는 상태라 연결하지 않는다(그때 누르면 로그인한 사용자도
   *   팝업을 본다). 마감(`open === false`)도 마찬가지로 끊는다 — 정책이 어차피 막는다.
   */
  const interactive = status !== "loading" && open !== false;
  const pick = !interactive
    ? undefined
    : status === "guest"
      ? onSignInRequired
      : (optionId: number) => castVote.mutate(optionId);

  const errors = (
    <>
      {/* 토스트는 1.8초 뒤 사라진다 — 지속 표시를 함께 남긴다(둘은 경쟁하지 않는다) */}
      {castVote.error && <p className="mt-2 text-[12px] text-crimson">{castVote.error.message}</p>}
      {/* 집계만 실패한 경우 — 선택지는 멀쩡하므로 화면을 갈아치우지 않고 한 줄로 알린다 */}
      {resultsQuery.isError && (
        <p className="mt-2 text-[12px] text-ink-mute">
          결과를 불러오지 못했어요.{" "}
          <button
            type="button"
            onClick={() => resultsQuery.refetch()}
            className="font-medium text-ink underline underline-offset-2"
          >
            다시 시도
          </button>
        </p>
      )}
    </>
  );

  /**
   * 참여했으면 결과를 보여준다 — 분할 카드는 면적으로 고르는 UI라 비율을 읽을 수 없다.
   * ⚠ **마감됐으면 `pick`이 `undefined`다.** 갈아타기도 정책이 막으므로 누를 수 있으면 거짓말이다.
   */
  if (answered) {
    return (
      <>
        {/* 분할 카드를 통째로 갈아치우는 전환이라 fade를 준다 */}
        <div className={splitCount(survey.options) ? "animate-fade-up" : undefined}>
          <SurveyBlock
            survey={survey}
            results={results}
            resultsPending={resultsPending}
            onVote={pick}
          />
        </div>
        {open === false && (
          <p className="mt-2 text-[12px] text-ink-mute-2">마감된 입축구라 선택을 바꿀 수 없어요.</p>
        )}
        {errors}
      </>
    );
  }

  // 마감 + 미참여 — 읽기 전용 목록으로 두고 사실을 말한다(결과는 참여자에게만 열린다)
  if (open === false) {
    return (
      <>
        <SurveyBlock survey={survey} results={null} />
        <p className="mt-3 text-[12px] text-ink-mute-2">마감된 입축구예요.</p>
      </>
    );
  }

  const faces = splitCount(survey.options);

  if (!faces) {
    return (
      <>
        <SurveyBlock
          survey={survey}
          results={results}
          resultsPending={resultsPending}
          onVote={pick}
        />
        {errors}
      </>
    );
  }

  return (
    <div className="mt-5">
      <SplitCard
        options={survey.options}
        count={faces}
        myOptionId={survey.myOptionId}
        onPick={pick}
        animateVs
      />
      {interactive && (
        <p className="mt-3 text-center text-[12px] text-ink-mute-2">
          면을 탭하면 바로 한 표가 반영돼요. 선택은 바꿀 수 있지만 취소는 안 돼요.
        </p>
      )}
      {errors}
    </div>
  );
}

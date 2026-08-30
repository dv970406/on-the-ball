"use client";

import { useNowMs } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import {
  type Match,
  type MatchPredictionResult,
  PredictionBlock,
  isMatchOpen,
  isPredictionResultsOpen,
  useMatchPredictionResultsQuery,
} from "@/entities/match";
import { CLOSED_MESSAGE, usePredictMatch } from "../model/use-predict-match";

interface MatchPredictionProps {
  match: Match;
  /**
   * 비로그인이 예측을 눌렀다.
   * ⚠ **다이얼로그를 여기서 렌더하지 않고 위로 올린다.** `Dialog`가 `absolute`라 목록의
   *   스크롤 영역 안에 두면 스크롤한 만큼 화면 밖에 뜨고, 목록에는 카드 수만큼 생긴다
   *   (`SurveyVote`·`PollVote`와 같은 이유).
   */
  onSignInRequired: () => void;
  /** 서버가 미리 조회한 분포 — **킥오프가 지났을 때만** 온다(막대 시프트를 막는다) */
  initialResults?: MatchPredictionResult[];
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ **분포 쿼리 키가 userId로 스코프된다.** 이 값이 없으면 세션 복원 전 `"guest"` 키에
   *   `initialResults`가 앉고, 복원되는 순간 키가 바뀌어 **같은 분포를 한 번 더 받는다**
   *   (첫 응답은 아무도 안 읽는 키에 남는다). `SurveyVote`와 같은 형태·같은 이유.
   */
  initialUserId?: string;
  /**
   * 서버가 렌더한 시점의 시각.
   * ⚠ **없으면 킥오프가 지난 경기가 예측 가능한 상태로 SSR된다** — `useNowMs()`가 서버에서
   *   `null`이라 `open`이 `null`이 되어 잠금 분기를 타지 못한다.
   */
  serverNowMs?: number;
}

/**
 * 승부예측에 세션·마감·뮤테이션을 붙인다 — **상세 화면 전용이다.**
 * ⚠ 목록에는 예측 UI가 없다(카드는 `myPick`을 그리기만 한다). 목록에서도 예측하게 만든다면
 *   `SurveyOpenItem`이 그 형태이고, 그때 `MatchListView`의 `SignInDialog`도 함께 되살린다.
 * 그리는 일은 `entities/match`의 `PredictionBlock`이 한다.
 *
 * ⚠ **세션 `status`를 3분기한다.** `loading`을 비로그인과 같이 다루면 콜드 로드 직후
 *   로그인한 사용자가 예측을 눌렀을 때 로그인 안내를 본다.
 * ⚠ `!== "authenticated"`가 아니라 **`=== "guest"`로 판정한다** — 상태가 하나 늘면
 *   부정형만 그 새 상태를 조용히 게스트로 취급한다.
 */
export function MatchPrediction({
  match,
  onSignInRequired,
  initialResults,
  initialUserId,
  serverNowMs,
}: MatchPredictionProps) {
  const status = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 서버가 알려준 사용자를 키로 쓴다(위 initialUserId 주석)
  const userId = status === "loading" ? initialUserId : storeUserId;
  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 모듈 스코프에 세션당 한 번 고정된다
  //   (사유는 `use-now.ts`·`data-and-state.md`). 클라 값을 앞에 두면 낡은 시계가 이긴다.
  //   ⚠ 여기서 어긋나면 HOT 배지(장식)와 달리 **눌러도 DB가 거부하는 기능적 오류**가 된다.
  //   ⚠ `??`는 단축평가라 훅을 뒤에 두면 조건부 호출이 된다 → 먼저 무조건 부른다.
  const predict = usePredictMatch(match.id);
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs ?? null;

  /**
   * **`null`은 "아직 판정 전"** 이다 — `false`로 접으면 첫 프레임에 멀쩡한 경기가 잠긴다.
   *
   * ⚠ **DB가 거부했으면 그 답이 우선이다.** `serverNowMs`는 페이지를 연 순간에 고정되므로
   *   화면에 머문 채 킥오프를 넘기면 시각 판정이 영영 "열림"에 머문다 — 실측: 킥오프 50초
   *   뒤에 누르니 **"킥오프 전까지 바꿀 수 있지만 취소는 안 돼요."와 "킥오프가 지났거나
   *   예측할 수 없는 경기예요."가 한 화면에 나란히** 떴고, 버튼은 여전히 활성이며 눌러도
   *   같은 에러만 반복됐다(새로고침하라는 안내도 없었다).
   *   `lib/open.ts` 주석이 "여기서는 그 상황이 상시 발생한다"고 적어 둔 바로 그 자리다.
   *   → 서버의 거부를 **판정으로 승격**시켜 화면이 스스로 닫힌다.
   */
  const rejectedAsClosed = predict.error?.message === CLOSED_MESSAGE;
  const open = rejectedAsClosed ? false : nowMs === null ? null : isMatchOpen(match, nowMs);

  /**
   * 분포는 **킥오프가 지나야** 열린다.
   *
   * ⚠ 투표·입축구와 달리 `isPending` 중에 끌 이유가 없다. 저쪽은 참여하는 순간 결과가 열려
   *   "커밋 전에 조회가 켜져 0행을 받는" 창이 있었지만, 여기서는 **예측할 수 있는 동안
   *   분포가 반드시 닫혀 있다**(마감 시점과 공개 시점이 같은 킥오프다) — 그 창 자체가 없다.
   */
  // ⚠ **서버(`app/matches/[id]/page.tsx`)와 같은 함수를 부른다.** 조건을 각자 조립하면
  //   서버가 내려준 initialData가 이 판정을 우회한다(사유는 `isPredictionResultsOpen` 주석).
  // ⚠ `nowMs`가 null이면 "아직 모름"이라 닫아 둔다 — 여는 쪽으로 기울면 게이팅된 0행이
  //   "0명이 예측했어요"라는 거짓이 된다.
  const resultsOpen = nowMs !== null && isPredictionResultsOpen(match, nowMs);
  const resultsQuery = useMatchPredictionResultsQuery(
    match.id,
    userId,
    resultsOpen,
    initialResults,
  );
  const results = resultsQuery.data ?? null;
  /**
   * ⚠ **실패를 "아직"과 구분해서 내려보낸다.** `PredictionBlock`이 `results === null`만 보고
   *   스켈레톤을 그리면 조회가 실패했을 때 막대가 **영원히 돈다**(재시도 계기도 없다).
   *
   * ⚠ **`isError`만으로는 부족하다 — `isPaused`도 같이 본다.** `networkMode` 기본값이
   *   `"online"`이라 `onlineManager`가 오프라인으로 판정하면 쿼리가 **`paused`에 머물고
   *   `isError`는 false로 남는다**(재시도가 소진되지 않으니 영영 그렇다). 실측: EXECUTE를
   *   회수한 상태에서 `fetchStatus:"paused"`·`fetchFailureCount:1`로 멈춰 **배너는 안 뜨고
   *   막대만 무한히 돌았다** — 위 주석이 막겠다고 적은 증상이 다른 경로로 그대로 났다.
   */
  const resultsStalled = resultsQuery.isError || resultsQuery.isPaused;
  const resultsPending = resultsOpen && !resultsStalled;

  /**
   * 예측을 누를 수 있는가.
   * ⚠ **비로그인에게도 연결한다** — 눌러야 로그인 팝업이 뜬다. 읽기 전용으로 두면
   *   "왜 안 눌리지"가 되고 별도 안내 링크를 다시 붙여야 한다.
   * ⚠ `loading`은 판단을 미루는 상태라 연결하지 않는다(그때 누르면 로그인한 사용자도 팝업을 본다).
   */
  /*
   * ⚠ **`open !== false`가 아니라 `open === true`다.** 프리페치가 실패해 `serverNowMs`가
   *   없으면 SSR 프레임에서 `open`이 `null`(아직 판정 전)인데, `!== false`는 그것을
   *   "열림"으로 읽어 **취소된 경기에 "취소된 경기예요"와 "킥오프 전까지 바꿀 수 있지만
   *   취소는 안 돼요"가 함께** 뜨고 버튼도 활성이 됐다.
   *   모를 때는 **닫는 쪽**이 안전하다 — 열어서 누르게 하면 DB가 거부한다.
   */
  const interactive = status !== "loading" && open === true;
  const onPick = !interactive
    ? undefined
    : status === "guest"
      ? () => onSignInRequired()
      : predict.mutate;

  return (
    <>
      <PredictionBlock
        match={match}
        results={results}
        resultsPending={resultsPending}
        open={open}
        onPick={onPick}
        // ⚠ 마감된 경기에는 붙이지 않는다 — 선택지가 이미 `disabled`인데 "(로그인 필요)"가
        //   함께 읽히면 "로그인하면 누를 수 있다"는 거짓 신호가 된다.
        signInRequired={status === "guest" && open !== false}
      />

      {/*
        ⚠ **`open === false`의 사유는 둘이다** — 킥오프 경과 **또는 취소**(`isMatchOpen`이
          `!isVoided && kickoff > now`다). 문구를 킥오프로 단정하면 **킥오프 전에 취소된
          경기**에 "킥오프가 지나…"와 "취소된 경기예요"가 함께 떠 앞 줄이 거짓이 된다
          (동기화는 CANCELLED에 `voided_at`만 찍고 `kickoff_at`은 미래 그대로 둔다).
      */}
      {/*
        ⚠ **`myPick`으로 게이팅하지 않는다.** 예측한 적 없는 사용자에게는 잠금 문구가 하나도
          안 뜨는데, 버튼은 `disabled`이면서 `disabled:opacity-100`이라 **활성 버튼과 시각적으로
          똑같다**(실측) — 이 저장소가 `cast-survey-vote`에서 "읽기 전용으로 두면 '왜 안 눌리지'가
          된다"며 명시적으로 피한 상태 그대로다. 최근 경기 구역 카드 대부분이 이 상태였다.
      */}
      {match.isVoided ? (
        <p className="mt-2 text-[12px] text-ink-mute-2">
          취소된 경기예요 — 적중률에 포함되지 않아요.
        </p>
      ) : (
        open === false && (
          <p className="mt-2 text-[12px] text-ink-mute-2">
            {match.myPick !== null
              ? "킥오프가 지나 예측을 바꿀 수 없어요."
              : "킥오프가 지나 예측할 수 없어요."}
          </p>
        )
      )}
      {interactive && (
        <p className="mt-2 text-[12px] text-ink-mute-2">
          킥오프 전까지 바꿀 수 있지만 취소는 안 돼요.
        </p>
      )}

      {/* 토스트는 1.8초 뒤 사라진다 — 지속 표시를 함께 남긴다(둘은 경쟁하지 않는다) */}
      {predict.error && <p className="mt-2 text-[12px] text-crimson">{predict.error.message}</p>}
      {/* 분포만 실패한 경우 — 선택지는 멀쩡하므로 화면을 갈아치우지 않고 한 줄로 알린다 */}
      {/* ⚠ `isPaused`도 함께 본다 — 안 그러면 오프라인에서 스켈레톤만 돌고 아무 말도 없다 */}
      {resultsOpen && resultsStalled && (
        <p className="mt-2 text-[12px] text-ink-mute">
          예측 분포를 불러오지 못했어요.{" "}
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
}

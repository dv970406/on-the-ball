"use client";

import { type Poll, PollBlock, type PollResult, usePollResultsQuery } from "@/entities/poll";
import { useSessionStore } from "@/entities/session";
import { useCastPollVote } from "../model/use-cast-poll-vote";

interface PollVoteProps {
  poll: Poll;
  /**
   * 비로그인이 선택지를 눌렀다.
   *
   * ⚠ **다이얼로그를 여기서 렌더하지 않고 위로 올린다.** `Dialog`는 `absolute`라 가장 가까운
   *   positioned 조상을 기준으로 잡는데, 이 블록은 상세의 `relative` 스크롤 `<main>` 안이라
   *   스크롤을 내린 만큼 화면 밖에 뜬다(`SurveyVote`와 같은 형태·같은 이유).
   */
  onSignInRequired: () => void;
  /**
   * 서버가 본 로그인 사용자(상세가 SSR이라 함께 내려온다).
   *
   * ⚠ **집계 쿼리 키도 userId로 스코프된다.** 이미 투표한 사용자의 글이 SSR되면 첫 렌더에
   *   `enabled`가 켜지는데, 그때 `undefined` 키로 쏘면 세션이 서고 나서 **같은 집계를 다시**
   *   받는다(첫 응답은 아무도 안 읽는 키에 남는다). 복원 전까지 이 값을 쓰면 한 번으로 끝난다.
   */
  initialUserId?: string;
  /** 서버가 미리 조회한 집계 — 참여했을 때만 온다(막대 시프트를 막는다) */
  initialResults?: PollResult[];
}

/**
 * 투표 블록에 세션과 뮤테이션을 붙인다 — `LikeButton`과 같은 자리다.
 * 그리는 일은 전부 `entities/poll`의 `PollBlock`이 한다.
 *
 * ⚠ **세션 `status`를 3분기한다.** `loading`을 비로그인과 같이 다루면 콜드 로드 직후
 *   로그인한 사용자가 선택지를 눌렀을 때 로그인 안내를 본다. 같은 화면의 `LikeButton`·
 *   `CommentBar`가 이미 `loading`을 따로 다루므로, 여기만 2분기로 두면 **한 화면 안에서
 *   세 컴포넌트의 판정이 갈린다.**
 * ⚠ `!== "authenticated"`가 아니라 **`=== "guest"`로 판정한다** — 상태가 하나 늘면
 *   부정형만 그 새 상태를 조용히 게스트로 취급한다(`LikeButton`과 같은 형태).
 */
export function PollVote({
  poll,
  onSignInRequired,
  initialUserId,
  initialResults,
}: PollVoteProps) {
  const status = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  // 세션 복원 전에는 서버가 알려준 사용자를 키로 쓴다(위 initialUserId 주석)
  const userId = status === "loading" ? initialUserId : storeUserId;
  const castVote = useCastPollVote(poll.postId);

  /**
   * 집계 조회는 **뮤테이션과 같은 자리**에 있어야 한다.
   *
   * ⚠ `enabled`를 `myOptionId != null`에만 걸면 안 된다. 그 값은 `onMutate`가 낙관적으로
   *   먼저 채우므로, **표가 서버에 커밋되기 전에** 쿼리가 켜진다 → `poll_results`는 아직
   *   미투표자로 보고 0행을 돌려주고, 화면에 `0명이 투표했어요` + 전 항목 `0%`라는
   *   **거짓 결과**가 뜬다. 뮤테이션이 실패하면 그 `[]`가 캐시에 눌러앉아 투표하지 않은
   *   사용자에게 결과 패널이 계속 보인다(리페치도 안 된다).
   *   → 진행 중에는 끈다. `enabled: false`는 이미 받은 데이터를 지우지 않으므로
   *     갈아타기 중에도 화면이 비지 않는다.
   */
  const resultsQuery = usePollResultsQuery(
    poll.postId,
    userId,
    poll.myOptionId !== null && !castVote.isPending,
    initialResults,
  );
  const results = resultsQuery.data ?? null;
  /**
   * ⚠ **실패를 "아직"과 구분해서 내려보낸다.** `PollBlock`이 `results === null`만 보고
   *   스켈레톤을 그리면, 집계 조회가 실패했을 때 막대가 **영원히 돈다**(재시도 계기도 없다).
   *   실패했으면 스켈레톤 대신 아래 배너가 사실을 말한다.
   */
  const resultsPending = poll.myOptionId !== null && !resultsQuery.isError;

  // 세션 복원 전에는 판단을 미룬다 — 읽기 전용으로 두되 아무 데도 보내지 않는다
  if (status === "loading") {
    return <PollBlock poll={poll} results={results} resultsPending={resultsPending} />;
  }

  /**
   * 선택지를 누르면 무슨 일이 일어나는가.
   *
   * ⚠ **비로그인에게도 연결한다** — 눌러야 로그인 안내가 뜬다(`SurveyVote`와 같은 형태).
   *   전에는 선택지를 죽여 두고 아래에 "로그인하고 투표하기" 링크를 달았는데, 사용자가
   *   실제로 누르는 것은 선택지라 **눌러도 아무 반응이 없는 UI**가 됐고, 링크를 찾아 누른
   *   사람은 설명 없이 읽던 글을 잃었다.
   */
  const guest = status === "guest";
  // ⚠ `onSignInRequired`를 그대로 넘기지 않고 **인자 없이 감싼다.** `onVote`는 `optionId`를
  //   실어 부르는데 TS는 인자를 덜 받는 함수를 허용하므로, 그대로 두면 나중에 인자를 쓰는
  //   콜백으로 갈아끼웠을 때 선택지 id가 조용히 흘러 들어간다.
  const pick = guest ? () => onSignInRequired() : (optionId: number) => castVote.mutate(optionId);

  return (
    <>
      <PollBlock
        poll={poll}
        results={results}
        resultsPending={resultsPending}
        onVote={pick}
        signInRequired={guest}
      />
      {/* 토스트는 1.8초 뒤 사라진다 — 지속 표시를 함께 남긴다(둘은 경쟁하지 않는다) */}
      {castVote.error && (
        <p className="mt-2 text-[12px] text-crimson">{castVote.error.message}</p>
      )}
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
}

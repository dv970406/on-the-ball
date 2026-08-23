"use client";

import { COLOR } from "@/shared/config";
import { cn, formatCount } from "@/shared/lib";
import { RatioBar, Skeleton } from "@/shared/ui";
import type { Survey, SurveyResult } from "../model/types";

interface SurveyBlockProps {
  survey: Survey;
  /**
   * 선택지별 득표수. **`null`이면 아직 볼 수 없다는 뜻**(미참여·비로그인)이고,
   * 빈 배열은 "열렸는데 표가 없다"이다 — 둘을 구분해야 화면이 거짓말하지 않는다.
   */
  results: SurveyResult[] | null;
  /**
   * 집계를 **기다리는 중**인가.
   *
   * ⚠ `results === null`만으로 판정하면 안 된다 — "아직 안 왔다"와 "조회가 실패했다"가
   *   같은 값이 되어, 실패했을 때 스켈레톤이 **영원히 돈다**("곧 온다"는 거짓 신호).
   *   실패는 상위가 배너로 알리고 이 값은 false가 된다.
   */
  resultsPending?: boolean;
  /**
   * 없으면 읽기 전용 — 세션 판정은 상위(features)가 한다.
   * ⚠ 비로그인에게도 **연결된다**(그래야 눌렀을 때 로그인 팝업이 뜬다). 읽기 전용은
   *   마감된 서베이뿐이다.
   */
  onVote?: (optionId: number) => void;
}

/**
 * 서베이 선택지 + 결과 — 프레젠테이션 전용(세션도 뮤테이션도 모른다).
 * 세션 3분기와 실제 참여는 `features/cast-survey-vote`의 `SurveyVote`가 갖는다.
 *
 * ⚠ **질문을 렌더하지 않는다.** `PollBlock`과 갈리는 유일한 지점이다 — 게시글 투표에서는
 *   글 제목이 h1이라 질문이 h2였지만, 서베이는 **질문 자체가 화면의 h1**이라 뷰가 소유한다.
 *
 * ⚠ 막대를 에메랄드로 칠하지 않는다 — 선택지가 여럿이면 "한 뷰포트당 컬러 이벤트 1개"가
 *   깨진다. 내가 고른 것만 진하게 해서 **색이 아닌 명도**로 구분한다(`PollBlock`과 같다).
 *
 * ⚠ `role="radiogroup"`을 쓰지 않는다 — 그 롤은 화살표 키 이동(roving tabindex)을
 *   약속하는 것인데 구현이 없다. `aria-pressed`에 머문다(`code-quality.md`).
 */
export function SurveyBlock({
  survey,
  results,
  resultsPending,
  onVote,
}: SurveyBlockProps) {
  const total = results?.reduce((sum, r) => sum + r.voteCount, 0) ?? 0;
  const countOf = (optionId: number) =>
    results?.find((r) => r.optionId === optionId)?.voteCount ?? 0;

  // ⚠ 파생시키지 않는다 — `results === null && myOptionId !== null`로 계산하면 조회가
  //   실패했을 때도 참이 되어 스켈레톤이 영원히 돈다. 판정은 상위가 준다.
  const awaitingResults = results === null && resultsPending === true;

  return (
    <div className="mt-5">
      <ul className="flex flex-col gap-2">
        {survey.options.map((option) => {
          const mine = survey.myOptionId === option.id;
          const count = countOf(option.id);
          // 0으로 나누지 않는다 — 결과가 열렸는데 총 0표인 순간이 실제로 있다(내 표가 롤백된 직후)
          const ratio = total > 0 ? count / total : 0;

          return (
            <li key={option.id}>
              <button
                type="button"
                // ⚠ 텍스트가 든 버튼이라 aria-label을 붙이지 않는다(콘텐츠를 덮어쓴다)
                aria-pressed={mine}
                disabled={!onVote}
                onClick={onVote ? () => onVote(option.id) : undefined}
                className={cn(
                  "w-full rounded-sm border bg-canvas px-3 py-2.5 text-left",
                  "transition-colors duration-150 ease-otb",
                  mine ? "border-ink" : "border-hairline-cool",
                  onVote ? "active:border-ink" : "disabled:opacity-100",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[14px]",
                      mine ? "font-semibold text-ink" : "text-ink-secondary",
                    )}
                  >
                    {option.label}
                  </span>
                  {mine && <span className="sr-only">— 내가 고른 선택지</span>}
                  {results && (
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-mute">
                      {Math.round(ratio * 100)}%
                      <span className="sr-only"> ({formatCount(count)}표)</span>
                    </span>
                  )}
                </span>
              </button>
              {/*
                ⚠ 막대는 **버튼 밖**이다. `RatioBar`·`Skeleton`의 루트가 `div`인데
                  `button`의 콘텐츠 모델은 phrasing content라 `div`를 담을 수 없다
                  (브라우저가 관용해 조용히 통과하지만 무효 HTML이다).
              */}
              {results && (
                <RatioBar
                  className="mt-2"
                  height={4}
                  segments={[{ ratio, color: mine ? COLOR.ink : COLOR.hairlineStrong }]}
                />
              )}
              {awaitingResults && <Skeleton className="mt-2 h-1 w-full" />}
            </li>
          );
        })}
      </ul>

      {/* ⚠ 참여자 수도 결과의 일부다 — 미참여자에게는 숫자를 흘리지 않는다 */}
      {results && (
        <p className="mt-3 text-[12px] text-ink-mute-2">{formatCount(total)}명이 참여했어요</p>
      )}
    </div>
  );
}

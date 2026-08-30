"use client";

import { COLOR } from "@/shared/config";
import { cn, formatCount } from "@/shared/lib";
import { RatioBar, Skeleton } from "@/shared/ui";
import { isMatchSettled } from "../lib/open";
import type { Match, MatchPick, MatchPredictionResult } from "../model/types";
import { MATCH_PICKS, MATCH_PICK_LABEL } from "../model/types";

interface PredictionBlockProps {
  match: Match;
  /**
   * 예측 분포. **`null`이면 아직 볼 수 없다는 뜻**(킥오프 전)이고, 빈 배열은
   * "열렸는데 예측이 없다"이다 — 둘을 구분해야 화면이 거짓말하지 않는다.
   */
  results: MatchPredictionResult[] | null;
  /**
   * 분포를 **기다리는 중**인가.
   * ⚠ `results === null`만으로 판정하면 "아직 안 왔다"와 "조회가 실패했다"가 같은 값이 되어
   *   실패했을 때 스켈레톤이 **영원히 돈다**(`PollBlock`에서 같은 함정을 밟았다).
   */
  resultsPending?: boolean;
  /** 아직 예측할 수 있는가 — `null`이면 **아직 판정 전**(마운트 전)이라 잠그지 않는다 */
  open: boolean | null;
  /**
   * 없으면 읽기 전용 — 세션 판정은 상위(features)가 한다.
   * ⚠ **비로그인에게도 연결된다** — 눌러야 로그인 안내가 뜬다(`PollVote`와 같은 형태).
   */
  onPick?: (pick: MatchPick) => void;
  /** 누르면 예측이 아니라 **로그인 안내**가 뜨는 상태인가(비로그인) */
  signInRequired?: boolean;
}

/**
 * 승부예측 블록 (홈 · 무 · 원정).
 *
 * 프레젠테이션 전용이다 — 세션도 뮤테이션도 모른다(`PollBlock`과 같은 자리).
 * 세션 3분기와 실제 예측은 `features/predict-match`의 `MatchPrediction`이 갖는다.
 *
 * ⚠ **에메랄드를 쓰지 않는다.** 선택지는 **카드당 3개**라 목록에서 카드 수의 세 배로 늘어난다 —
 *   "한 뷰포트당 컬러 이벤트 1개"가 그만큼 깨진다. 잉크 래더로 **명도**만 쓴다
 *   (`PollBlock`이 같은 이유로 같은 선택을 했다).
 *   ⚠ `MatchCard`의 "적중" 배지가 에메랄드인 것과 반대 결론이 아니다 — 그쪽은 **예측했고
 *     채점까지 끝난 카드에만 최대 1개**이고, `styling.md`의 에메랄드 자리 표에 등재된
 *     `Pill`을 경유하며, 글자를 담아 "색이 정보를 혼자 지지 않는다"도 만족한다.
 *
 * ⚠ `role="radiogroup"`을 쓰지 않는다 — 화살표 키 이동을 약속하는 롤인데 구현하지 않는다.
 */
export function PredictionBlock({
  match,
  results,
  resultsPending,
  open,
  onPick,
  signInRequired,
}: PredictionBlockProps) {
  const total = results?.reduce((sum, r) => sum + r.voteCount, 0) ?? 0;
  const countOf = (pick: MatchPick) =>
    results?.find((r) => r.pick === pick)?.voteCount ?? 0;

  /**
   * 팀을 아는 자리에서는 이름을 쓴다 — "홈 승"보다 "맨유 승"이 읽힌다.
   *
   * ⚠ **정식명이 아니라 약칭이다** — 버튼 세 개가 세로로 쌓이는 자리다. 사유와 폴백 규약은
   *   `Team.shortName`(`model/types.ts`) 주석이 갖는다.
   */
  const labelOf = (pick: MatchPick) =>
    pick === "home"
      ? `${match.homeTeam.shortName} 승`
      : pick === "away"
        ? `${match.awayTeam.shortName} 승`
        : MATCH_PICK_LABEL.draw;

  const awaitingResults = results === null && resultsPending === true;
  // ⚠ `open === null`은 "아직 판정 전"이다 — false로 접으면 첫 프레임에 멀쩡한 경기가 잠긴다
  const locked = open === false;

  return (
    <section
      aria-label="승부예측"
      className="rounded-[14px] border border-hairline-cool bg-canvas-soft px-4 py-4"
    >
      <ul className="flex flex-col gap-2">
        {MATCH_PICKS.map((pick) => {
          const mine = match.myPick === pick;
          // ⚠ `result`가 무효 경기에서도 null이라는 규약은 `isMatchSettled`가 소유한다
          const correct = isMatchSettled(match) && match.result === pick;
          const count = countOf(pick);
          // 0으로 나누지 않는다 — 분포가 열렸는데 총 0건인 순간이 실제로 있다
          const ratio = total > 0 ? count / total : 0;

          return (
            <li key={pick}>
              <button
                type="button"
                aria-pressed={signInRequired ? undefined : mine}
                aria-haspopup={signInRequired ? "dialog" : undefined}
                disabled={!onPick || locked}
                onClick={onPick ? () => onPick(pick) : undefined}
                className={cn(
                  "w-full rounded-sm border px-3 py-2.5 text-left",
                  "transition-colors duration-150 ease-otb",
                  mine ? "border-ink" : "border-hairline-cool",
                  /*
                    ⚠ **잠긴 상태를 시각으로도 지게 한다.** 전에는 `disabled:opacity-100`이
                      기본 흐림을 없애고 다른 표시를 넣지 않아, 계산된 스타일이 활성 버튼과
                      **모든 값이 같았다**(실측: opacity·border·background 전부 동일).
                      비활성을 지는 채널이 0개라 눌러도 무반응인 이유를 알 수 없었고,
                      역설적으로 `disabled`를 읽어 주는 스크린리더 사용자만 알 수 있었다.
                    ⚠ 흐림이 아니라 **바탕**으로 가른다 — 결과 막대와 퍼센트는 잠긴 뒤에도
                      읽어야 하므로 `opacity`를 내리면 정보까지 흐려진다.
                  */
                  locked ? "bg-canvas-soft disabled:opacity-100" : "bg-canvas",
                  onPick && !locked ? "active:border-ink" : "disabled:opacity-100",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[14px]",
                      mine ? "font-semibold text-ink" : "text-ink-secondary",
                    )}
                  >
                    {labelOf(pick)}
                  </span>
                  {mine && <span className="sr-only">— 내가 고른 예측</span>}
                  {/*
                    ⚠ **정답은 눈에 보여야 한다.** 전에는 `sr-only` + 잉크 막대뿐이었는데,
                      아무도 안 고른 정답은 막대 폭이 **0%라 사라져** 화면에 아무 표시가
                      없었다(실측: 오답자에게 잉크 막대가 둘 뜨고 어느 쪽이 정답인지
                      구분되지 않았다). `styling.md`의 "색이 정보를 혼자 지지 않는다" 그대로
                      **글자로** 표시한다 — 목록 카드가 `적중`/`실패`로 하는 것과 같은 급이다.
                  */}
                  {correct && (
                    <span className="shrink-0 rounded-xs bg-ink px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                      정답
                    </span>
                  )}
                  {signInRequired && <span className="sr-only"> (로그인 필요)</span>}
                  {results && (
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-mute">
                      {Math.round(ratio * 100)}%
                      <span className="sr-only"> ({formatCount(count)}명)</span>
                    </span>
                  )}
                </span>
              </button>
              {/* ⚠ 막대는 **버튼 밖**이다 — `button`의 콘텐츠 모델(phrasing)에 `div`를 담을 수 없다 */}
              {results && (
                <RatioBar
                  className="mt-2"
                  height={4}
                  segments={[
                    // 실제 결과는 잉크로 진하게 — 내 예측(경계선)과 다른 축으로 구분된다
                    // ⚠ `correct || mine`으로 두면 **한 채널에 두 뜻**이 실려 오답자에게
                    //   진한 막대가 둘 뜬다 — 정답은 위 `정답` 배지가 지고, 막대는 내 예측만 진다.
                    { ratio, color: mine ? COLOR.ink : COLOR.hairlineStrong },
                  ]}
                />
              )}
              {awaitingResults && <Skeleton className="mt-2 h-1 w-full" />}
            </li>
          );
        })}
      </ul>

      {results ? (
        <p className="mt-3 text-[12px] text-ink-mute-2">{formatCount(total)}명이 예측했어요</p>
      ) : (
        /*
         * ⚠ **왜 안 보이는지를 말해 준다.** 게이팅 축이 투표·입축구와 반대라("참여"가 아니라
         *   "킥오프") 사용자는 "참여했는데 왜 안 보이지"로 읽는다 — 그 오해를 문구가 막는다.
         */
        locked === false && (
          <p className="mt-3 text-[12px] text-ink-mute-2">
            다른 사람의 예측은 킥오프 후에 공개돼요
          </p>
        )
      )}
    </section>
  );
}

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
   * 팀을 아는 자리에서는 이름을 쓴다 — "홈"보다 "맨유"가 읽힌다.
   *
   * ⚠ **"승"을 붙이지 않는다.** 세 칸이 `아스날 / 무승부 / 첼시`로 나란히 놓이면 그 자체가
   *   1X2 보기라 팀 이름만으로 뜻이 완성된다 — "승"은 세 칸 중 둘에만 붙는 접미사라
   *   정보가 아니라 반복이고, 좁은 행에서 이름이 잘릴 폭을 먼저 먹는다.
   * ⚠ **정식명이 아니라 약칭이다** — 버튼 세 개가 **한 줄에 나란히** 놓여 각 칸이 화면 폭의
   *   1/3뿐이다. 세로로 쌓였을 때보다 폭이 더 좁아 약칭이 아니면 곧바로 잘린다.
   *   사유와 폴백 규약은 `Team.shortName`(`model/types.ts`) 주석이 갖는다.
   */
  const labelOf = (pick: MatchPick) =>
    pick === "home"
      ? match.homeTeam.shortName
      : pick === "away"
        ? match.awayTeam.shortName
        : MATCH_PICK_LABEL.draw;

  const awaitingResults = results === null && resultsPending === true;
  // ⚠ `open === null`은 "아직 판정 전"이다 — false로 접으면 첫 프레임에 멀쩡한 경기가 잠긴다
  const locked = open === false;
  /*
   * ⚠ **세 칸이 함께** 띠 자리를 잡는다. 결과 칸에만 띠를 그리면 그 칸만 높아지는데,
   *   막대가 버튼 **밖**에 있어(아래 주석) 나머지 두 칸의 막대까지 위로 어긋난다.
   *   채점 전에는 아무 칸도 자리를 잡지 않으므로 예측 중인 화면은 그대로다.
   * ⚠ `result`가 무효 경기에서도 null이라는 규약은 `isMatchSettled`가 소유한다.
   */
  const settled = isMatchSettled(match);

  return (
    <section
      aria-label="승부예측"
      className="rounded-[14px] border border-hairline-cool bg-canvas-soft px-4 py-4"
    >
      {/*
       * ⚠ **1행 3열이다 — 세로로 쌓지 않는다.** 세 줄이면 예측 블록 하나가 160px을 먹어
       *   대진·스코어와 라인업 사이를 갈라놓았다(상세 화면이 이미 길다). 가로로 놓으면
       *   60px로 줄고, 무엇보다 **1X2 보기의 관습적인 형태**라 세 선택지가 서로의 대안이라는
       *   것이 배치만으로 읽힌다.
       * ⚠ 칸 폭이 화면의 1/3이라 **라벨은 약칭이어야 한다**(위 `labelOf` 주석).
       */}
      <ul className="grid grid-cols-3 gap-2">
        {MATCH_PICKS.map((pick) => {
          const mine = match.myPick === pick;
          const correct = settled && match.result === pick;
          const count = countOf(pick);
          // 0으로 나누지 않는다 — 분포가 열렸는데 총 0건인 순간이 실제로 있다
          const ratio = total > 0 ? count / total : 0;

          return (
            <li key={pick} className="min-w-0">
              <button
                type="button"
                aria-pressed={signInRequired ? undefined : mine}
                aria-haspopup={signInRequired ? "dialog" : undefined}
                disabled={!onPick || locked}
                onClick={onPick ? () => onPick(pick) : undefined}
                className={cn(
                  "w-full rounded-sm border px-2 py-2.5 text-center",
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
                <span className="flex flex-col items-center gap-1">
                  {/*
                    ⚠ **실제로 일어난 쪽은 눈에 보여야 한다.** 전에는 `sr-only` + 잉크 막대뿐이었는데,
                      아무도 안 고른 쪽이 결과면 막대 폭이 **0%라 사라져** 화면에 아무 표시가
                      없었다(실측: 빗나간 사람에게 잉크 막대가 둘 뜨고 어느 쪽이 결과인지
                      구분되지 않았다). `styling.md`의 "색이 정보를 혼자 지지 않는다" 그대로
                      **글자로** 표시한다.

                    ⚠ **`적중`이라고 쓰지 않는다.** 이 띠는 "내가 맞췄나"가 아니라
                      **"이 일이 실제로 일어났다"** 를 뜻한다 — 내가 무승부를 골랐는데 아스날이
                      이겼으면 아스날 칸에 띠가 붙는데, 거기에 `적중`이라고 쓰면 거짓말이 된다.
                      내 예측의 성패는 상세 메타 줄과 목록 카드의 `적중`/`실패`가 따로 진다.

                    ⚠ **퍼센트 옆의 배지가 아니라 칸 폭을 통째로 쓰는 띠다.** 칸 폭이 화면의
                      1/3(≈110px)이라 배지와 `%`를 한 줄에 두면 서로의 폭을 먹었다 — 띠는
                      경쟁할 상대가 없어 문구를 `실제 결과`로 온전히 담는다.
                    ⚠ 안쪽 라운드는 **5px**이다(버튼 6px − 테두리 1px). `rounded-sm`을 그대로
                      쓰면 모서리에 흰 틈이 보인다.
                    ⚠ 결과가 아닌 칸은 `invisible`이라 접근성 트리에서도 빠진다 — `aria-hidden`을
                      따로 붙이지 않는다.
                  */}
                  {settled && (
                    <span
                      className={cn(
                        "-mx-2 -mt-2.5 self-stretch rounded-t-[5px] px-1 py-0.5",
                        "text-[10px] font-medium leading-[1.4]",
                        correct ? "bg-ink text-white" : "invisible",
                      )}
                    >
                      실제 결과
                    </span>
                  )}
                  <span
                    className={cn(
                      "w-full truncate text-[14px] leading-[1.3]",
                      mine ? "font-semibold text-ink" : "text-ink-secondary",
                    )}
                  >
                    {labelOf(pick)}
                  </span>
                  {/*
                    ⚠ **화면에서 뗀 "승"을 낭독에는 남긴다.** 눈으로는 세 칸이 나란히 놓여
                      `아스날 / 무승부 / 첼시`가 1X2 보기로 읽히지만, 스크린리더는 버튼을
                      **하나씩** 읽으므로 "아스날"만으로는 무엇을 고르는 것인지 알 수 없다.
                      `aria-label`로 덮지 않고 `sr-only`를 덧붙이는 형태다(`code-quality.md`).
                  */}
                  {/* ⚠ 뒤에 퍼센트가 바로 붙는다 — 공백이 없으면 "빌라 승0%"로 이어져 읽힌다 */}
                  {pick !== "draw" && <span className="sr-only"> 승 </span>}
                  {mine && <span className="sr-only">— 내가 고른 예측</span>}
                  {signInRequired && <span className="sr-only"> (로그인 필요)</span>}
                  {results && (
                    <span className="font-mono text-[12px] tabular-nums text-ink-mute">
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
                    // ⚠ `correct || mine`으로 두면 **한 채널에 두 뜻**이 실려 빗나간 사람에게
                    //   진한 막대가 둘 뜬다 — 실제 결과는 위 `실제 결과` 띠가 지고, 막대는 내 예측만 진다.
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

import type { Match } from "../model/types";

/**
 * 아직 예측할 수 있는 경기인가 — **DB의 `match_is_open`과 같은 판정**이어야 한다.
 *
 * ⚠ **`nowMs`를 인자로 받는 것이 규약이다**(`isSurveyOpen`·`isHotPost`와 같은 이유).
 *   호출부는 `useNowMs()`를 넘기고, **`null`인 프레임은 "아직 판정 전"** 으로 다룬다 —
 *   `false`로 접으면 첫 프레임에 멀쩡한 경기가 "마감됨"으로 보인다.
 *
 * ⚠ **이 판정은 안내일 뿐 방어가 아니다.** `useNowMs`가 마운트 시각에 고정되므로 킥오프
 *   직전에 열어 둔 화면은 경계를 넘는 순간을 놓치는데, 입축구와 달리 여기서는 **그 상황이
 *   상시 발생한다**(사람들이 킥오프 직전에 예측한다). 실제 차단은 `match_is_open` 정책이
 *   하고 훅이 그 거부를 한국어로 바꾼다.
 */
export function isMatchOpen(
  match: Pick<Match, "kickoffAt" | "isVoided">,
  nowMs: number,
): boolean {
  return !match.isVoided && new Date(match.kickoffAt).getTime() > nowMs;
}

/**
 * 채점이 끝난 경기인가. ⚠ `result`가 null이면 **결과 없음과 무효를 둘 다** 뜻한다 —
 * DB가 일부러 하나로 접었으므로(술어를 둘로 나누면 한쪽을 빠뜨린다) 여기서도 접어 둔다.
 */
export function isMatchSettled(match: Pick<Match, "result">): boolean {
  return match.result !== null;
}

/**
 * **예측 분포를 볼 수 있는 경기인가** — 킥오프가 지났고, 취소되지 않았다.
 *
 * ⚠ **`!isMatchOpen(...)`이 아니다.** `isMatchOpen`은 취소만으로도 false가 되므로 그것을
 *   뒤집으면 **취소된 경기까지 "분포 공개"로 넘어간다.** 실제로 그렇게 고쳤다가 취소된
 *   경기에 "취소된 경기예요"와 분포 패널이 함께 떴고, **취소된 미래 경기**에서는 게이팅된
 *   0행이 `[]`로 접혀 "0명이 예측했어요"라는 거짓말이 됐다.
 *   두 술어(`킥오프 경과`·`취소 아님`)는 뒤집기로 합성되지 않는다 — 그래서 함수를 따로 둔다.
 *
 * ⚠ **서버(SSR 프리페치)와 클라이언트가 이 함수 하나를 써야 한다.** 두 곳이 각자 조건을
 *   조립하면 서버가 내려준 `initialData`가 클라이언트의 판정을 조용히 우회한다 —
 *   `undefined`(볼 수 없음)와 `[]`(열렸는데 0건)의 구분이 그 지점에서 무너진다.
 */
export function isPredictionResultsOpen(
  match: Pick<Match, "kickoffAt" | "isVoided">,
  nowMs: number,
): boolean {
  return !match.isVoided && new Date(match.kickoffAt).getTime() <= nowMs;
}

/**
 * 경기가 실제로 진행될 법한 창 — 90분 + 하프타임 + 추가시간·지연을 넉넉히 잡는다.
 */
const IN_PROGRESS_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * **지금 뛰고 있다고 볼 수 있는가** — 킥오프는 지났고, 결과가 없고, 취소도 아니고,
 * 아직 그 창 안이다.
 *
 * ⚠ **상한이 없으면 거짓말이 된다.** 처음엔 "킥오프 지남 + 결과 없음"으로만 판정했더니
 *   **이틀 전 킥오프한 경기가 "진행 중"** 으로 떴다(실측). 지난 경기 창이 7일이라 최대
 *   일주일간 거짓 표기다. 게다가 그 상태는 동기화가 **정상이라고 명시한 두 상태**와
 *   모양이 같다 — 연기(POSTPONED, "조용히 대기")와 스코어를 못 읽은 종료 경기(`badScores`,
 *   "영영 채점되지 않은 채 목록에만 남는다"). 창을 벗어나면 진행 중이 아니라 **결과 대기**다.
 */
export function isMatchInProgress(
  match: Pick<Match, "kickoffAt" | "isVoided" | "result">,
  nowMs: number,
): boolean {
  if (match.isVoided || isMatchSettled(match)) return false;
  const elapsed = nowMs - new Date(match.kickoffAt).getTime();
  return elapsed >= 0 && elapsed <= IN_PROGRESS_WINDOW_MS;
}

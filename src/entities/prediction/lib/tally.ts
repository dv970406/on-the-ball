import type { DealPrediction, PredictionTally } from "../model/types";

/**
 * 비율을 보여 주는 최소 표 수 — 그보다 적으면 표 수만 그린다. 세 표 중 두 표를 "67%"로 그리면 팬 다수의 의견처럼 읽힌다.
 */
export const MIN_VOTES_FOR_SHARE = 5;

/** 한 회차의 집계 — 표가 없으면 0 */
export function tallyOf(prediction: DealPrediction | undefined, roundKey: string): PredictionTally {
  return prediction?.tallies.find((t) => t.roundKey === roundKey) ?? { roundKey, yes: 0, no: 0 };
}

/** 한 회차의 내 표 — 없으면 `null`(아직 고르지 않았다) */
export function myPickOf(prediction: DealPrediction | undefined, roundKey: string): boolean | null {
  return prediction?.mine.find((m) => m.roundKey === roundKey)?.willHappen ?? null;
}

/**
 * 표가 있는 회차 중 가장 나중 회차 — 결과가 나온 딜(투표가 닫혔다)의 카드가 이 회차를 그린다.
 * ⚠ 회차 키는 `YYYY-(summer|winter)`다(DB `transfer_window` CHECK). 같은 해에는 겨울(1월)이 여름(6월)보다 먼저다.
 */
export function latestVotedRound(prediction: DealPrediction | undefined): string | null {
  const order = (key: string) => Number(key.slice(0, 4)) * 2 + (key.endsWith("summer") ? 1 : 0);
  const voted = (prediction?.tallies ?? []).filter((t) => t.yes + t.no > 0);
  if (!voted.length) return null;
  return voted.reduce((a, b) => (order(b.roundKey) > order(a.roundKey) ? b : a)).roundKey;
}

/**
 * 성사 쪽 비율(%) — 두 비율의 합이 100이 되게 성사 쪽만 반올림하고 불발 쪽은 나머지다.
 * 표가 `MIN_VOTES_FOR_SHARE`보다 적으면 `null`(비율을 그리지 않는다).
 */
export function yesShare(tally: PredictionTally): number | null {
  const total = tally.yes + tally.no;
  if (total < MIN_VOTES_FOR_SHARE) return null;
  return Math.round((tally.yes / total) * 100);
}

/**
 * 표 하나를 옮긴 집계 — 낙관적 갱신이 쓴다. `from`이 `null`이면 새 표, 같으면 그대로다.
 * ⚠ 0 밑으로 내려가지 않는다 — 캐시가 낡아 내 표가 집계에 아직 없을 수 있다(다음 조회가 맞춘다).
 */
export function moveVote(tally: PredictionTally, from: boolean | null, to: boolean): PredictionTally {
  if (from === to) return tally;
  const next = { ...tally };
  if (from === true) next.yes = Math.max(0, next.yes - 1);
  if (from === false) next.no = Math.max(0, next.no - 1);
  if (to) next.yes += 1;
  else next.no += 1;
  return next;
}

/** 한 회차에 내 표를 입힌 예측 — 낙관적 갱신과 되돌리기가 같은 계산을 쓴다 */
export function applyPick(
  prediction: DealPrediction,
  roundKey: string,
  pick: boolean | null,
): DealPrediction {
  const current = myPickOf(prediction, roundKey);
  if (current === pick) return prediction;
  const tally = tallyOf(prediction, roundKey);
  // 표를 거두는 경로는 없다 — `pick`이 null인 것은 "고르기 전으로 되돌리기"(실패 롤백)뿐이다
  const nextTally =
    pick === null
      ? {
          ...tally,
          yes: current === true ? Math.max(0, tally.yes - 1) : tally.yes,
          no: current === false ? Math.max(0, tally.no - 1) : tally.no,
        }
      : moveVote(tally, current, pick);
  const others = prediction.mine.filter((m) => m.roundKey !== roundKey);
  return {
    tallies: [...prediction.tallies.filter((t) => t.roundKey !== roundKey), nextTally],
    mine: pick === null ? others : [...others, { roundKey, willHappen: pick }],
  };
}

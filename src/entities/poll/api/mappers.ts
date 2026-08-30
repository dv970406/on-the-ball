import type { Poll, PollOptionRow, PollResult, PollRow, PollVoteRow } from "../model/types";

/**
 * PostgREST select 문자열의 단일 소스.
 *
 * ⚠ **`post_poll` 아래에 두 자식을 나란히** 둔다. `post_poll_option` 밑에 `post_poll_vote`를
 *   3단으로 중첩하면 복합 FK(`(post_id, option_id) → post_poll_option`) 추론에 기대게 되는데,
 *   둘 다 `post_poll(post_id)`를 향하는 **단일 컬럼 FK**로 잡으면 평범한 관계 추론으로 끝난다.
 *   (그래서 `post_poll_vote`에 논리적으로 중복인 단일 FK를 일부러 선언해 두었다 —
 *    마이그레이션 20260817000003 주석 참고. 지우면 이 select가 깨진다.)
 *
 * ⚠ **득표수가 여기 없다.** 컬럼이 아니라 `post_poll_results` RPC가 세고, 투표한 사람에게만
 *   열린다. 여기에 넣으려고 컬럼을 만들면 게이팅이 무너진다.
 */
export const POLL_SELECT =
  "post_id, question, post_poll_option(id, label, sort_order), post_poll_vote(option_id)";

/** POLL_SELECT가 돌려주는 행의 형태 — 컬럼 타입은 생성 타입에서 뽑는다 */
export interface PollSelectRow {
  post_id: PollRow["post_id"];
  question: PollRow["question"];
  post_poll_option: Pick<PollOptionRow, "id" | "label" | "sort_order">[] | null;
  /** SELECT 정책이 "내 행만"이라 길이가 0 또는 1이다 */
  post_poll_vote: Pick<PollVoteRow, "option_id">[] | null;
}

export function buildPoll(row: PollSelectRow): Poll {
  return {
    postId: row.post_id,
    question: row.question,
    // ⚠ 정렬을 DB order에 맡기지 않는다 — 임베딩된 자식의 순서는 보장되지 않는다
    options: (row.post_poll_option ?? [])
      .map((o) => ({ id: o.id, label: o.label, sortOrder: o.sort_order }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    myOptionId: row.post_poll_vote?.[0]?.option_id ?? null,
  };
}

/** `post_poll_results` RPC의 행 → 도메인 */
export function buildPollResult(row: { option_id: number; vote_count: number }): PollResult {
  return { optionId: row.option_id, voteCount: row.vote_count };
}

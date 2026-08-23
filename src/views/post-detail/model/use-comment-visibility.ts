"use client";

import { COMMENT_LIST_LIMIT } from "@/entities/comment";

interface UseCommentVisibilityArgs {
  /** 글의 `comment_count` (DB 트리거가 관리하는 진실값 — 답글 포함 총합) */
  commentCount: number;
  /** 실제로 받아 온 댓글 수 — 아직 안 왔으면 `undefined` */
  loadedCount: number | undefined;
  /** 댓글 목록 쿼리가 갱신 중인가 */
  isFetching: boolean;
  /** 위 카운트를 담은 **글 쿼리**가 갱신 중인가 */
  commentCountFetching: boolean;
}

/**
 * 댓글 목록의 **잘림·숨김 판정**을 소유한다.
 *
 * 서로 다른 두 쿼리 캐시(글·댓글)의 뺄셈에 양쪽 `isFetching`까지 얽힌 판정이라
 * 컴포넌트에 두지 않는다(`code-quality.md`: "여러 신호가 얽힌 판정", "적어 둘 실패 모드가
 * 있을 때 훅으로 뺀다"). 아래 두 ⚠가 그 실패 모드다.
 *
 * ⚠ **잘림은 두 조건을 함께 본다.** 목록 길이만 보면 정확히 상한일 때(잘린 게 없는데)도 뜨고,
 *   카운트만 보면 아래 레이스에서 잘못 뜬다. 상한에 닿았고 **동시에** 실제 총합이 더 클 때만 참이다.
 *
 * ⚠ **숨김은 한쪽 캐시만 먼저 도착한 순간에는 그리지 않는다.** 이 값은 글 캐시와 댓글 캐시의
 *   뺄셈인데 둘은 따로 무효화되고 따로 도착한다 — 댓글을 하나 쓰면 1행짜리 글 응답이
 *   200행짜리 댓글 응답보다 먼저 와서 `commentCount = N+1`, `loadedCount = N`이 되고,
 *   차단한 사람이 **하나도 없는** 사용자에게 "차단한 사용자의 댓글은 보이지 않습니다"가
 *   뜬다(삭제하면 반대 방향으로 어긋난다). 문구가 원인을 단정하므로 그 거짓말이 비싸다.
 *   → 양쪽이 **모두 멎었을 때만** 판정한다. 어긋남은 영구적인 성질이라 조금 늦게 떠도 된다.
 *
 * ⚠ 잘림일 때는 숨김을 그리지 않는다 — 그때는 잘림 문구가 이미 차이를 설명하고 있고,
 *   두 원인이 겹치면 어느 쪽인지 말할 수 없다.
 *
 * ⚠ **차단한 사용자의 댓글은 RLS(`comment_select_visible`)가 걸러 오는데 `comment_count`는
 *   트리거가 관리하는 값이라 그들을 계속 포함한다.** 카운터를 뷰어별로 다르게 만들 수는
 *   없으므로(트리거가 단독 관리한다) 그 차이를 화면 문구로 갚는 것이 이 훅의 목적이다.
 */
export function useCommentVisibility({
  commentCount,
  loadedCount,
  isFetching,
  commentCountFetching,
}: UseCommentVisibilityArgs) {
  const loaded = loadedCount ?? 0;
  const truncated = loaded >= COMMENT_LIST_LIMIT && commentCount > loaded;
  const hiddenCount = commentCount - loaded;
  const showHidden = !isFetching && !commentCountFetching && !truncated && hiddenCount > 0;

  return { truncated, hiddenCount, showHidden };
}

import type { QueryClient } from "@tanstack/react-query";
import { commentKeys } from "./keys";

/** 쓰기 뒤 목록 재조회를 기다리는 상한 — 정상 왕복(수십~수백 ms)은 넉넉히 덮는다 */
const REFRESH_WAIT_MS = 3000;

/**
 * 댓글을 쓰거나 지운 뒤 목록을 **다시 받을 때까지** 기다린다 — 작성·삭제 훅이 이걸 await한 뒤에 성공 토스트를
 * 내서, 토스트와 목록 변경이 같은 순간이 된다.
 *
 * ⚠ 이 리페치를 **되돌리며 취소**하는 호출부를 두지 않는다. 한때 표의 `onMutate`가 `cancelQueries`로
 *   이걸 되돌려 await가 받지도 않은 채 끝났다 — "등록했어요" 뒤 1초 넘게 새 댓글이 없었다(QA 실측).
 *   표는 이제 조회를 취소하지 않는다(`use-vote-comment` 주석). 겹친 리페치가 `cancelRefetch`로 새로
 *   시작되는 것은 괜찮다 — 먼저 건 await가 새 조회에 얹혀 함께 끝난다(query-core `Query.fetch`).
 */
export function refreshCommentLists(queryClient: QueryClient, dealId: number): Promise<void> {
  const refetch = queryClient.invalidateQueries({ queryKey: commentKeys.deal(dealId) });
  // ⚠ 기다림에 상한을 둔다 — 쓰기는 이미 성공했는데 목록 조회가 계속 실패하면 재시도(백오프)가 끝날 때까지
  //   "삭제 중…"·등록 버튼 잠금·성공 토스트가 8초 넘게 묶였다(QA 실측). 상한이 지나면 성공을 알리고,
  //   목록의 실패는 StaleBanner가 알린다. 조회는 계속 돌다가 끝나면 그대로 반영된다.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, REFRESH_WAIT_MS));
  return Promise.race([refetch, timeout]);
}

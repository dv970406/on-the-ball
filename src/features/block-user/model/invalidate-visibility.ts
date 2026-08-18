import type { QueryClient } from "@tanstack/react-query";
import { blockKeys } from "@/entities/block";
import { commentKeys } from "@/entities/comment";
import { postKeys } from "@/entities/post";

/**
 * 차단/해제 후 가시성이 달라진 캐시를 되돌린다.
 *
 * ⚠ **차단과 해제가 반드시 같은 집합을 건드려야 한다.** 한쪽에만 키를 더하면 가시성이
 *   비대칭이 되어 "차단하면 사라지는데 해제해도 안 돌아오는" 캐시가 생긴다. 호출부가 둘뿐이라
 *   보통은 중복을 두는 쪽이 맞지만(code-quality.md), 여기는 **함께 바뀌지 않으면 곧바로 버그**라
 *   단일 소스로 둔다. 두 훅의 차이는 이 Promise를 기다리느냐뿐이다.
 *
 * ⚠ **`removeQueries({ type: "inactive" })`가 필요하다.** `invalidateQueries`의 기본
 *   `refetchType`이 `"active"`라 언마운트된 상세·댓글 캐시는 stale 표시만 되고 **차단된
 *   내용을 그대로 들고 있다가 다시 열릴 때 한 프레임 노출된다** — 유저 전환에서 이전 사용자의
 *   `isLiked`가 새던 것과 같은 클래스다(data-and-state.md).
 *
 * ⚠ 다만 전역 `removeQueries`는 과하다 — poll·profile 캐시는 차단과 무관하므로 키로 좁힌다.
 */
export function invalidateVisibility(queryClient: QueryClient): Promise<unknown> {
  queryClient.removeQueries({ queryKey: postKeys.all, type: "inactive" });
  queryClient.removeQueries({ queryKey: commentKeys.all, type: "inactive" });

  return Promise.all([
    queryClient.invalidateQueries({ queryKey: postKeys.all }),
    queryClient.invalidateQueries({ queryKey: commentKeys.all }),
    queryClient.invalidateQueries({ queryKey: blockKeys.all }),
  ]);
}

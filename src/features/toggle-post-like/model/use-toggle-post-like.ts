"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/shared/lib";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import {
  postKeys,
  type PostDetail,
  type PostListItem,
  type PostListPage,
} from "@/entities/post";

/**
 * 롤백용 스냅샷 — 목록은 말머리·정렬 조합마다 키가 달라 **여러 개**다. 전부 담는다.
 * (그래서 setQueryData가 아니라 setQueriesData를 쓴다)
 */
interface LikeSnapshot {
  lists: [QueryKey, PostListPage | undefined][];
  detail: PostDetail | undefined;
}

/** 좋아요 상태를 뒤집은 사본 (목록 항목·상세 모두 같은 필드를 쓴다) */
function toggled<T extends Pick<PostListItem, "id" | "isLiked" | "likeCount">>(
  post: T,
  postId: number,
): T {
  if (post.id !== postId) return post;
  return {
    ...post,
    isLiked: !post.isLiked,
    likeCount: post.likeCount + (post.isLiked ? -1 : 1),
  };
}

/**
 * 좋아요 토글.
 *
 * RPC가 유저 id를 인자로 받지 않는다 — 함수 안에서 auth.uid()로 확정하므로
 * 여기서 세션의 user.id를 읽어 넘길 필요가 없다. 비로그인은 UI에서 막고,
 * 뚫려도 함수 EXECUTE 권한이 없어 DB가 거부한다.
 *
 * 낙관적 업데이트: onMutate(취소+스냅샷) → onError(롤백) → onSettled(재동기화).
 */
export function useTogglePostLike(postId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<boolean, Error, void, LikeSnapshot>({
    mutationFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase.rpc("toggle_post_like", { p_post_id: postId });
      if (error) {
        console.error("[like] 토글 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      // 생성 타입의 Functions.toggle_post_like.Returns가 boolean이라 캐스팅이 필요 없다
      return data; // true = 좋아요 켜짐
    },

    onMutate: async () => {
      // 진행 중인 리페치가 낙관적 값을 덮어쓰지 못하게 먼저 취소한다
      await Promise.all([
        queryClient.cancelQueries({ queryKey: postKeys.lists() }),
        queryClient.cancelQueries({ queryKey: postKeys.detail(postId) }),
      ]);

      const snapshot: LikeSnapshot = {
        lists: queryClient.getQueriesData<PostListPage>({ queryKey: postKeys.lists() }),
        detail: queryClient.getQueryData<PostDetail>(postKeys.detail(postId)),
      };

      // setQueryData가 아니라 setQueriesData(복수형) — 목록 캐시가 여러 키에 존재할 수 있다.
      queryClient.setQueriesData<PostListPage>({ queryKey: postKeys.lists() }, (old) =>
        old ? { ...old, items: old.items.map((post) => toggled(post, postId)) } : old,
      );
      queryClient.setQueryData<PostDetail>(postKeys.detail(postId), (old) =>
        old ? toggled(old, postId) : old,
      );

      return snapshot;
    },

    onError: (error, _vars, snapshot) => {
      snapshot?.lists.forEach(([key, value]) => queryClient.setQueryData(key, value));
      queryClient.setQueryData(postKeys.detail(postId), snapshot?.detail);
      // 롤백은 하트를 조용히 되돌릴 뿐이라, 알리지 않으면 **눌린 적이 없는 것처럼 보인다**.
      // 화면 문구는 조건부 평문이라 스크린리더에 닿지 않는다 → 유일한 알림 채널로 보낸다.
      toast(error.message);
    },

    onSettled: () => {
      // RPC 반환값(boolean)으로 직접 덮지 않고 무효화한다 —
      // 연타로 뮤테이션이 겹치면 마지막 응답이 최신이라는 보장이 없다.
      //
      // ⚠ 여기서 Promise를 반환하지 않는다. 반환하면 리페치가 끝날 때까지 isPending이
      //   유지되는데, 낙관적 업데이트는 이미 화면에 정답을 그려놨으므로 연타만 막혀
      //   오히려 반응이 둔해진다. (댓글 작성처럼 낙관적 갱신이 없는 뮤테이션은 반대로 반환한다)
      void queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) });
    },
  });
}

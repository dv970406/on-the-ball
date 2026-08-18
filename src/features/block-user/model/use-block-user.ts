"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import { invalidateVisibility } from "./invalidate-visibility";

/**
 * 사용자 차단 — 내 화면에서 그 사람의 글·댓글이 사라진다(단방향).
 *
 * ⚠ **숨김은 이 훅이 하지 않는다.** `post_select_visible`·`comment_select_visible` 정책이
 *   한다(마이그레이션 20260818000001). 여기가 하는 일은 행 하나를 만들고 **가시성이
 *   달라진 캐시를 되돌리는 것**뿐이다 — 조회 훅에 필터를 붙이면 한 곳만 빠뜨려도 샌다.
 *
 * ⚠ **중복 실행 가드가 여기 없다.** 성공의 부수효과(스크롤 저장분 폐기 → 목록으로 이동 →
 *   토스트)가 화면의 결정이라 뮤테이션을 **조립하는 쪽**이 가드를 갖는다
 *   (`views/post-detail/model/use-post-block.ts`) — `useDeletePost` ↔ `usePostDeletion`과 같은 분업.
 */
export function useBlockUser() {
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const toast = useToast();

  return useMutation({
    mutationFn: async (blockedId: string) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");

      const { error } = await supabase
        .from("user_block")
        .insert({ blocker_id: user.id, blocked_id: blockedId });

      // ⚠ **이미 차단한 사람을 다시 차단하는 것은 성공으로 흡수한다.** 목표 상태에 이미
      //   도달했으므로 멱등이 맞다. 그대로 흘리면 toDbErrorMessage가 23505를 닉네임 문구인
      //   "이미 사용 중인 값이에요."로 접어 엉뚱한 말이 나간다.
      //   ⚠ 신고(post_report)는 **반대다** — "접수했어요"를 두 번 말하면 거짓말이라
      //     트리거가 P0001로 사유를 설명한다. 같은 23505라도 갈리는 지점이 여기다.
      if (error && error.code !== "23505") {
        console.error("[block] 차단 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    // ⚠ 무효화 Promise를 반환하지 않는다. 반환하면 목록·상세가 먼저 리페치되어 방금 차단한
    //   글이 사라지고, "글을 찾을 수 없어요"가 깜빡인 뒤에야 화면이 이동한다.
    //   이동 자체가 성공 표시라 리페치 완료를 기다릴 이유가 없다(`use-delete-post`와 같은 규약).
    onSuccess: () => {
      void invalidateVisibility(queryClient);
    },
    // 실패를 앱의 유일한 알림 채널로 — 화면 문구는 조건부 평문이라 스크린리더에 닿지 않는다
    onError: (error) => toast(error.message),
  });
}

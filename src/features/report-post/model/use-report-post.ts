"use client";

import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { useSessionStore } from "@/entities/session";
import type { ReportReason } from "./report-reason";

/**
 * 글 신고 — 사유만 저장한다.
 *
 * ⚠ **무효화할 캐시가 없다.** 신고는 어떤 화면의 표시도 바꾸지 않는다(관리 화면이 없고
 *   `post_report`에는 SELECT 정책조차 없다). 성공 표시는 토스트 하나뿐이다.
 *
 * ⚠ **`.select()`를 붙이지 않는다.** `post_report`에 SELECT 권한이 없어 붙이면 42501로
 *   죽는다(마이그레이션 20260818000002). insert의 RLS 위반은 0행이 아니라 에러라
 *   반환 행 수를 확인할 필요도 없다.
 */
export function useReportPost(postId: number) {
  const user = useSessionStore((s) => s.user);
  const toast = useToast();

  return useMutation({
    mutationFn: async (reason: ReportReason) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");

      const { error } = await supabase
        .from("post_report")
        .insert({ post_id: postId, reporter_id: user.id, reason });

      if (error) {
        console.error("[report] 신고 실패:", error);
        // ⚠ 중복 신고는 `check_post_report` 트리거가 P0001 한국어로 설명하지만, 트리거는
        //   BEFORE라 **동시 요청 두 건이 둘 다 통과하는 창**이 남는다. 그 창은 복합 PK가
        //   막고(23505) 여기서 같은 문구로 접는다 — 그냥 두면 toDbErrorMessage가 닉네임
        //   문구인 "이미 사용 중인 값이에요."로 접어 뜻이 어긋난다.
        //   (`use-cast-poll-vote`가 다른 탭의 선행 투표에서 같은 형태의 창을 메운 선례)
        throw new Error(
          error.code === "23505" ? "이미 신고한 글이에요." : toDbErrorMessage(error),
        );
      }
    },
    /**
     * ⚠ **성공 토스트도 훅이 갖는다.** 호출부(per-call `onSuccess`)에 두면 요청 중에 시트를
     *   닫는 순간 컴포넌트가 언마운트되어 옵저버가 사라지고 **접수됐는데 아무 말도 하지 않는다**
     *   — 사용자는 실패한 줄 알고 다시 신고했다가 "이미 신고한 글이에요"를 본다.
     *   훅 레벨 콜백은 Mutation이 직접 부르므로 화면이 사라져도 돈다(토스트는 전역 스토어다).
     */
    onSuccess: () => toast("신고를 접수했어요"),
    // 실패를 앱의 유일한 알림 채널로 — 시트가 닫히면 화면에 문구를 남길 자리도 없다
    onError: (error) => toast(error.message),
  });
}

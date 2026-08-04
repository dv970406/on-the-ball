"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { postKeys } from "@/entities/post";
import { useSessionStore } from "@/entities/session";
import type { PostInput } from "./post-schema";

/** 새 글 작성 — 성공 시 만들어진 글의 id를 돌려준다(상세로 이동하기 위해) */
export function useCreatePost() {
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ category, title, content }: PostInput) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");

      const { data, error } = await supabase
        .from("post")
        // author_id를 클라이언트가 넣지만 RLS의 with check가 auth.uid()와 대조한다 →
        // 남의 명의로 쓰려 하면 정책 위반으로 거부된다
        .insert({ author_id: user.id, category, title, content })
        .select("id")
        .single();

      if (error) {
        console.error("[post] 작성 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      // 클라이언트에 Database 타입이 붙어 있어 data는 { id: number }로 추론된다
      return data.id;
    },
    // ⚠ 무효화 Promise를 반환하지 않는다 — 성공하면 곧바로 상세로 이동하므로
    //   리페치 완료를 기다릴 이유가 없다. 반환하면 그만큼 isPending이 길어져
    //   버튼이 "등록 중…"인 채 이동이 지연된다(삭제 훅과 같은 규약).
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      // ⚠ todayCount는 lists() prefix에 걸리지 않는다 — 따로 무효화하지 않으면
      //   글을 올려도 목록 헤드의 "오늘 N개"가 그대로 남는다.
      void queryClient.invalidateQueries({ queryKey: postKeys.todayCount() });
    },
  });
}

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
    mutationFn: async ({ title, content }: PostInput) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");

      const { data, error } = await supabase
        .from("post")
        // author_id를 클라이언트가 넣지만 RLS의 with check가 auth.uid()와 대조한다 →
        // 남의 명의로 쓰려 하면 정책 위반으로 거부된다
        .insert({ author_id: user.id, title, content })
        .select("id")
        .single();

      if (error) {
        console.error("[post] 작성 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      // 클라이언트에 Database 타입이 붙어 있어 data는 { id: number }로 추론된다
      return data.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: postKeys.lists() }),
  });
}

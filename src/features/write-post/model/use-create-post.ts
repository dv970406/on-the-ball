"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { postKeys } from "@/entities/post";
import { useSessionStore } from "@/entities/session";
import type { PollInput } from "./poll-schema";
import type { PostInput } from "./post-schema";

export interface CreatePostVariables {
  input: PostInput;
  /** 투표를 붙이지 않았으면 `null` */
  poll: PollInput | null;
}

/** 새 글 작성 — 성공 시 만들어진 글의 id를 돌려준다(상세로 이동하기 위해) */
export function useCreatePost() {
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ input, poll }: CreatePostVariables) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");
      const { category, title, content } = input;

      /**
       * 투표가 붙으면 **한 트랜잭션**이어야 한다. 투표는 생성 시 고정이라
       * "글은 올라갔는데 투표만 실패"의 복구 경로가 아예 없기 때문이다.
       *
       * ⚠ 이 RPC는 **`security definer`** 다(마이그레이션 20260817000003 §6). 원자성만이
       *   목적이 아니라 **유일한 생성 경로**이기도 하다 — `post_poll`·`post_poll_option`에는 정책도
       *   grant도 없어서, 이 함수 말고는 투표를 만들 수 없다. 그래야 "생성 시 고정"과
       *   "선택지 2~4개"를 함수 하나가 단독으로 소유한다.
       * ⚠ 즉 **RLS와 컬럼 권한이 이 경로에는 적용되지 않는다.** `author_id`를 인자로 넘기지
       *   않는 것이 그래서 필수다 — 함수 안에서 `auth.uid()`로 확정하는 것 말고는 명의를
       *   대조할 층이 없다. 인자로 받도록 고치면 남의 명의로 글을 쓸 수 있게 된다.
       */
      if (poll) {
        const { data, error } = await supabase.rpc("create_post_with_poll", {
          p_category: category,
          p_title: title,
          p_content: content,
          p_question: poll.question,
          p_options: poll.options,
        });
        if (error) {
          console.error("[post] 투표 포함 작성 실패:", error);
          throw new Error(toDbErrorMessage(error));
        }
        return data;
      }

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
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
    },
    // 실패를 앱의 유일한 알림 채널로 — 폼 하단 문구는 조건부 평문이라 낭독되지 않는다
    onError: (error) => toast(error.message),
  });
}

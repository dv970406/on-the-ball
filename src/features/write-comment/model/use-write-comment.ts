"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { hasVisibleChar, lengthOverflow, useToast, type TextLimit } from "@/shared/lib";
import { commentKeys } from "@/entities/comment";
import { postKeys } from "@/entities/post";
import { useSessionStore } from "@/entities/session";

/**
 * 댓글 한도 — 화면 1,000그래핌 / DB 10,000코드포인트(`comment_content_check`와 같은 값).
 * ⚠ 두 값은 **함께** 검사해야 한다. 판정은 `lengthOverflow`가 소유한다.
 *   규약은 `docs/conventions/api-and-db.md`의 "길이 한도는 두 단위로 겹쳐 건다".
 */
export const COMMENT_LIMIT: TextLimit = { grapheme: 1000, codePoint: 10000 };

/**
 * 댓글 입력 검증 — 통과하면 `null`, 아니면 사용자에게 보일 한국어 문구.
 *
 * ⚠ **검증을 뷰에 두지 않는다.** 게시글(`validatePost`)·닉네임(`validateNickname`)과
 *   같은 형태를 지켜야 "같은 종류는 같은 형태"가 유지되고, 뷰가 한도 상수를 알 이유도 없다.
 * ⚠ 제출 시점에만 부른다 — 렌더 중에 부르면 그래핌 계산이 매 키 입력마다 돈다.
 */
export function validateComment(value: string): string | null {
  // 제로폭 문자만 있는 댓글도 걸러낸다(화면에 아무것도 안 보이는 댓글이 등록됐다).
  if (!hasVisibleChar(value)) return "내용을 입력해 주세요.";

  const over = lengthOverflow(value, COMMENT_LIMIT);
  if (over === "grapheme") return `댓글은 ${COMMENT_LIMIT.grapheme}자까지 쓸 수 있어요.`;
  // 코드포인트 초과는 결합 문자를 쌓지 않는 한 도달할 수 없다 → 길이로만 말한다.
  if (over === "codePoint") return "댓글이 너무 길어요.";
  return null;
}

export interface WriteCommentInput {
  content: string;
  /** null = 루트 댓글. 깊이 1 제한은 DB 트리거(check_comment_depth)가 P0001로 거부한다 */
  parentId: number | null;
}

/**
 * 댓글 작성.
 *
 * post.comment_count는 클라이언트가 건드리지 않는다 — DB 트리거가 올린다.
 * 그래서 성공 후 댓글 목록과 함께 글 캐시도 무효화해야 카운트가 화면에 반영된다.
 * (트리거가 답글도 세므로 comment_count는 답글 포함 총합이다)
 */
export function useWriteComment(postId: number) {
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ content, parentId }: WriteCommentInput) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");

      const { error } = await supabase
        .from("comment")
        .insert({ post_id: postId, user_id: user.id, content, parent_id: parentId });

      if (error) {
        console.error("[comment] 작성 실패:", error);
        // ⚠ 42501은 RLS 거부인데, 화면에서 도달 가능한 원인은 **글이 삭제된 경우**뿐이다
        //   (남의 명의 위조는 UI 경로가 없다). 일반 "권한이 없어요."로 두면 실제 사유가 가려진다.
        if ((error as { code?: string }).code === "42501") {
          throw new Error("삭제된 글에는 댓글을 달 수 없어요.");
        }
        throw new Error(toDbErrorMessage(error));
      }
    },
    // 무효화 Promise를 반환해 리페치 완료까지 isPending을 유지한다 →
    // 입력창이 비워지기 전에 다시 눌러 중복 등록되는 레이스를 막는다
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: commentKeys.list(postId) }),
        queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) }),
        queryClient.invalidateQueries({ queryKey: postKeys.lists() }),
      ]),
    // 실패를 앱의 유일한 알림 채널로 — 입력창 아래 문구는 조건부 평문이라 낭독되지 않는다
    onError: (error) => toast(error.message),
  });
}

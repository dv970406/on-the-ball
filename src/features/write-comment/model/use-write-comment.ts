"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toWriteErrorMessage } from "@/shared/api";
import { hasVisibleChar, lengthOverflow, useToast, type TextLimit } from "@/shared/lib";
import { commentKeys, refreshCommentLists } from "@/entities/comment";
import { useSessionStore } from "@/entities/session";

/**
 * 댓글 한도 — 화면 300그래핌 / DB 3,000코드포인트(`transfer_deal_comment_content_length`와 같은 값).
 * ⚠ 두 값은 **함께** 검사해야 한다. 판정은 `lengthOverflow`가 소유한다.
 *   규약은 `docs/conventions/api-and-db.md`의 "길이 한도는 두 단위로 겹쳐 건다".
 */
export const COMMENT_LIMIT: TextLimit = { grapheme: 300, codePoint: 3000 };

/**
 * 댓글 입력 검증 — 통과하면 `null`, 아니면 사용자에게 보일 한국어 문구.
 *
 * ⚠ **검증을 뷰에 두지 않는다.** 닉네임(`validateNickname`)과 같은 형태를 지켜야 "같은 종류는
 *   같은 형태"가 유지되고, 뷰가 한도 상수를 알 이유도 없다.
 * ⚠ 제출 시점에만 부른다 — 렌더 중에 부르면 그래핌 계산이 매 키 입력마다 돈다.
 * ⚠ `<input maxLength>`로 대신하지 않는다 — UTF-16 코드유닛을 세어 이모지 댓글이 한도의 절반에서
 *   **아무 안내 없이 잘린다.**
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

/**
 * 답글 대상이 그 사이 지워져 DB 트리거(`transfer_deal_comment_check_depth`)가 거부했을 때의 문구.
 * ⚠ 마이그레이션의 P0001 문구와 **글자 하나까지 같아야 한다** — 한쪽만 고치면 아래 판정이 조용히 거짓이 된다.
 */
const REPLY_TARGET_MISSING_MESSAGE = "답글을 달 댓글을 찾을 수 없어요. 삭제됐을 수 있어요.";

/**
 * 이 작성 실패가 "답글 대상이 지워졌다"는 사유인가 — 답글 칸이 대상 소실 안내를 겹쳐 내지 않는 데 쓴다.
 * 다른 실패(검증·네트워크·권한)는 대상이 지워졌다는 말을 하지 않았으므로 안내가 따로 필요하다.
 */
export function isReplyTargetMissing(error: Error | null): boolean {
  return error?.message === REPLY_TARGET_MISSING_MESSAGE;
}

export interface WriteCommentInput {
  content: string;
  /** null = 루트 댓글. 깊이 1 제한은 DB 트리거가 P0001로 거부한다(사유가 그대로 노출된다) */
  parentId: number | null;
}

/**
 * 댓글·답글 작성.
 *
 * ⚠ 무효화 Promise를 **반환한다** — 리페치 완료까지 `isPending`이 유지되어 입력창이 비워지기 전
 *   재클릭으로 중복 등록되는 레이스를 막는다(낙관적 업데이트가 없는 행 생성 — `data-and-state.md` 표).
 *   그 대가로 호출부의 per-call `onSuccess`는 **리페치가 끝난 뒤** 돈다 — 입력창은 호출부가
 *   제출 즉시 비워야 한다(`use-comment-composer`).
 * ⚠ 무효화는 **그 딜의 모든 사용자 스코프**를 잡는다(`commentKeys.deal`) — 로그인 직후 옛 스코프가
 *   비활성 캐시로 남아 있으면 되돌아왔을 때 방금 쓴 댓글이 빠진 목록이 한 프레임 보인다.
 * ⚠ 성공 토스트는 **루트 댓글에만** 낸다 — 답글은 입력칸이 닫히고 그 자리에 답글이
 *   붙는 것이 곧 성공 표시다. 실패는 언제나 토스트로 보낸다(앱의 유일한 알림 채널).
 */
export function useWriteComment(dealId: number) {
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const toast = useToast();

  return useMutation<void, Error, WriteCommentInput>({
    mutationFn: async ({ content, parentId }) => {
      const supabase = requireBrowserSupabase();
      if (!user) throw new Error("로그인이 필요해요.");

      const { error } = await supabase
        .from("transfer_deal_comment")
        .insert({ deal_id: dealId, user_id: user.id, content, parent_id: parentId });

      if (error) {
        console.error("[comment] 작성 실패:", error);
        throw new Error(await toWriteErrorMessage(supabase, error));
      }
    },
    // ⚠ 토스트는 **리페치가 끝난 뒤** 낸다 — 먼저 내면 느린 회선에서 "등록했어요"가 나오고 2~3초 동안
    //   목록에 새 댓글이 없다(QA 실측). 호출부의 최신순 전환(per-call onSuccess)과도 같은 순간이 된다.
    onSuccess: async (_data, { parentId }) => {
      await refreshCommentLists(queryClient, dealId);
      if (parentId === null) toast("댓글을 등록했어요");
    },
    /**
     * ⚠ 실패해도 목록을 다시 받는다 — 가장 흔한 실패가 "답글을 달 댓글이 그 사이 지워졌다"(P0001)인데,
     *   다시 받지 않으면 지워진 루트와 되살아난 답글 칸이 그대로 남아 재전송이 같은 실패만 반복한다.
     *   반환하지 않는다 — 실패 문구·입력값 복원을 리페치 뒤로 미룰 이유가 없다.
     */
    onError: (error) => {
      toast(error.message);
      queryClient.invalidateQueries({ queryKey: commentKeys.deal(dealId) });
    },
  });
}

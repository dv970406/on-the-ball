"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/types/database.types";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { POST_IMAGE_BUCKET } from "@/shared/config";
import { useToast } from "@/shared/lib";
import { commentKeys } from "@/entities/comment";
import { pollKeys } from "@/entities/poll";
import { postKeys } from "@/entities/post";
import { toStoragePath } from "../lib/post-images";

/**
 * ⚠ **어드민이 글을 건드리면 세 캐시가 함께 흔들린다.** 본문·투표가 바뀌면 상세와 목록이
 *   갈리고(`postKeys`), 삭제·복구는 그 글의 댓글 가시성까지 바꾼다(`commentKeys`).
 *   투표 문구는 `pollKeys`가 따로 갖는다 — `entities/poll`이 별도 슬라이스이기 때문이다.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: postKeys.all }),
    queryClient.invalidateQueries({ queryKey: commentKeys.all }),
    queryClient.invalidateQueries({ queryKey: pollKeys.all }),
  ]);
}

/**
 * 본문 이미지 제거.
 *
 * ⚠ **새 본문을 보내지 않는다.** 인자가 "어떤 URL을 뺄지"뿐인 것이 "어드민은 남의 글을
 *   고쳐 쓰지 않는다"의 구조적 보증이다 — 본문을 계산해 보내면 그게 곧 자유 편집이다.
 * ⚠ RPC가 **지운 URL을 돌려준다** → 그것으로 Storage 파일까지 지운다. 본문에서만 빼면
 *   공개 버킷이라 URL을 아는 사람에게는 그대로 보여 걷어낸 의미가 없다.
 */
export function useStripPostImages(postId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (urls: string[] | null) => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase.rpc("admin_strip_post_images", {
        p_post_id: postId,
        ...(urls === null ? {} : { p_urls: urls }),
      });
      if (error) {
        console.error("[admin-post] 본문 이미지 제거 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }

      const paths = (data ?? [])
        .map(toStoragePath)
        .filter((path): path is string => path !== null);
      if (paths.length > 0) {
        const { error: removeError } = await supabase.storage.from(POST_IMAGE_BUCKET).remove(paths);
        // best-effort — 본문에서는 이미 빠졌고, 사용자가 할 수 있는 일이 없다
        if (removeError) console.error("[admin-post] 이미지 파일 정리 실패:", removeError);
      }
      return data ?? [];
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

export function useMaskPost(postId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (reason: string) => {
      const supabase = requireBrowserSupabase();
      const trimmed = reason.trim();
      const { error } = await supabase.rpc("admin_mask_post", {
        p_post_id: postId,
        ...(trimmed === "" ? {} : { p_reason: trimmed }),
      });
      if (error) {
        console.error("[admin-post] 본문 가리기 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

/** 원본은 `post_moderation`이 갖고 있다 — 가리기가 파괴적이지 않은 이유다 */
export function useUnmaskPost(postId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_unmask_post", { p_post_id: postId });
      if (error) {
        console.error("[admin-post] 본문 되돌리기 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

/**
 * ⚠ **무효화 Promise를 반환하지 않는다.** 성공하면 호출부가 곧바로 목록으로 떠나므로
 *   리페치를 기다릴 이유가 없다 — 반환하면 세 캐시가 다 돌 때까지 이동이 늦어진다
 *   (`data-and-state.md`의 표: "성공 직후 화면을 떠남 → 무효화하되 반환 안 함").
 */
export function useAdminDeletePost() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (postId: number) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_soft_delete_post", { p_id: postId });
      if (error) {
        console.error("[admin-post] 글 삭제 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => {
      invalidate(queryClient);
    },
    onError: (error) => toast(error.message),
  });
}

export function useAdminRestorePost() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (postId: number) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_restore_post", { p_id: postId });
      if (error) {
        console.error("[admin-post] 글 복구 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

/**
 * 딸린 투표의 **문구만** 수정.
 *
 * ⚠ 선택지 id 집합을 그대로 보낸다 — RPC가 기존 집합과 정확히 일치하는지 확인해
 *   **개수 변경을 거부한다**(이미 던져진 표가 id에 붙어 있어 집계가 어긋나면 안 된다).
 * ⚠ jsonb 직렬화를 이 함수가 소유한다(키 오타를 컴파일러가 못 잡는 자리다).
 */
export function useEditPostPoll(postId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (vars: { question: string; options: { id: number; label: string }[] }) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_edit_post_poll", {
        p_post_id: postId,
        p_question: vars.question,
        p_options: vars.options.map((o) => ({ id: o.id, label: o.label })) as Json,
      });
      if (error) {
        console.error("[admin-post] 투표 문구 수정 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

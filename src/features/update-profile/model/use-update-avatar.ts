"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { AVATAR_BUCKET } from "@/shared/config";
import { commentKeys } from "@/entities/comment";
import { postKeys } from "@/entities/post";
import { profileKeys } from "@/entities/profile";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_SOURCE_BYTES,
  MAX_UPLOAD_BYTES,
  resizeToAvatar,
} from "../lib/resize-image";

/**
 * 아바타 교체 — **1계정 : 1프로필사진**을 지킨다.
 *
 * 순서: 내 폴더 비우기 → 업로드 → `profiles.avatar_path` 갱신.
 *
 * ⚠ **먼저 지운다.** 반대 순서(업로드 → DB → 옛 파일 삭제)로 두면 마지막 삭제가 실패할 때마다
 *   고아 파일이 쌓이고, 그걸 되돌릴 방법이 없다. 지우고 시작하면 실패해도 남는 게 없다.
 *   대가는 "지웠는데 업로드가 실패하면 사진이 사라진다"인데, 그때는 **DB도 함께 비워**
 *   "DB엔 경로가 있는데 파일이 없는" 불일치를 남기지 않고 사실대로 안내한다.
 *
 * ⚠ **지울 대상을 캐시에서 받지 않는다.** 화면이 들고 있는 `avatarPath`는 리페치가 실패하면
 *   옛 경로에 머문다 — 그 값으로 지우면 이미 없는 파일을 지우고 진짜 파일이 고아로 남는다.
 *   매번 `list()`로 실제 폴더를 훑어 전부 지운다. 캐시 상태와 무관하게 1:1이 보장된다.
 *
 * ⚠ 파일명은 업로드마다 새로 만든다(uuid). 같은 이름을 덮어쓰면 공개 URL이 그대로라
 *   브라우저·CDN 캐시 때문에 옛 사진이 계속 보인다.
 * ⚠ 경로는 `{userId}/{uuid}.webp` **두 세그먼트**여야 한다 — Storage 정책과 profiles의
 *   `profiles_avatar_path_own` CHECK가 둘 다 그 형태를 요구한다(2중 방어).
 */
export function useUpdateAvatar(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const supabase = requireBrowserSupabase();
      if (!userId) throw new Error("로그인이 필요해요.");

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        throw new Error("JPG·PNG·WebP 이미지만 올릴 수 있어요.");
      }
      if (file.size > MAX_SOURCE_BYTES) {
        // 리사이즈 전 원본이 지나치게 크면 브라우저 메모리를 먼저 지킨다
        throw new Error("이미지가 너무 커요. 20MB 이하로 올려 주세요.");
      }

      // 변환과 크기 검사를 먼저 끝낸다 — 여기서 실패하면 기존 사진을 건드리지 않은 채 끝난다
      const blob = await resizeToAvatar(file);
      if (blob.size > MAX_UPLOAD_BYTES) {
        throw new Error("이미지를 충분히 줄이지 못했어요. 다른 사진을 골라 주세요.");
      }

      // 1) 내 폴더를 비운다 (1:1 원칙)
      const { data: existing, error: listError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(userId);
      if (listError) {
        console.error("[profile] 기존 아바타 조회 실패:", listError);
        throw new Error("기존 사진을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      if (existing.length > 0) {
        const { error: removeError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove(existing.map((item) => `${userId}/${item.name}`));
        if (removeError) {
          console.error("[profile] 기존 아바타 삭제 실패:", removeError);
          throw new Error("기존 사진을 지우지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
      }

      // ⚠ 여기부터 실패하면 사진이 없는 상태다 — DB도 그렇게 맞춘다
      const path = `${userId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { contentType: "image/webp" });

      if (uploadError) {
        console.error("[profile] 아바타 업로드 실패:", uploadError);
        await clearAvatarPath(supabase, userId);
        throw new Error(uploadRejectionMessage(uploadError));
      }

      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", userId)
        .select("avatar_path");

      // RLS 위반은 에러가 아니라 0행이다 — 방금 올린 파일까지 되돌린다
      if (error || data.length === 0) {
        await supabase.storage.from(AVATAR_BUCKET).remove([path]);
        await clearAvatarPath(supabase, userId);
        if (error) {
          console.error("[profile] 아바타 경로 저장 실패:", error);
          throw new Error(toDbErrorMessage(error));
        }
        throw new Error("변경 권한이 없어요.");
      }

      return path;
    },
    /**
     * 아바타는 상세·댓글의 작성자 표기로도 나가므로 그쪽 캐시도 함께 무효화한다
     * (POST_DETAIL_SELECT·COMMENT_SELECT의 author 임베딩에 avatar_path가 있다).
     * 낙관적 업데이트가 없으므로 Promise를 반환해 리페치까지 isPending을 유지한다.
     *
     * ⚠ **`onSuccess`가 아니라 `onSettled`다.** 이 훅은 업로드 전에 폴더를 비우므로
     *   실패해도 **서버 상태가 이미 바뀌어 있다**(파일 삭제 + `avatar_path` null 정리).
     *   실패 경로에서 무효화를 안 하면 "기존 사진은 지워졌으니 다시 올려 주세요"라는 문구
     *   바로 위에 **방금 지운 사진이 그대로** 떠 있다(staleTime 5분이라 목록·댓글까지).
     */
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.all }),
        queryClient.invalidateQueries({ queryKey: postKeys.all }),
        queryClient.invalidateQueries({ queryKey: commentKeys.all }),
      ]),
  });
}

/** 파일이 없어진 상태를 DB에 반영한다 — 여기서 또 실패해도 원래 에러를 덮지 않는다 */
async function clearAvatarPath(
  supabase: ReturnType<typeof requireBrowserSupabase>,
  userId: string,
) {
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", userId);
  if (error) console.error("[profile] avatar_path 정리 실패:", error);
}

/**
 * 버킷이 거부한 경우와 일시 장애를 구분한다.
 *
 * ⚠ `file_size_limit`·`allowed_mime_types` 거부는 **재시도로 절대 풀리지 않는다**
 *   (api-and-db.md — 버킷 설정이 실제 방어선이다). "잠시 후 다시 시도"로 뭉뚱그리면
 *   사용자는 같은 파일로 계속 시도한다.
 */
function uploadRejectionMessage(error: unknown): string {
  const status = (error as { statusCode?: string | number; status?: number }) ?? {};
  const code = Number(status.statusCode ?? status.status);
  if (code === 413) return "사진 용량이 커서 올리지 못했어요. 다른 사진을 골라 주세요.";
  if (code === 415) return "지원하지 않는 이미지 형식이에요. JPG·PNG·WebP로 올려 주세요.";
  return "사진을 올리지 못했어요. 기존 사진은 지워졌으니 다시 올려 주세요.";
}

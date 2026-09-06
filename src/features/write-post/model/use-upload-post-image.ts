"use client";

import { useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { POST_IMAGE_BUCKET, postImageUrl } from "@/shared/config";
import { resizeToWebp, useToast } from "@/shared/lib";
import { animatedGifToWebp } from "../lib/gif-to-webp";
import { ACCEPTED_IMAGE_TYPES, MAX_SOURCE_BYTES } from "../lib/resize-post-image";

/**
 * 본문 이미지 업로드 — 성공하면 공개 URL을 돌려준다.
 *
 * ⚠ 아바타(`useUpdateAvatar`)와 **순서가 다르다.** 저쪽은 1계정:1사진이라 올리기 전에
 *   폴더를 비우지만, 본문 이미지는 1글:N장이라 지울 대상이 없다. 덕분에 실패해도
 *   서버 상태가 바뀌지 않아 롤백 절차 자체가 필요 없다.
 *
 * ⚠ **고아 파일이 생길 수 있다.** 올린 뒤 본문에서 마크다운만 지우고 등록하면 파일이 남는다.
 *   "제출할 때 한꺼번에 올리기"는 본문에 임시 토큰을 심어야 하는데 그 토큰을 사용자가 편집할
 *   수 있어(미리보기가 없어 더 위험하다) 더 나쁘다. 화면을 떠날 때만 `discardUploads`로
 *   그 세션 업로드분을 정리하고, 나머지는 수용한다.
 */
export function useUploadPostImage(userId: string | undefined) {
  const toast = useToast();
  /** 이 화면에서 올린 경로들 — 작성을 취소하고 나갈 때 되돌리기 위해 기억한다 */
  const uploaded = useRef<string[]>([]);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const supabase = requireBrowserSupabase();
      if (!userId) throw new Error("로그인이 필요해요.");

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        throw new Error("JPG·PNG·WebP·GIF 이미지만 올릴 수 있어요.");
      }
      if (file.size > MAX_SOURCE_BYTES) {
        throw new Error("이미지가 너무 커요. 20MB 이하로 올려 주세요.");
      }

      // 결과는 항상 webp이고 IMAGE_TARGET_BYTES 이하다 — 못 맞추면 변환기가 한국어로 던진다
      const blob = await toWebp(file);

      // ⚠ 경로는 `{userId}/{uuid}.webp` 두 세그먼트 — Storage 정책이 첫 폴더로 소유자를 판정한다.
      //   파일명을 매번 새로 만드는 이유는 아바타와 같다(같은 이름은 CDN 캐시에 갇힌다).
      const path = `${userId}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage
        .from(POST_IMAGE_BUCKET)
        .upload(path, blob, { contentType: "image/webp" });

      if (error) {
        console.error("[post] 본문 이미지 업로드 실패:", error);
        throw new Error(uploadRejectionMessage(error));
      }

      uploaded.current.push(path);
      return postImageUrl(path);
    },
    // 실패를 앱의 유일한 알림 채널로 — 화면 문구는 조건부 평문이라 낭독되지 않는다
    onError: (error) => toast(error.message),
  });

  /**
   * 작성을 그만두고 나갈 때 이 세션 업로드분을 지운다.
   * ⚠ best-effort다 — 실패해도 사용자에게 알리지 않는다. 이미 화면을 떠나는 중이고,
   *   "사진 정리에 실패했다"는 문구는 사용자가 할 수 있는 일이 없다.
   */
  const discardUploads = useCallback(() => {
    const paths = uploaded.current;
    if (paths.length === 0) return;
    uploaded.current = [];
    const supabase = requireBrowserSupabase();
    supabase.storage
      .from(POST_IMAGE_BUCKET)
      .remove(paths)
      .then(({ error }) => {
        if (error) console.error("[post] 미사용 이미지 정리 실패:", error);
      });
  }, []);

  /**
   * ⚠ **뮤테이션 객체를 통째로 내보내지 않는다.** 호출부가 필요한 것만 좁혀 준다 —
   *   `views/profile`의 `useAvatarUpload`가 같은 형태이고, 나중에 중복 실행 가드를 붙일 때
   *   맨 `mutate`가 함께 새어 나가 방어가 우회되는 일이 없다("훅이 감춘 것은 다시 새어
   *   나오면 안 된다", code-quality.md).
   */
  return {
    upload: (file: File, onUploaded: (url: string) => void) =>
      mutation.mutate(file, { onSuccess: onUploaded }),
    isPending: mutation.isPending,
    error: mutation.error,
    discardUploads,
  };
}

/**
 * 어떤 형식으로 들어와도 **webp 한 장**으로 만든다.
 *
 * ⚠ 움직이는 GIF만 경로가 다르다 — `createImageBitmap`이 첫 프레임밖에 주지 않아
 *   그대로 통과시키면 **움직임이 조용히 사라진다.** 프레임을 낱장으로 꺼낼 수 없는
 *   브라우저(Safari·Firefox)에서는 사실대로 알리고 멈춘다.
 */
async function toWebp(file: File): Promise<Blob> {
  if (!(await looksLikeGif(file))) return resizeToWebp(file);
  // 정지 GIF면 null — 일반 경로가 더 작고 단순하다
  return (await animatedGifToWebp(file)) ?? resizeToWebp(file);
}

/**
 * **파일 내용**으로 GIF를 판정한다.
 *
 * ⚠ `file.type`을 믿으면 안 된다 — 브라우저가 **파일 이름으로** 붙이는 값이라,
 *   GIF의 확장자만 `.png`로 바꾸면 정지 경로로 새서 **움직임이 조용히 사라진다**(실측).
 *   반대로 PNG를 `.gif`로 바꾼 경우도 여기서 정직하게 갈린다.
 */
async function looksLikeGif(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 6).arrayBuffer());
  const magic = String.fromCharCode(...head);
  return magic === "GIF87a" || magic === "GIF89a";
}

/**
 * 버킷이 거부한 경우와 일시 장애를 구분한다.
 *
 * ⚠ `use-update-avatar.ts`에도 같은 이름의 함수가 있지만 **문구가 다르다** — 저쪽은
 *   "기존 사진은 지워졌으니"라고 말하는데 여기서는 지운 것이 없어 거짓말이 된다.
 *   같은 형태가 아니므로 합치지 않는다.
 */
function uploadRejectionMessage(error: unknown): string {
  const status = (error as { statusCode?: string | number; status?: number }) ?? {};
  const code = Number(status.statusCode ?? status.status);
  if (code === 413) return "사진 용량이 커서 올리지 못했어요. 다른 사진을 골라 주세요.";
  if (code === 415) return "지원하지 않는 이미지 형식이에요. JPG·PNG·WebP로 올려 주세요.";
  return "사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.";
}

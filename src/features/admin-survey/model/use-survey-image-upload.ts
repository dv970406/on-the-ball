"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { SURVEY_IMAGE_BUCKET } from "@/shared/config";
import { resizeToWebp, useToast } from "@/shared/lib";

/** 버킷의 `allowed_mime_types`와 같다 — 본문 이미지와 달리 GIF 변환 경로가 없다 */
const ACCEPTED = ["image/webp", "image/jpeg", "image/png"];
const MAX_SOURCE_BYTES = 20 * 1000 * 1000;

/**
 * 입축구 면 배경 업로드.
 *
 * ⚠ **경로가 `{survey_id}/{파일}`이라 문항을 먼저 만든 뒤에만 올릴 수 있다**
 *   (`survey_option.image_path`의 CHECK가 그 형태를 강제한다) — 등록 화면은 이미지 칸을
 *   잠그고, 저장한 뒤 수정 화면에서 올린다.
 * ⚠ 아바타와 달리 **미리 지울 대상이 없다**(1문항:N장) → 롤백 절차가 필요 없다.
 *   대신 교체하면 옛 파일이 남으므로 성공 직후 지운다(best-effort).
 * ⚠ 리사이즈는 승격된 `resizeToWebp`를 쓴다 — 비율 유지 + 용량 사다리라 본문 이미지와
 *   성격이 같다(아바타의 정사각 crop과는 다르다).
 * ⚠ **뮤테이션 객체를 통째로 내보내지 않는다** — 호출부가 필요한 것만 좁혀 준다
 *   (`useUploadPostImage`·`useAvatarUpload`와 같은 형태).
 */
export function useSurveyImageUpload(surveyId: number) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  /** 어느 칸을 바꾸는 중인가 — 파일 대화상자는 비동기라 열기 직전에 담아 둔다 */
  const target = useRef<{ previousPath: string | null; onUploaded: (path: string) => void } | null>(
    null,
  );
  const [error, setError] = useState<Error | null>(null);

  const mutation = useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const supabase = requireBrowserSupabase();

      if (!ACCEPTED.includes(file.type)) {
        throw new Error("JPG·PNG·WebP 이미지만 올릴 수 있어요.");
      }
      if (file.size > MAX_SOURCE_BYTES) {
        throw new Error("이미지가 너무 커요. 20MB 이하로 올려 주세요.");
      }

      const blob = await resizeToWebp(file);
      const path = `${surveyId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from(SURVEY_IMAGE_BUCKET)
        .upload(path, blob, { contentType: "image/webp" });

      if (uploadError) {
        console.error("[admin-survey] 배경 업로드 실패:", uploadError);
        throw new Error("이미지를 올리지 못했어요. 잠시 후 다시 시도해 주세요.");
      }

      const previousPath = target.current?.previousPath ?? null;
      if (previousPath) {
        const { error: removeError } = await supabase.storage
          .from(SURVEY_IMAGE_BUCKET)
          .remove([previousPath]);
        // 실패해도 알리지 않는다 — 새 경로는 이미 유효하고 사용자가 할 수 있는 일이 없다
        if (removeError) console.error("[admin-survey] 옛 배경 정리 실패:", removeError);
      }

      return path;
    },
    onSuccess: (path) => target.current?.onUploaded(path),
    onError: (e) => {
      setError(e);
      toast(e.message);
    },
  });

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // ⚠ early return보다 **먼저** 비운다 — 같은 파일을 다시 고르면 change가 오지 않는다
      e.target.value = "";
      if (!file) return;
      setError(null);
      mutation.mutate(file);
    },
    [mutation],
  );

  return {
    inputProps: { ref: inputRef, type: "file" as const, accept: ACCEPTED.join(","), onChange },
    /** 파일 대화상자를 연다 — 어느 칸인지와 옛 경로를 함께 넘긴다 */
    openFor: (previousPath: string | null, onUploaded: (path: string) => void) => {
      target.current = { previousPath, onUploaded };
      inputRef.current?.click();
    },
    isPending: mutation.isPending,
    error,
  };
}

/**
 * 저장에서 **버려진 배경 파일**을 지운다.
 *
 * ⚠ **"빼기"를 누른 순간 지우지 않는다.** 그 시점의 DB에는 아직 옛 경로가 남아 있어,
 *   저장하지 않고 화면을 떠나면 **경로는 있는데 파일이 없는** 상태가 된다(면이 통째로
 *   투명해진다). 지우는 것은 DB가 그 경로를 실제로 버린 뒤여야 안전하다.
 * ⚠ best-effort다 — 실패해도 알리지 않는다. 사용자가 할 수 있는 일이 없고, 남은 파일은
 *   아무 데서도 참조되지 않는다(본문 이미지의 고아 처리와 같은 층위).
 */
export function useSurveyImageCleanup() {
  return useCallback(async (paths: readonly string[]) => {
    if (paths.length === 0) return;
    try {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.storage.from(SURVEY_IMAGE_BUCKET).remove([...paths]);
      if (error) console.error("[admin-survey] 버려진 배경 정리 실패:", error);
    } catch (e) {
      console.error("[admin-survey] 버려진 배경 정리 실패:", e);
    }
  }, []);
}

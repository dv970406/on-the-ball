"use client";

import { useRef, type ChangeEvent } from "react";
import { useToast } from "@/shared/lib";
import { ACCEPTED_IMAGE_TYPES, useUpdateAvatar } from "@/features/update-profile";

/**
 * 프로필 사진 교체 — 숨은 `<input type="file">`을 카메라 버튼이 대신 연다.
 *
 * MIME·용량 검사와 리사이즈·Storage 정리는 전부 `useUpdateAvatar`가 소유한다.
 * 여기 있는 것은 **파일 입력이라는 DOM 메커니즘**뿐이다.
 *
 * ⚠ **동기 가드를 두지 않는다.** 파일 선택 대화상자가 모달이라 같은 tick에 두 번 들어올 수 없다.
 */
export function useAvatarUpload(userId: string | undefined) {
  const toast = useToast();
  const updateAvatar = useUpdateAvatar(userId);
  const inputRef = useRef<HTMLInputElement>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // ⚠ 같은 파일을 다시 골라도 change가 나도록 값을 비운다.
    //   **early return보다 위여야 한다** — 아래로 내려가면 재선택이 먹지 않는다.
    e.target.value = "";
    if (!file || updateAvatar.isPending) return;

    updateAvatar.mutate(file, { onSuccess: () => toast("프로필 사진을 바꿨어요") });
  };

  return {
    /** 숨은 file input에 그대로 펼친다 */
    inputProps: {
      ref: inputRef,
      accept: ACCEPTED_IMAGE_TYPES.join(","),
      onChange,
    },
    /** 카메라 버튼의 onClick */
    open: () => inputRef.current?.click(),
    isPending: updateAvatar.isPending,
    error: updateAvatar.error,
  };
}

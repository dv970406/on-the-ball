"use client";

import { useRef, type ChangeEvent } from "react";
import { useSessionStore } from "@/entities/session";
import { ACCEPTED_IMAGE_TYPES } from "../lib/resize-post-image";
import { useUploadPostImage } from "./use-upload-post-image";

/**
 * 본문 사진 첨부 — 숨은 `<input type="file">`을 툴바 버튼이 대신 연다.
 *
 * 검증·리사이즈·Storage는 전부 `useUploadPostImage`가 소유한다. 여기 있는 것은
 * **파일 입력이라는 DOM 메커니즘**뿐이다.
 *
 * ⚠ 그런데도 `ui/`가 아니라 **`model/`** 이다 — 세션을 읽고 뮤테이션을 조립하므로
 *   "도메인을 모르는 순수 메커니즘"이 아니다("그 훅이 무엇을 위한 것인지가 자리를 정한다",
 *   code-quality.md). 선례인 `views/profile`의 `useAvatarUpload`도 `model/`에 있다.
 *   같은 슬라이스의 `use-cursor-insert`는 반대로 도메인을 몰라 `ui/`가 맞다.
 *
 * ⚠ **동기 중복 가드를 두지 않는다.** 파일 선택 대화상자가 모달이라 같은 tick에 두 번
 *   들어올 수 없다 — `isPending` 확인으로 족하다(아바타 업로드와 같은 판단).
 * ⚠ `multiple`을 두지 않는다. 여러 장을 한 번에 받으면 부분 실패와 삽입 순서를 따로
 *   다뤄야 하는데, 버튼을 다시 누르는 비용이 그보다 싸다.
 */
export function useImagePicker(onUploaded: (url: string) => void) {
  const userId = useSessionStore((s) => s.user?.id);
  const { upload, isPending, error, discardUploads } = useUploadPostImage(userId);
  const inputRef = useRef<HTMLInputElement>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // ⚠ 같은 파일을 다시 골라도 change가 나도록 값을 비운다.
    //   **early return보다 위여야 한다** — 아래로 내려가면 재선택이 먹지 않는다.
    e.target.value = "";
    if (!file || isPending) return;

    upload(file, onUploaded);
  };

  return {
    /** 숨은 file input에 그대로 펼친다 */
    inputProps: {
      ref: inputRef,
      accept: ACCEPTED_IMAGE_TYPES.join(","),
      onChange,
    },
    /** 툴바 사진 버튼의 onClick */
    open: () => inputRef.current?.click(),
    isPending,
    /**
     * ⚠ 토스트만으로는 부족하다 — 1.8초 뒤 사라지므로 놓치면 사진이 왜 안 들어갔는지
     *   알 방법이 없다. 화면에도 지속 표시를 남긴다(`useAvatarUpload`가 같은 형태다).
     */
    error,
    discardUploads,
  };
}

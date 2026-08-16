"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useToast } from "@/shared/lib";
import { useUpdateNickname, validateNickname } from "@/features/update-profile";

/**
 * 닉네임 편집 폼 — 서버 값과의 동기화, 검증, 제출 경합 처리.
 *
 * ⚠ **동기 가드를 두지 않는다.** 닉네임 UPDATE는 멱등이라 연타해도 행이 늘지 않는다
 *   (`data-and-state.md`의 기준: "되돌릴 수 없는 결과가 남는가"). `isPending` 확인으로 족하다.
 */
export function useNicknameForm(
  userId: string | undefined,
  serverNickname: string | undefined,
) {
  const toast = useToast();
  const updateNickname = useUpdateNickname(userId);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  /**
   * 조회 결과를 입력창에 반영한다.
   *
   * ⚠ **사용자가 편집 중일 때만 덮지 않는다.** 전에는 "최초 1회만 동기화"였는데, 그러면
   *   다른 탭에서 닉네임을 바꿨을 때 이 탭의 입력창은 옛 값인 채 **저장 버튼만 저절로
   *   활성화**되고(활성 조건이 `value !== 서버값`이다), 그걸 누르면 방금 한 변경이
   *   조용히 되돌아갔다.
   * ⚠ userId를 함께 기억한다 — 계정이 바뀌면 이전 사용자의 닉네임이 남으면 안 된다.
   * ⚠ deps의 `value`는 **의도적이다.** "편집 중인가"를 이 effect가 판정하므로 빼면
   *   위의 조용한 덮어쓰기가 부활한다.
   */
  const syncedRef = useRef<{ userId: string; serverValue: string } | null>(null);
  useEffect(() => {
    if (!userId || serverNickname === undefined) return;

    const synced = syncedRef.current;
    const isSameUser = synced?.userId === userId;
    // 사용자가 마지막 동기화 값에서 손을 댔다면 그 편집을 지킨다
    const isEditing = isSameUser && value !== synced.serverValue;
    if (isSameUser && synced.serverValue === serverNickname) return;
    if (isEditing) {
      // 서버 값만 갱신해 둔다 — 다음 비교의 기준이 된다
      syncedRef.current = { userId, serverValue: serverNickname };
      return;
    }
    syncedRef.current = { userId, serverValue: serverNickname };
    setValue(serverNickname);
  }, [serverNickname, userId, value]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(undefined);
    // ⚠ 뮤테이션 에러는 다음 mutate까지 남는다 — "이미 사용 중인 값이에요."가
    //   전혀 다른 닉네임을 입력하는 동안 계속 빨갛게 떠 있었다.
    if (updateNickname.error) updateNickname.reset();
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (updateNickname.isPending) return;

    const message = validateNickname(value);
    if (message) {
      setError(message);
      return;
    }
    setError(undefined);

    /**
     * ⚠ 호출부 `onSuccess`는 훅의 무효화 Promise가 **끝난 뒤에야** 실행된다(data-and-state.md).
     *   그 사이 사용자가 이어서 입력했을 수 있으므로, 제출 시점 값과 달라졌으면 덮지 않는다.
     *   선례: `use-comment-composer`가 같은 방식으로 입력 손실을 막는다.
     * ⚠ 판정을 클로저 값으로 하지 말 것 — 함수형 업데이트로 **현재 값**과 비교해야 맞는다.
     */
    const submitted = value;
    updateNickname.mutate(value, {
      onSuccess: (saved) => {
        // 서버(정규화 트리거)가 확정한 값으로 맞추되, 사용자가 그새 고쳤으면 그대로 둔다
        setValue((current) => (current === submitted ? saved : current));
        toast("닉네임을 바꿨어요");
      },
    });
  };

  return {
    value,
    /** 로컬 검증 문구 ?? 서버 에러 문구 */
    error: error ?? updateNickname.error?.message,
    isPending: updateNickname.isPending,
    /** 저장 버튼 활성 조건 — 서버 값과 달라졌고 저장 중이 아닐 때 */
    canSave: !updateNickname.isPending && value !== serverNickname,
    onChange,
    onSubmit,
  };
}

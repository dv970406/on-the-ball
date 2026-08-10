"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { codePointLength, hasVisibleChar, normalizeNickname } from "@/shared/lib";
import { commentKeys } from "@/entities/comment";
import { postKeys } from "@/entities/post";
import { profileKeys } from "@/entities/profile";

/** DB의 `profiles_nickname_check`(1~20)와 맞춘다 — 어긋나면 클라가 통과시키고 서버가 거부한다 */
export const NICKNAME_MAX = 20;

/**
 * 닉네임 검증 — **DB와 같은 기준**을 쓴다.
 * 길이는 코드포인트로(`char_length`와 같은 단위), 빈 값은 보이는 글자 유무로 판정한다.
 * 정규화(제로폭 제거·공백 접기)는 DB 트리거가 하므로 여기서 흉내내지 않는다.
 */
export function validateNickname(value: string): string | null {
  if (!hasVisibleChar(value)) return "닉네임을 입력해 주세요.";
  // ⚠ **정규형으로 센다.** `.trim()`은 ZWJ·제로폭을 못 지워서, DB가 4자로 보는
  //   가족 이모지(👨‍👩‍👧‍👦)를 7자로 세고 3개만 붙여도 거부했다(서버는 받아들이는 값이다).
  if (codePointLength(normalizeNickname(value)) > NICKNAME_MAX) {
    return `닉네임은 ${NICKNAME_MAX}자까지 쓸 수 있어요.`;
  }
  return null;
}

/**
 * 닉네임 변경.
 *
 * ⚠ RLS 위반은 에러가 아니라 **0행**으로 지나간다(UPDATE의 USING은 필터로 동작).
 *   `.select()`로 영향 행 수를 확인하지 않으면 "바꿨다"고 거짓말하게 된다.
 * ⚠ 중복은 `profiles_nickname_lower_key`(대소문자 무시) 위반 → 23505.
 *   toDbErrorMessage가 "이미 사용 중인 값이에요."로 옮긴다.
 */
export function useUpdateNickname(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nickname: string) => {
      const supabase = requireBrowserSupabase();
      if (!userId) throw new Error("로그인이 필요해요.");

      const { data, error } = await supabase
        .from("profiles")
        .update({ nickname })
        .eq("id", userId)
        .select("nickname");

      if (error) {
        console.error("[profile] 닉네임 변경 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      if (data.length === 0) throw new Error("변경 권한이 없어요.");
      // 트리거가 정규화한 값이 진실이다 — 사용자가 입력한 문자열이 아니다
      return data[0].nickname;
    },
    /**
     * 무효화 Promise를 **반환한다** — 낙관적 업데이트가 없으므로, 리페치가 끝날 때까지
     * isPending을 유지해 저장 직후 재클릭으로 중복 요청이 나가는 것을 막는다
     * (data-and-state.md의 표 참고).
     *
     * 닉네임은 글·댓글의 작성자 표기로도 나가므로 그쪽 캐시도 함께 무효화한다.
     */
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.all }),
        queryClient.invalidateQueries({ queryKey: postKeys.all }),
        queryClient.invalidateQueries({ queryKey: commentKeys.all }),
      ]),
  });
}

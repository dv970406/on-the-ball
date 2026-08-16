"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import {
  hasVisibleChar,
  lengthOverflow,
  normalizeNickname,
  useToast,
  type TextLimit,
} from "@/shared/lib";
import { commentKeys } from "@/entities/comment";
import { postKeys } from "@/entities/post";
import { profileKeys } from "@/entities/profile";

/**
 * 닉네임 한도 — 화면 20그래핌 / DB 200코드포인트(`profiles_nickname_check`와 같은 값).
 *
 * ⚠ 코드포인트 쪽은 CHECK 말고 **인덱스도** 지킨다. `profiles_nickname_lower_key`가
 *   `lower(nickname)` btree 유니크 인덱스인데, btree 인덱스 행은 8KB 페이지 기준
 *   최대 2704바이트다. 그래핌 한도는 바이트 상한을 함의하지 못하므로 이 검사를 빼면
 *   어긋남이 CHECK가 아니라 **인덱스로 자리를 옮긴다** — 그것도 toDbErrorMessage가
 *   모르는 영어 에러로. 200코드포인트 × 최대 4바이트 = 800바이트 < 2704라 안전하다.
 */
export const NICKNAME_LIMIT: TextLimit = { grapheme: 20, codePoint: 200 };

/**
 * 닉네임 검증 — 통과하면 `null`, 아니면 사용자에게 보일 한국어 문구.
 * 빈 값은 보이는 글자 유무로 판정한다(DB `has_visible_char`와 같은 문자 집합).
 * 정규화(제로폭 제거·공백 접기)는 DB 트리거가 하지만, **길이는 정규형으로 재야** 판정이 맞는다.
 */
export function validateNickname(value: string): string | null {
  if (!hasVisibleChar(value)) return "닉네임을 입력해 주세요.";

  // ⚠ **정규형으로 센다.** `.trim()`은 ZWJ·제로폭을 못 지워서, DB가 4자로 보는
  //   가족 이모지(👨‍👩‍👧‍👦)를 7자로 세고 3개만 붙여도 거부했다(서버는 받아들이는 값이다).
  // ⚠ 그래서 **닉네임에서는 그래핌으로 세도 가족 이모지가 1이 되지 않는다** —
  //   normalize_nickname이 ZWJ를 지워 👨👩👧👦 4개로 분해하므로 저장된 값이 실제로 4글자다.
  //   원본으로 세면 화면(1)과 저장값(4)이 또 갈린다. 정규형 기준을 되돌리지 말 것.
  const canonical = normalizeNickname(value);

  const over = lengthOverflow(canonical, NICKNAME_LIMIT);
  if (over === "grapheme") return `닉네임은 ${NICKNAME_LIMIT.grapheme}자까지 쓸 수 있어요.`;
  // 코드포인트 초과는 결합 문자를 쌓지 않는 한 도달할 수 없다 → 길이로만 말한다.
  if (over === "codePoint") return "닉네임이 너무 길어요.";
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
  const toast = useToast();

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
    // 실패를 앱의 유일한 알림 채널로 — 필드 아래 문구는 조건부 평문이라 낭독되지 않는다
    onError: (error) => toast(error.message),
  });
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import {
  hasVisibleChar,
  isPlainNickname,
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
 *   모르는 영어 에러로. 200코드포인트 × 최대 3바이트 = 600바이트 < 2704라 안전하다
 *   (`isPlainNickname`이 4바이트 문자를 거부해서 최악이 한글 3바이트다 —
 *   **허용 문자를 넓히면 이 곱셈도 함께 고친다**).
 */
export const NICKNAME_LIMIT: TextLimit = { grapheme: 20, codePoint: 200 };

/**
 * 닉네임 검증 — 통과하면 `null`, 아니면 사용자에게 보일 한국어 문구.
 *
 * 세 가지를 본다: 보이는 글자 유무(DB `has_visible_char`) · 허용 문자
 * (DB `is_plain_nickname`) · 길이 두 단위(DB `profiles_nickname_check`).
 * **셋 다 DB에 짝이 있고, 이 함수가 먼저 막는 이유는 문구 때문이다** —
 * DB까지 가면 23514가 `toDbErrorMessage`에서 "입력값이 허용 범위를 벗어났어요."로
 * 접혀 어느 규칙을 어겼는지 말하지 못한다.
 */
export function validateNickname(value: string): string | null {
  if (!hasVisibleChar(value)) return "닉네임을 입력해 주세요.";

  // ⚠ **저장될 값(정규형)으로 판정한다.** DB 트리거(profiles_normalize_nickname)가
  //   쓰기 직전에 정규화하므로, 원본으로 재면 화면 판정과 저장값이 갈린다 —
  //   꼬리 공백·제로폭이 섞인 입력은 정규형에서 사라지고(그래서 길이가 줄고),
  //   NFD 한글은 NFC로 접힌 뒤에야 아래 문자 검사의 `가-힣` 범위에 들어온다.
  const canonical = normalizeNickname(value);

  // ⚠ **문자 검사를 길이보다 먼저 한다.** 공백을 금지했으므로 "손 흥민" 같은 입력이
  //   흔할 텐데, 그때 "20자까지 쓸 수 있어요"가 나가면 무엇이 문제인지 말해주지 못한다.
  //   (그래핌→코드포인트 순서 규약은 그 아래에서 그대로 지켜진다)
  // ⚠ 판정은 `isPlainNickname`이 단독으로 갖는다 — 정규식을 여기 다시 적지 말 것.
  //   DB의 `is_plain_nickname`과 한 쌍이라 갈리면 클라가 통과시킨 값이 23514가 된다.
  //
  // 공백만 문구를 따로 둔다. 닉네임에 띄어쓰기를 넣는 것은 가장 흔한 시도인데
  // "한글·영문·숫자만"이라는 문구는 공백을 **금지한다고 말하지 않아서**, 사용자가
  // 같은 입력을 다시 넣어볼 여지가 남는다.
  // ⚠ `includes(" ")`로 족한 이유는 정규형이 보증한다 — NBSP·전각공백은 이미 U+0020으로
  //   접혔고 앞뒤 공백과 연속 공백은 사라졌다. 원본으로 보면 그 보증이 없다.
  if (canonical.includes(" ")) return "닉네임에는 공백을 쓸 수 없어요.";
  if (!isPlainNickname(canonical)) return "닉네임은 한글·영문·숫자만 쓸 수 있어요.";

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

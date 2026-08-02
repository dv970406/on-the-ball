"use client";

import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { toAuthErrorMessage } from "@/entities/session";

export interface SignUpInput {
  email: string;
  password: string;
}

export interface SignUpResult {
  /** 세션 없이 유저만 생성된 경우 — 메일 인증을 마쳐야 로그인된다 */
  needsEmailConfirm: boolean;
}

/**
 * 이메일·비밀번호 회원가입.
 *
 * ⚠ 결과가 프로젝트 설정에 따라 두 갈래다. 이걸 호출부가 반드시 구분해야 한다.
 * - 이메일 확인 **꺼짐**(로컬 config.toml): 가입 즉시 세션 발급 → GuestOnly가 목적지로 보낸다.
 * - 이메일 확인 **켜짐**(호스팅 프로젝트의 기본값): `error`는 null인데 `session`만 null로 온다.
 *   이걸 그냥 성공으로 흘려보내면 SIGNED_IN이 오지 않아 **화면이 아무 반응 없이 멈춘다**.
 *   그래서 성공 여부가 아니라 `needsEmailConfirm`으로 갈래를 돌려준다.
 *
 * 이미 가입된 이메일도 확인이 켜져 있으면 에러 없이 이 갈래로 온다(계정 존재 여부를 숨기는
 * Supabase의 의도적 동작). 안내 문구는 그 경우에도 맞는 말이어야 한다.
 *
 * 프로필(닉네임)은 DB의 on_auth_user_created 트리거가 자동 생성한다.
 */
export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, password }: SignUpInput): Promise<SignUpResult> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        console.error("[auth] 회원가입 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
      return { needsEmailConfirm: data.session === null };
    },
  });
}

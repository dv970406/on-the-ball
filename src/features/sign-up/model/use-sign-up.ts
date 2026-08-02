"use client";

import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { toAuthErrorMessage } from "@/entities/session";

export interface SignUpInput {
  email: string;
  password: string;
}

/**
 * 이메일·비밀번호 회원가입.
 *
 * config.toml의 [auth.email] enable_confirmations = false라 가입 즉시 세션이 발급된다
 * (= 가입하면 바로 로그인 상태). true로 바꾸면 session이 null로 오므로
 * "메일함을 확인해 주세요" 안내 화면이 따로 필요해진다.
 *
 * 프로필(닉네임)은 DB의 on_auth_user_created 트리거가 자동 생성한다.
 */
export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, password }: SignUpInput) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        console.error("[auth] 회원가입 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
  });
}

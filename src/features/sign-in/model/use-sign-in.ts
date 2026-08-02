"use client";

import { useMutation } from "@tanstack/react-query";
import { requireBrowserSupabase } from "@/shared/api";
import { toAuthErrorMessage } from "@/entities/session";

export interface SignInInput {
  email: string;
  password: string;
}

/**
 * 이메일·비밀번호 로그인.
 *
 * 성공 시 스토어를 직접 건드리지 않는다 — supabase가 SIGNED_IN 이벤트를 발행하고
 * AuthProvider가 그걸 받아 스토어에 반영한다(세션의 단일 소스 유지).
 */
export function useSignIn() {
  return useMutation({
    mutationFn: async ({ email, password }: SignInInput) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // 원본은 로그에만 남기고 화면에는 한국어 문구만 올린다
        console.error("[auth] 로그인 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
  });
}

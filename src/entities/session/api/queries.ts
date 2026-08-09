"use client";

import { useQuery } from "@tanstack/react-query";
import type { UserIdentity } from "@supabase/supabase-js";
import { requireBrowserSupabase } from "@/shared/api";
import { toAuthErrorMessage } from "../lib/auth-error-message";
import { identityKeys } from "./keys";

/**
 * 이 계정에 연결된 로그인 수단.
 *
 * ⚠ 조회는 `entities`가 갖고 쓰기(연결·해제)는 `features/link-identity`가 갖는다 —
 *   `entities/post`(조회) ↔ `features/toggle-post-like`(쓰기)와 같은 분업이다.
 * ⚠ 세션에서 userId를 직접 읽지 않고 인자로 받는다(entities끼리 import 금지).
 *   값 자체는 supabase가 세션에서 꺼내지만, **캐시 키를 유저로 가르는 데** 필요하다.
 */
export function useLinkedIdentitiesQuery(userId: string | undefined) {
  return useQuery({
    queryKey: identityKeys.detail(userId ?? ""),
    queryFn: async (): Promise<UserIdentity[]> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) {
        console.error("[auth] 연결된 계정 조회 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
      return data.identities;
    },
    enabled: !!userId,
  });
}

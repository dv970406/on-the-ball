"use client";

import { getBrowserSupabase } from "./supabase-browser";

let pending: Promise<void> | null = null;

/**
 * 익명 세션 보장 — 세션이 없으면 signInAnonymously를 1회만 수행한다.
 * 투표 등 쓰기 액션 직전에 호출해 "세션 생성 전 뮤테이션" 레이스를 막는다.
 */
export function ensureAnonymousSession(): Promise<void> {
  pending ??= (async () => {
    const supabase = getBrowserSupabase();
    if (!supabase) return; // env 미설정 — API가 503으로 안내

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        // 실패 시 다음 시도에서 재시도할 수 있도록 캐시 해제
        pending = null;
        throw error;
      }
    }
  })();

  return pending;
}

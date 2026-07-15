import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, isSupabaseConfigured } from "@/shared/config";

/**
 * Route Handler용 Supabase 서버 클라이언트.
 * 요청 쿠키의 익명 세션으로 동작하므로 RLS가 그대로 적용된다 (service role 불필요).
 * env 미설정이면 null을 반환한다 — 호출부(handler 헬퍼)에서 503 처리.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 서버 컴포넌트 렌더 중에는 쿠키 쓰기가 불가 — proxy에서 세션이 갱신되므로 무시
        }
      },
    },
  });
}

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, isSupabaseConfigured } from "@/shared/config";
import type { Database } from "@/types/database.types";

/**
 * 서버(generateMetadata·서버 컴포넌트)용 Supabase 클라이언트.
 * 요청 쿠키의 세션으로 동작하므로 RLS가 그대로 적용된다 (service role 불필요).
 * env 미설정이면 null을 반환한다 — 호출부에서 가드.
 *
 * ⚠ next/headers 의존이라 @/shared/api 배럴에 싣지 않는다. 직접 경로로 import한다.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
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

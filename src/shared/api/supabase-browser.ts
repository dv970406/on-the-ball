import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/shared/config";

let client: SupabaseClient | null = null;

/**
 * 브라우저용 Supabase 클라이언트 (싱글턴).
 * 데이터 쿼리는 전부 API Route를 경유하므로, 브라우저 클라이언트는 인증(익명 로그인)에만 쓴다.
 * env 미설정이면 null을 반환한다 — 호출부에서 가드.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  client ??= createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}

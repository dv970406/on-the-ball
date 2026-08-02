import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/shared/config";
import type { Database } from "@/types/database.types";

// SupabaseClient에 Database를 붙여야 .from("post").insert({...})·
// .rpc("toggle_post_like", {...})의 테이블명·컬럼명·인자가 컴파일 타임에 검증된다.
let client: SupabaseClient<Database> | null = null;

/**
 * 브라우저용 Supabase 클라이언트 (싱글턴).
 *
 * 인증과 데이터 쿼리를 모두 이 클라이언트로 수행한다(Route Handler 경유 없음).
 * 단 컴포넌트가 직접 부르지 않고 entities/{*}/api의 TanStack Query 훅만 이 클라이언트를 만진다.
 *
 * ⚠ @supabase/ssr의 createBrowserClient는 세션을 **쿠키**에 저장한다.
 *   proxy.ts의 서버 가드·토큰 리프레시가 같은 쿠키를 읽어야 하므로,
 *   localStorage에 저장하는 @supabase/supabase-js의 createClient로 바꾸지 않는다.
 *
 * env 미설정이면 null을 반환한다 — 호출부에서 가드.
 */
export function getBrowserSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  client ??= createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}

/**
 * 클라이언트가 반드시 있어야 하는 자리(쿼리 훅·뮤테이션 훅)용.
 * 모든 호출부가 똑같은 null 가드를 반복하는 대신 여기서 한 번에 한국어 에러로 바꾼다.
 */
export function requireBrowserSupabase(): SupabaseClient<Database> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    throw new Error("서비스 설정이 완료되지 않았어요. 잠시 후 다시 시도해 주세요.");
  }
  return supabase;
}

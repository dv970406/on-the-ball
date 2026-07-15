// ⚠ 이 배럴은 클라이언트에서 import해도 안전한 모듈만 노출한다.
// 서버 전용(next/headers 의존)은 직접 경로로 import:
//   - "@/shared/api/supabase-server" (createSupabaseServerClient)
//   - "@/shared/api/handler" (ok, fail, withSupabase)
export { getBrowserSupabase } from "./supabase-browser";
export { apiFetch, ApiError } from "./api-fetch";
export { ensureAnonymousSession } from "./ensure-session";

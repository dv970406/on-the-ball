// ⚠ 이 배럴은 클라이언트에서 import해도 안전한 모듈만 노출한다.
// 서버 전용(next/headers 의존)은 직접 경로로 import:
//   - "@/shared/api/supabase-server" (createSupabaseServerClient)
export { getBrowserSupabase, requireBrowserSupabase } from "./supabase-browser";
export { toDbErrorMessage } from "./db-error-message";

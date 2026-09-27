// ⚠ 이 배럴은 클라이언트에서 import해도 안전한 모듈만 노출한다.
// 서버 전용(next/headers 의존)은 직접 경로로 import:
//   - "@/shared/api/supabase-server" (createSupabaseServerClient)
export { getBrowserSupabase, requireBrowserSupabase } from "./supabase-browser";
export { toDbErrorMessage } from "./db-error-message";
// 쓰기 실패 문구 — 42501의 원인이 "세션이 사라짐"이면 그렇게 말한다(그 파일 주석)
export { toWriteErrorMessage } from "./write-error-message";

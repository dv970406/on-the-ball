/**
 * Supabase 연결 환경변수.
 * NEXT_PUBLIC_* 값은 빌드 시 인라인되므로 모듈 최상위에서 읽어도 안전하다.
 * 값이 비어 있어도 빌드는 성공해야 하므로 여기서 throw하지 않는다 — 호출부에서 가드.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

/** Supabase 환경변수가 채워졌는지 여부 (미설정 시 화면·API에서 안내 노출) */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

/**
 * PostgREST/RPC 에러 → 사용자에게 보여줄 한국어 문구.
 *
 * 인증 에러(AuthError)는 형태도 코드 체계도 달라 entities/session/lib/auth-error-message에
 * 따로 둔다 — 억지로 하나로 묶지 않는다.
 */

/** supabase-js가 돌려주는 에러 형태 (PostgrestError·RPC 에러 공통) */
interface DbErrorLike {
  code?: string;
  message?: string;
}

/**
 * PostgrestError 판별.
 * ⚠ `"message" in error`만 보면 일반 Error·TypeError·AuthError까지 통과해,
 *   code가 우연히 겹치면 엉뚱한 DB 문구가 나온다. code가 문자열인 것까지 확인한다.
 */
function isDbErrorLike(error: unknown): error is DbErrorLike {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

const DB_ERROR_MESSAGE: Record<string, string> = {
  // 23505 unique_violation — 닉네임 중복(profiles_nickname_lower_key) 등
  "23505": "이미 사용 중인 값이에요.",
  // 23503 foreign_key_violation — 참조 대상이 사라짐
  "23503": "대상을 찾을 수 없어요. 이미 삭제되었을 수 있어요.",
  // 42501 insufficient_privilege — Postgres 자신의 영어 메시지(RLS·컬럼 권한·EXECUTE 차단).
  // 우리가 의도적으로 띄우는 권한 에러는 P0001로 던져 메시지를 그대로 노출한다.
  "42501": "권한이 없어요.",
  // PGRST116 — single()이 기대한 1행을 못 찾음.
  // 글·댓글·프로필 어디서든 나올 수 있으므로 대상을 특정하지 않는다.
  PGRST116: "대상을 찾을 수 없어요.",
  // 23514 check_violation — 클라이언트 검증과 DB 제약이 어긋났을 때(길이·공백)
  "23514": "입력값이 허용 범위를 벗어났어요.",
  // 22P02 invalid_text_representation — enum에 없는 값(말머리 등).
  // enum 컬럼을 쓰면서 생긴 코드다: text+check였다면 23514로 왔을 자리다.
  "22P02": "허용되지 않는 값이에요.",
  // 23502 not_null_violation — 필수 컬럼 누락(말머리는 default가 없어 여기로 온다)
  "23502": "필수 값이 비어 있어요.",
};

export function toDbErrorMessage(error: unknown): string {
  if (!isDbErrorLike(error)) return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

  // P0001은 우리가 RPC 안에서 raise exception으로 던진 것이라 message가 이미 한국어다
  if (error.code === "P0001" && error.message) return error.message;

  if (error.code && DB_ERROR_MESSAGE[error.code]) return DB_ERROR_MESSAGE[error.code];

  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

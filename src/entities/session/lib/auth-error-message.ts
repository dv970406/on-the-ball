import { AuthError } from "@supabase/supabase-js";

/**
 * supabase 인증 에러 → 사용자에게 보여줄 한국어 문구.
 *
 * ErrorCode 유니온에는 80개가 넘게 있지만(@supabase/auth-js의 lib/error-codes.d.ts)
 * **이 앱이 실제로 도달할 수 있는 흐름**의 것만 추린다 — 소셜 로그인, 계정 연결/해제, 세션.
 * 나머지는 일반 문구로 덮는다(MFA·SAML·SSO·전화번호는 이 앱에 없다).
 *
 * ⚠ **커버리지가 곧 기능이다.** identity 코드를 빠뜨렸더니 "이미 다른 계정에 연결된 구글"처럼
 *   **재시도로는 구조적으로 절대 성공할 수 없는** 실패가 "잠시 후 다시 시도해 주세요"로 접혔다.
 *   사용자는 일시 장애로 읽고 계속 눌렀다. 새 흐름을 붙이면 여기부터 확인한다.
 *
 * ⚠ 순수 함수다("use client" 없음). 데이터·로깅은 features의 훅이, 노출은 컴포넌트가 맡는다.
 */
const AUTH_ERROR_MESSAGE: Record<string, string> = {
  // 로그인
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않아요.",
  email_not_confirmed: "이메일 인증이 완료되지 않았어요. 메일함을 확인해 주세요.",
  user_banned: "이용이 제한된 계정이에요.",
  user_not_found: "가입 정보를 찾을 수 없어요.",

  // 회원가입
  user_already_exists: "이미 가입된 이메일이에요.",
  email_exists: "이미 가입된 이메일이에요.",
  signup_disabled: "현재 회원가입이 중단되었어요.",
  email_provider_disabled: "이메일 가입이 비활성화되어 있어요.",

  // 입력값
  weak_password: "비밀번호가 너무 짧거나 단순해요. 6자 이상으로 입력해 주세요.",
  same_password: "이전과 다른 비밀번호를 입력해 주세요.",
  email_address_invalid: "이메일 형식이 올바르지 않아요.",
  validation_failed: "입력값을 다시 확인해 주세요.",

  // 비밀번호 재설정 (PKCE)
  otp_expired: "링크가 만료되었어요. 비밀번호 재설정을 다시 요청해 주세요.",
  flow_state_expired: "링크가 만료되었어요. 비밀번호 재설정을 다시 요청해 주세요.",
  flow_state_not_found: "링크가 만료되었어요. 비밀번호 재설정을 다시 요청해 주세요.",
  // code_verifier가 이 브라우저에 없을 때 — 재설정을 요청한 브라우저에서 링크를 열어야 한다
  bad_code_verifier: "이 링크는 재설정을 요청한 브라우저에서만 열 수 있어요.",

  // 재인증 — config.toml의 secure_password_change = true라서 나올 수 있다.
  // 오래된 세션으로 비밀번호를 바꾸려 하면 GoTrue가 거부한다.
  reauthentication_needed: "보안을 위해 다시 로그인한 뒤 비밀번호를 변경해 주세요.",
  reauthentication_not_valid: "재인증에 실패했어요. 다시 로그인해 주세요.",
  reauth_nonce_missing: "재인증이 필요해요. 다시 로그인해 주세요.",

  // 계정 연결 (features/link-identity)
  // ⚠ 이 셋은 **재시도로 풀리지 않는다.** 그런데 문구가 "잠시 후 다시" 계열이면 사용자는
  //   계속 누른다 → 원인과 다음 행동을 문장 안에 담는다.
  identity_already_exists:
    "이미 다른 계정에 연결된 로그인 수단이에요. 그 계정으로 로그인해 주세요.",
  single_identity_not_deletable: "마지막 로그인 수단은 해제할 수 없어요.",
  email_conflict_identity_not_deletable:
    "이 수단을 해제하면 계정 이메일이 사라져 해제할 수 없어요.",
  identity_not_found: "이미 해제된 로그인 수단이에요.",
  manual_linking_disabled: "계정 연결 기능이 꺼져 있어요. 관리자에게 문의해 주세요.",

  // 소셜 로그인
  provider_disabled: "지금은 이 방법으로 로그인할 수 없어요.",
  provider_email_needs_verification: "프로바이더에서 이메일 인증을 먼저 완료해 주세요.",
  bad_oauth_state: "로그인 정보가 만료되었어요. 다시 시도해 주세요.",
  bad_oauth_callback: "로그인을 마치지 못했어요. 다시 시도해 주세요.",

  // 세션
  session_expired: "로그인이 만료되었어요. 다시 로그인해 주세요.",
  session_not_found: "로그인이 만료되었어요. 다시 로그인해 주세요.",
  refresh_token_not_found: "로그인이 만료되었어요. 다시 로그인해 주세요.",

  // 요청 제한
  over_email_send_rate_limit: "메일을 너무 자주 요청했어요. 잠시 후 다시 시도해 주세요.",
  over_request_rate_limit: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
};

/**
 * 코드 하나를 문구로 — 모르는 코드면 `null`.
 *
 * ⚠ **OAuth 복귀 화면이 이걸 쓴다.** 프로바이더에서 돌아오는 실패는 예외 객체가 아니라
 *   **URL의 `error_code`** 로 오므로 `toAuthErrorMessage(error)`로는 닿을 수 없다 —
 *   그래서 위 표가 `identity_already_exists`·`bad_oauth_state` 같은 문구를 갖고 있는데도
 *   화면에는 영어 원문이 나갔다. 표는 하나로 두고 입구만 둘로 연다.
 * ⚠ `null`을 돌려주는 것이 계약이다 — 호출부가 자기 맥락에 맞는 폴백을 갖는다
 *   (로그인은 "로그인하지 못했어요", 연결은 "계정을 연결하지 못했어요").
 */
export function authErrorMessageFor(code: string | null | undefined): string | null {
  return (code && AUTH_ERROR_MESSAGE[code]) || null;
}

export function toAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    const message = authErrorMessageFor(error.code);
    if (message) return message;
  }
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { toDbErrorMessage } from "./db-error-message";

/**
 * 쓰기(insert·update·delete) 실패 → 사용자에게 보일 문구. **권한 거부(42501)의 원인이 "세션이
 * 사라짐"이면** 그렇게 말한다.
 *
 * ⚠ 다른 기기에서 전체 로그아웃됐거나 토큰 갱신이 실패하면 auth-js가 세션을 지우고 요청은 anon으로
 *   나가 42501이 된다. 그대로 "권한이 없어요."라고 하면 원인을 알 수 없다(QA 실측) — 실패 **뒤의**
 *   세션 유무로 가른다(세션이 지워지는 것이 실패의 결과이기도 하다).
 * ⚠ 42501이 아닌 실패는 `toDbErrorMessage`와 같다 — 세션을 보는 것은 이 한 경우뿐이다.
 */
export async function toWriteErrorMessage(
  supabase: SupabaseClient,
  error: unknown,
): Promise<string> {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "42501") {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return "로그인이 풀렸어요. 다시 로그인해 주세요.";
  }
  return toDbErrorMessage(error);
}

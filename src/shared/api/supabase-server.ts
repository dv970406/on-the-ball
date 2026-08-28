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

/**
 * 이 요청에 세션 쿠키가 있는가 — **네트워크를 타지 않는 판정**이다.
 *
 * 익명 응답을 캐시에서 줄지(=`createSupabaseAnonClient`) 고르는 데만 쓴다.
 * **인가 판정이 아니다** — 그건 여전히 RLS가 한다. 그래서 쿠키 이름만 보는 것으로 충분하고,
 * `getUser()`를 부르지 않는다(로그인 사용자에게 GoTrue 왕복이 하나 더 붙는다).
 *
 * ⚠ **틀리는 방향이 규약이다.** `sb-` 접두어는 넓게 잡혀 있어 세션이 있는데 없다고 볼 일이
 *   없다 — 헛짚어도 캐시를 못 타고 평소 경로로 갈 뿐이다. 반대로 좁게 고치면 로그인 사용자가
 *   익명 목록(좋아요 상태·차단 숨김이 빠진)을 받게 되는데, **빌드도 린트도 잡지 못하고
 *   화면만 조용히 남의 시점이 된다.**
 * ⚠ `@supabase/ssr`의 저장소 키는 `sb-<project-ref>-auth-token`이고 값이 길면 `.0`·`.1`로
 *   쪼개진다 — 접두어로만 보는 이유다.
 */
export async function hasSessionCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.getAll().some(({ name }) => name.startsWith("sb-"));
}

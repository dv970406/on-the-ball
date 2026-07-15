import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase 세션 쿠키 리프레시 프록시 (Next 16의 middleware 대체).
 * 만료된 익명 세션 토큰을 요청 진입 시점에 갱신해 쿠키에 반영한다.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response; // env 미설정 — 통과

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser 호출이 토큰 만료 시 리프레시를 수행한다
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // 정적 자산 + /api 제외.
  // API 라우트는 handler(withSupabase)가 세션 검증·쿠키 리프레시를 직접 담당하므로
  // proxy까지 getUser()를 돌리면 요청당 auth 서버 왕복이 2회로 중복된다.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico|woff2?)$).*)",
  ],
};

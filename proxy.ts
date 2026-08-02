import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTES, safeNextPath } from "@/shared/config";
// 페이지와 같은 파서를 써야 판정이 어긋나지 않는다 — post-id.ts 주석 참고.
// "use client" 훅을 포함한 @/shared/lib 배럴 대신 직접 경로로 가져온다.
import { parsePostId } from "@/shared/lib/post-id";

/**
 * Supabase 세션 쿠키 리프레시 + 낙관적 라우트 가드 (Next 16의 middleware 대체).
 *
 * Next 공식 authentication 가이드가 권하는 구조를 따른다 —
 * proxy는 "낙관적 체크"만 하고, 진짜 방어는 데이터 소스에 가장 가까운 곳(DB의 RLS)에서 한다.
 * 여기서 하는 일은 이미 매 요청 돌고 있는 getUser() 결과를 재사용한 리다이렉트뿐이라
 * 추가 비용이 없다.
 *
 * 못 잡는 경우: 클라이언트 전이(SPA), 화면에 머무는 동안의 세션 만료.
 * → entities/session의 AuthRequired·GuestOnly가 그 구멍을 메운다.
 */

/** 로그인 상태로 접근하면 목록으로 보낼 경로 */
const GUEST_ONLY: string[] = [ROUTES.signIn, ROUTES.signUp, ROUTES.forgetPassword];

/**
 * 경로 비교 전 정규화.
 * ⚠ Next는 퍼센트 인코딩을 디코딩해 라우팅하는데 여기서 원문과 비교하면
 *   `/posts/%6Eew`(= /posts/new)가 가드를 그냥 통과한다(실측 확인).
 */
function normalizePath(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    // 잘못된 인코딩(`%`, `%zz` 등) — 원문으로 비교한다
    return pathname;
  }
}

/** 비로그인으로 접근하면 로그인으로 보낼 경로 */
function isAuthRequired(pathname: string) {
  if (pathname === ROUTES.postNew) return true;
  const match = /^\/posts\/([^/]+)\/edit$/.exec(pathname);
  return match ? parsePostId(match[1]) !== null : false;
}

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

  // getUser 호출이 토큰 만료 시 리프레시를 수행한다 — 그 결과를 가드에도 재사용한다
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = normalizePath(request.nextUrl.pathname);

  if (!user && isAuthRequired(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.signIn;
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", pathname); // 로그인 후 원래 목적지로
    return NextResponse.redirect(redirectUrl);
  }

  if (user && GUEST_ONLY.includes(pathname)) {
    // 클라이언트 가드(GuestOnly)와 같은 규칙으로 목적지를 정한다 —
    // 서버만 next를 버리면 "로그인 화면에 하드 진입했을 때만 목적지가 사라지는" 불일치가 생긴다.
    const next = safeNextPath(request.nextUrl.searchParams.get("next"), request.nextUrl.origin);
    return NextResponse.redirect(new URL(next ?? ROUTES.postList, request.nextUrl.origin));
  }

  return response;
}

export const config = {
  // 정적 자산 + /api 제외.
  // matcher는 빌드타임에 정적 분석되므로 상수여야 한다 → 경로별 분기는 함수 안에서 한다.
  // 현재 app/api는 없다(데이터 접근은 브라우저가 supabase를 직접 호출).
  // 나중에 라우트를 만든다면 그 핸들러가 세션 검증을 직접 하는지 확인하고
  // 중복 왕복이 생기지 않게 이 제외 규칙을 재검토할 것.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico|woff2?)$).*)",
  ],
};

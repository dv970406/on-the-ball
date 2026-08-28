import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTES, env, isSupabaseConfigured, safeNextPath } from "@/shared/config";
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

/**
 * 로그인 상태로 접근하면 목록으로 보낼 경로.
 *
 * ⚠ 소셜 로그인 복귀 지점이 **바로 이 경로다**(`/sign-in?code=...`). 그래도 문제가 없는 이유는
 *   proxy가 보는 세션이 **쿠키**인데, 코드 교환은 브라우저에서 일어나 그 시점에 쿠키가 아직
 *   없기 때문이다 — 복귀 요청은 비로그인으로 통과하고, 교환이 끝나면 GuestOnly가 목적지로
 *   보낸다. 여기에 예외를 파지 않는다(파면 로그인한 채 /sign-in을 열 수 있게 된다).
 */
const GUEST_ONLY: string[] = [ROUTES.signIn];

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
  if (pathname === ROUTES.postNew || pathname === ROUTES.profile) return true;
  const match = /^\/posts\/([^/]+)\/edit$/.exec(pathname);
  return match ? parsePostId(match[1]) !== null : false;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // 화면·훅과 같은 단일 소스를 쓴다(process.env를 여기서 또 읽지 않는다)
  if (!isSupabaseConfigured()) return response; // env 미설정 — 통과

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
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

  /**
   * 리다이렉트 응답으로 갈아타되 **갱신된 세션 쿠키를 옮겨 싣는다.**
   *
   * ⚠ getUser()가 만료 토큰을 리프레시하면 @supabase/ssr이 위 setAll을 호출해
   *   `response`에 새 쿠키를 쌓는다. 그런데 `NextResponse.redirect(...)`는 완전히 새 응답이라
   *   그냥 반환하면 그 Set-Cookie가 통째로 사라진다(리프레시 실패 시의 쿠키 **삭제**도 함께).
   *   그러면 가드 리다이렉트마다 토큰 갱신 왕복이 한 번씩 버려진다.
   *   Supabase 공식 가이드가 "반드시 쿠키를 복사하라"고 경고하는 지점이다.
   */
  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user && isAuthRequired(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.signIn;
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", pathname); // 로그인 후 원래 목적지로
    return redirectTo(redirectUrl);
  }

  if (user && GUEST_ONLY.includes(pathname)) {
    // 클라이언트 가드(GuestOnly)와 같은 규칙으로 목적지를 정한다 —
    // 서버만 next를 버리면 "로그인 화면에 하드 진입했을 때만 목적지가 사라지는" 불일치가 생긴다.
    const next = safeNextPath(request.nextUrl.searchParams.get("next"), request.nextUrl.origin);
    return redirectTo(new URL(next ?? ROUTES.postList, request.nextUrl.origin));
  }

  return response;
}

export const config = {
  // 정적 자산 + /api 제외.
  // matcher는 빌드타임에 정적 분석되므로 상수여야 한다 → 경로별 분기는 함수 안에서 한다.
  // 현재 app/api는 없다(데이터 접근은 브라우저가 supabase를 직접 호출).
  // 나중에 라우트를 만든다면 그 핸들러가 세션 검증을 직접 하는지 확인하고
  // 중복 왕복이 생기지 않게 이 제외 규칙을 재검토할 것.
  // ⚠ `api`에만 세그먼트 경계를 둔다. 접두어 매칭이면 나중에 만들 `/api-docs` 같은
  //   **일반 화면까지 가드가 조용히 비활성화**되기 때문이다.
  // ⚠ 반대로 `_next/image`에는 경계를 두지 말 것. Next의 이미지 최적화 엔드포인트는
  //   뒤에 슬래시가 없는 `/_next/image?url=...` 형태라, `_next/image/`로 적으면 제외가
  //   무효가 되어 **이미지 요청마다 proxy + getUser() 왕복**이 붙는다(Next 공식 예제도
  //   경계 없이 `_next/image`로 적는다).
  // ⚠ **프리페치 요청은 제외한다.** `<Link>`가 뷰포트에 들어오면 프리페치 요청이 나가는데,
  //   이 앱의 동적 라우트는 `loading.tsx`가 없어 **페이지 세그먼트가 없는 빈 라우터 트리**만
  //   돌려준다(실측: 75~252B, 서버 조회는 돌지 않는다). 그런데 proxy는 그대로 타서
  //   **로그인 사용자에게 링크당 GoTrue `getUser()` 왕복이 하나씩** 붙었다 — 아무것도 렌더하지
  //   않는 요청에 대한 순수 낭비다. 목록 화면에는 말머리·정렬 링크만 10개가 있다.
  // ⚠ 가드에 구멍이 생기지 않는다. 프리페치는 사용자에게 아무것도 보여주지 않고, **실제 이동은
  //   프리페치 헤더 없이 다시 요청되어** proxy를 정상적으로 탄다. 헤더를 위조해 이 제외를
  //   노려도 얻는 것은 스켈레톤뿐이다 — `AuthRequired`가 화면을 갈아치우고 RLS가 쓰기를 막는다.
  // ⚠ 헤더 이름은 Next 내부 상수다(`next/dist/client/components/app-router-headers.js`의
  //   `NEXT_ROUTER_PREFETCH_HEADER = 'next-router-prefetch'`). 버전이 올라 이름이 바뀌면
  //   제외가 조용히 무효가 되는데, 그때의 대가는 예전 동작(왕복이 도로 붙는다)이라 안전한 방향이다.
  matcher: [
    {
      source:
        "/((?!api/|api$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico|woff2?)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};

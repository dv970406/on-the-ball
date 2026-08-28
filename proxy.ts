import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured } from "@/shared/config";

/**
 * Supabase 세션 쿠키 리프레시 (Next 16의 middleware 대체).
 *
 * **이 파일이 존재하는 이유는 하나다 — 서버가 쿠키를 쓸 수 있는 자리가 여기뿐이다.**
 *
 * access token은 만료되고(`supabase/config.toml`의 `jwt_expiry`), 갱신하면 새 쿠키를 **저장**해야
 * 한다. 그런데 서버 컴포넌트는 쿠키를 쓸 수 없다 — `shared/api/supabase-server.ts`의 `setAll`이
 * 그래서 throw를 삼킨다. Next에서 서버가 쿠키를 쓸 수 있는 곳은 proxy · Server Action ·
 * Route Handler 셋인데 이 프로젝트는 뒤의 둘을 쓰지 않는다(`api-and-db.md`: Route Handler를
 * 두지 않는다) → 남는 것이 proxy다.
 *
 * ⚠ **없애면 조용히 간헐적으로 로그아웃된다.** 1시간 이상 떠나 있다 돌아오면 서버 렌더가
 *   만료 토큰을 보고 스스로 리프레시하는데, 저장을 못 해 쿠키에는 **옛 refresh token**이 남는다.
 *   `enable_refresh_token_rotation`이 켜져 있어 그건 이미 회전된 1회용이고 유예는
 *   `refresh_token_reuse_interval`(초)뿐이라, 브라우저의 갱신이 그 창을 놓치면 재사용 탐지에
 *   걸려 세션이 무효화된다. 화면은 멀쩡히 그려지므로 **재현도 로그도 없이** 터진다.
 *
 * ⚠ **라우트 가드는 여기 없다.** 인증 판정은 `AuthRequired`/`GuestOnly`(화면)와 **RLS**(실차단)가
 *   갖는다. proxy에 낙관적 가드를 함께 두면 서버는 `getUser()`로 GoTrue에 검증하고 클라이언트는
 *   쿠키의 `expires_at`만 로컬 검사해 **판정이 갈리고, 그 불일치가 무한 리다이렉트가 된다**
 *   (`data-and-state.md`). 판정자를 하나로 두어 그 부채를 없앴다 — 되돌리지 말 것.
 *   여기에 리다이렉트를 다시 넣는다면 갱신된 쿠키를 그 응답에 **손으로 옮겨 실어야** 한다
 *   (`NextResponse.redirect`는 새 응답이라 `Set-Cookie`가 통째로 사라진다).
 */
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

  /**
   * 이 호출이 곧 이 파일의 일이다 — 만료됐으면 리프레시하고, 그 결과가 위 `setAll`을 통해
   * 응답 쿠키에 실린다. 반환값(user)은 쓰지 않는다.
   * ⚠ 비로그인 요청은 네트워크를 타지 않는다 — auth-js가 쿠키에 access_token이 없으면
   *   `AuthSessionMissingError`로 바로 빠져나간다(2.110 `_getUser`). 크롤러 비용이 0인 이유다.
   */
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // 정적 자산 + /api 제외.
  // matcher는 빌드타임에 정적 분석되므로 상수여야 한다.
  // 현재 app/api는 없다(데이터 접근은 브라우저가 supabase를 직접 호출).
  // 나중에 라우트를 만든다면 그 핸들러가 세션 검증을 직접 하는지 확인하고
  // 중복 왕복이 생기지 않게 이 제외 규칙을 재검토할 것.
  // ⚠ `api`에만 세그먼트 경계를 둔다. 접두어 매칭이면 나중에 만들 `/api-docs` 같은
  //   **일반 화면까지 세션 갱신이 조용히 멈추기** 때문이다.
  // ⚠ 반대로 `_next/image`에는 경계를 두지 말 것. Next의 이미지 최적화 엔드포인트는
  //   뒤에 슬래시가 없는 `/_next/image?url=...` 형태라, `_next/image/`로 적으면 제외가
  //   무효가 되어 **이미지 요청마다 proxy + getUser() 왕복**이 붙는다(Next 공식 예제도
  //   경계 없이 `_next/image`로 적는다).
  // ⚠ **프리페치 요청은 제외한다.** `<Link>`가 뷰포트에 들어오면 프리페치 요청이 나가는데,
  //   이 앱의 동적 라우트는 `loading.tsx`가 없어 **페이지 세그먼트가 없는 빈 라우터 트리**만
  //   돌려준다(실측: 75~252B, 서버 조회는 돌지 않는다). 그런데 proxy는 그대로 타서
  //   **로그인 사용자에게 링크당 GoTrue 왕복이 하나씩** 붙었다 — 목록 화면에는 말머리·정렬
  //   링크만 10개가 있다. 프리페치에서 세션을 갱신하지 못해도 실제 이동이 곧바로 갱신한다.
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

/**
 * 앱 라우트 경로 헬퍼 — 문자열 하드코딩 대신 이 객체를 사용.
 */
export const ROUTES = {
  home: "/",

  // 게시판
  postList: "/posts",
  postNew: "/posts/new",
  post: (id: number | string) => `/posts/${id}`,
  postEdit: (id: number | string) => `/posts/${id}/edit`,

  // 인증
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgetPassword: "/forget-password",
  resetPassword: "/reset-password",
} as const;

/**
 * 로그인 후 원래 목적지로 돌려보내기 위한 `next` 파라미터를 붙인 로그인 경로.
 * proxy(서버 가드)와 AuthRequired(클라 가드)가 같은 형태를 만들어야 하므로 여기로 모은다.
 */
export function signInWithNext(next: string) {
  return withNext(ROUTES.signIn, next);
}

/**
 * 경로에 `?next=`를 붙인다. 이미 없으면 그대로 둔다.
 *
 * 인증 화면끼리 이동할 때(로그인 ↔ 회원가입 ↔ 비밀번호 찾기) 목적지를 잃지 않기 위해 쓴다.
 * `GuestOnly`가 목적지를 단독으로 정하게 되면서 **URL의 next가 유일한 보존 수단**이 됐다 —
 * 여기서 끊기면 "글쓰기를 누르고 가입했는데 목록으로 떨어지는" 증상이 된다.
 */
export function withNext(path: string, next: string | null | undefined) {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/**
 * `?next=`로 받은 값을 안전한 **앱 내부 경로**로만 통과시킨다. 아니면 null.
 *
 * ⚠ `next.startsWith("/") && !next.startsWith("//")` 같은 문자열 검사로는 부족하다.
 *   WHATWG URL 파서는 http(s)에서 역슬래시를 슬래시로 취급하므로
 *   `/\evil.com`이 그 검사를 통과한 뒤 `http://evil.com/`으로 해석된다(실측 확인).
 *   그래서 실제로 파싱해 origin이 같은지로 판정한다.
 *
 * ⚠ origin을 인자로 받는다 — `window.location.origin`을 안에서 읽으면
 *   이 모듈을 import하는 proxy(서버)에서 쓸 수 없다. 서버는 `request.nextUrl.origin`을 넘긴다.
 *
 * ⚠⚠ **파싱 시점의 origin 검사만으로는 부족하다.** URL 파서는 `/..`을 정규화하면서
 *   `//`로 시작하는 pathname을 남기고, 그 문자열을 다시 해석하면 프로토콜 상대 URL이 된다:
 *     "/..//evil.com"  → pathname "//evil.com"  → http://evil.com/
 *     "/./\/evil.com"  → pathname "///evil.com" → http://evil.com/
 *   그래서 **돌려줄 문자열을 같은 기준으로 한 번 더 대조**한다. 이 함수의 계약은
 *   "반환값을 origin에 대해 해석해도 origin을 벗어나지 않는다"이므로, 그 불변식을 그대로 검사한다.
 */
export function safeNextPath(next: string | null | undefined, origin: string): string | null {
  if (!next) return null;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return null;

    const path = `${url.pathname}${url.search}${url.hash}`;
    // 정규화 결과 재검증 — 파서 동작에 기대지 않고 불변식을 직접 확인한다
    if (new URL(path, origin).origin !== origin) return null;
    return path;
  } catch {
    return null;
  }
}

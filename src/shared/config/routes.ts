/**
 * 앱 라우트 경로 헬퍼 — 문자열 하드코딩 대신 이 객체를 사용.
 */
export const ROUTES = {
  home: "/",

  /**
   * 이적시장 — 크롤러(`transfer_news`)가 파생한 이적 딜 보드.
   * ⚠ 상세(`/transfers/[id]`)에는 탭바가 없다(`activeTabHref`가 목록만 센다 — 상세는 목록과
   *   별개 화면이라 활성 탭으로 되비칠 필요가 없다).
   */
  transferList: "/transfers",
  transfer: (id: number | string) => `/transfers/${id}`,

  // 인증 — 소셜 로그인은 로그인과 가입이 같은 동작이라 화면이 하나다
  signIn: "/sign-in",
  // 프로필 — 닉네임·사진 수정과 로그인 수단 연결
  profile: "/profile",
} as const;

/**
 * **하단 탭바를 렌더하는 화면인가.** 탭바(`widgets/bottom-tab-bar`)와 토스트(`shared/ui/toast`)가
 * 이 판정을 함께 본다.
 *
 * ⚠ 두 곳이 갈리면 조용히 어긋난다 — 토스트가 경로 하나만 보고 위치를 올리면, 다른 탭 화면에서
 *   **토스트가 탭바를 덮는다.**
 * ⚠ `shared`에 있는 이유는 `OAUTH_PROVIDERS`와 같다 — `shared/ui`가 `widgets`를 import할 수 없다.
 */
export function isTabBarRoute(pathname: string): boolean {
  return activeTabHref(pathname) !== null;
}

/**
 * 이 경로에서 **활성인 탭의 href** — 탭바가 없는 화면이면 `null`.
 *
 * ⚠ 접두사로 넓히지 않는다 — `/transfers`로 넓히면 **딜 상세(`/transfers/1`)까지 딸려 들어온다**.
 *   거기엔 탭바가 없다. 그래서 목록 경로만 명시적으로 센다.
 */
export function activeTabHref(pathname: string): string | null {
  if (pathname === ROUTES.transferList) return ROUTES.transferList;
  if (pathname === ROUTES.profile) return ROUTES.profile;
  return null;
}

/**
 * 로그인 후 원래 목적지로 돌려보내기 위한 `next` 파라미터를 붙인 로그인 경로.
 * 가드·SignInDialog·AuthStatus가 같은 형태를 만들어야 하므로 여기로 모은다.
 */
export function signInWithNext(next: string) {
  return withNext(ROUTES.signIn, next);
}

/**
 * 경로에 `?next=`를 붙인다. 이미 없으면 그대로 둔다.
 *
 * `GuestOnly`가 목적지를 단독으로 정하므로 **URL의 next가 유일한 보존 수단**이다 —
 * 여기서 끊기면 "글쓰기를 누르고 로그인했는데 목록으로 떨어지는" 증상이 된다.
 * 소셜 로그인은 프로바이더로 나갔다 돌아오므로 `redirectTo`에도 이 형태를 실어 보낸다
 * (features/sign-in의 useOAuthSignIn).
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
 *   서버에서 쓸 수 없다. 서버 소비자가 생기면 origin을 인자로 넘긴다.
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

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
  /**
   * 말머리별 목록.
   * ⚠ `/posts/[말머리]`로 둘 수 없다 — 그 자리는 이미 `/posts/[id]`(상세)가 쓴다.
   *   `category` 정적 세그먼트가 충돌을 없앤다(Next가 정적 세그먼트를 먼저 맞춘다).
   */
  postCategory: (slug: string) => `/posts/category/${slug}`,

  /**
   * 공지사항 — 운영진이 등록하고 사용자는 읽기만 한다(작성·수정 화면은 어드민에 있다).
   * ⚠ `activeTabHref`에 넣지 않는다 — 하단 탭바에 공지 탭이 없어 서브헤더 화면이다.
   */
  noticeList: "/notices",
  notice: (id: number | string) => `/notices/${id}`,

  // 입축구 — 운영진이 등록하는 전 유저 대상 문항. 사용자가 만드는 화면이 없어 new/edit가 없다
  surveyList: "/surveys",
  survey: (id: number | string) => `/surveys/${id}`,

  /**
   * 승부예측 — 경기 일정·결과와 예측.
   * ⚠ `/predictions`가 아니라 `/matches`다. 나중에 선수 평점·매치 스레드가 붙으면 전부
   *   경기를 부모로 삼는데, 그때 `/predictions/[id]`는 거짓말이 된다 — **URL은 영구 계약**이라
   *   확장 여지를 지금 잡아 둔다(탭 라벨은 "승부예측"이고, 표시 문구와 경로는 다른 계약이다).
   */
  matchList: "/matches",
  match: (id: number | string) => `/matches/${id}`,

  // 인증 — 소셜 로그인은 로그인과 가입이 같은 동작이라 화면이 하나다
  signIn: "/sign-in",
  // 프로필 — 닉네임·사진 수정과 로그인 수단 연결
  profile: "/profile",

  /**
   * 어드민 백오피스.
   *
   * ⚠ **`activeTabHref`에 넣지 않는다.** 어드민은 하단 탭바를 쓰지 않고 자기 셸의 상단
   *   세그먼트 레일로 이동한다 — `null`을 받아야 탭바가 안 그려지고 토스트도 제자리에 온다.
   * ⚠ 경로를 감추는 것은 방어가 아니다(실제 차단은 `is_admin()`이 하는 definer RPC다).
   *   다만 화면·메타데이터가 존재를 드러내지 않게 `robots: { index: false }`와
   *   서버 `notFound()` 가드를 함께 둔다 — `robots.txt`에는 **적지 않는다**(적는 순간 공개다).
   */
  adminMatchList: "/admin-you-can-not-access/matches",
  adminMatch: (id: number | string) => `/admin-you-can-not-access/matches/${id}`,
  adminSurveyList: "/admin-you-can-not-access/surveys",
  adminSurveyNew: "/admin-you-can-not-access/surveys/new",
  adminSurvey: (id: number | string) => `/admin-you-can-not-access/surveys/${id}`,
  adminPostList: "/admin-you-can-not-access/posts",
  adminPost: (id: number | string) => `/admin-you-can-not-access/posts/${id}`,
  adminNoticeList: "/admin-you-can-not-access/notices",
  adminNoticeNew: "/admin-you-can-not-access/notices/new",
  adminNotice: (id: number | string) => `/admin-you-can-not-access/notices/${id}`,

  /**
   * 어드민 동기화 엔드포인트 — **이 앱의 유일한 Route Handler**다.
   * ⚠ 경로 문자열을 호출부에 하드코딩하지 않는 것은 화면 경로와 같은 이유다.
   */
  adminSyncMatches: "/api/admin/sync-matches",
} as const;

/**
 * **하단 탭바를 렌더하는 화면인가.** 탭바(`widgets/bottom-tab-bar`)와 토스트(`shared/ui/toast`)가
 * 이 판정을 함께 본다.
 *
 * ⚠ 두 곳이 갈리면 조용히 어긋난다 — 전에는 토스트가 `pathname === ROUTES.postList`만 보고
 *   위치를 올렸는데 프로필에도 탭바가 생기면서 **토스트가 탭바를 덮었다.**
 * ⚠ **배열 멤버십(정확 일치)이 아니라 함수다.** 말머리 목록(`/posts/category/…`)이 생기면서
 *   값이 유한하지 않게 됐다 — 배열로 두면 새 말머리마다 행을 더해야 하고, 빠뜨리면
 *   그 화면에서 탭바가 사라진다.
 * ⚠ `shared`에 있는 이유는 `OAUTH_PROVIDERS`와 같다 — `shared/ui`가 `widgets`를 import할 수 없다.
 */
export function isTabBarRoute(pathname: string): boolean {
  return activeTabHref(pathname) !== null;
}

/**
 * 이 경로에서 **활성인 탭의 href** — 탭바가 없는 화면이면 `null`.
 *
 * ⚠ `pathname === tab.href` 정확 일치로 두면 말머리 목록에서 "커뮤니티" 탭이 비활성이 되고
 *   `aria-current`까지 사라진다. 그렇다고 `/posts` 접두사로 넓히면 **글 상세(`/posts/1`)까지
 *   딸려 들어온다** — 거기엔 탭바가 없다. 그래서 목록 경로만 명시적으로 센다.
 */
export function activeTabHref(pathname: string): string | null {
  if (pathname === ROUTES.postList || pathname.startsWith("/posts/category/")) {
    return ROUTES.postList;
  }
  if (pathname === ROUTES.surveyList) return ROUTES.surveyList;
  if (pathname === ROUTES.matchList) return ROUTES.matchList;
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

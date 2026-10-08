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
  /**
   * 예측 랭킹 — 딜 성사 예측의 점수 순위(공개). 탭이 아니라 딜 상세의 예측 카드·프로필에서 들어온다.
   * ⚠ 탭바가 없다(`activeTabHref`가 세지 않는다) — 서브헤더 화면이다.
   */
  ranking: "/ranking",
} as const;

/**
 * **화면 아래에 고정 바가 있는가** — 하단 탭바(목록 화면) 또는 딜 상세의 관심 토글 바.
 * 토스트(`shared/ui/toast`)가 이 판정으로 바 위로 올라간다.
 *
 * ⚠ 탭바 판정(`activeTabHref`)과 갈리면 조용히 어긋난다 — 토스트가 경로 하나만 보고 위치를 올리면,
 *   다른 탭 화면에서 **토스트가 탭바를 덮는다.** 그래서 탭바 쪽은 `activeTabHref`를 그대로 쓴다.
 * ⚠ 딜 상세(`/transfers/[id]`)는 탭바가 없지만 관심 토글 바가 같은 자리에 있다 — 빠뜨리면 댓글
 *   등록·삭제 토스트가 **그 화면의 CTA 한가운데를 덮는다**(QA 실측).
 * ⚠ `shared`에 있는 이유는 `OAUTH_PROVIDERS`와 같다 — `shared/ui`가 `widgets`를 import할 수 없다.
 */
export function hasBottomBar(pathname: string): boolean {
  return activeTabHref(pathname) !== null || pathname.startsWith(`${ROUTES.transferList}/`);
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
 * 데스크톱 상단 바(`widgets/top-bar`)에서 **활성인 내비 항목의 href** — 해당 없으면 `null`.
 *
 * 탭바(`activeTabHref`)와 판정이 다르다 — 상단 바는 딜 상세(`/transfers/[id]`)에서도 "이적시장"을
 * 가리킨다(상세는 이적시장 안의 화면이다). 탭바는 상세에서 사라지므로 그쪽은 목록만 센다.
 * ⚠ 접두 판정은 `/transfers/`(슬래시까지)로 한다 — `/transfersX` 같은 다른 경로를 삼키지 않게.
 */
export function activeNavHref(pathname: string): string | null {
  if (pathname === ROUTES.transferList || pathname.startsWith(`${ROUTES.transferList}/`)) {
    return ROUTES.transferList;
  }
  if (pathname === ROUTES.ranking) return ROUTES.ranking;
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
 * 여기서 끊기면 "관심 담기를 누르고 로그인했는데 목록으로 떨어지는" 증상이 된다.
 * 소셜 로그인은 프로바이더로 나갔다 돌아오므로 `redirectTo`에도 이 형태를 실어 보낸다
 * (features/sign-in의 useOAuthSignIn).
 */
export function withNext(path: string, next: string | null | undefined) {
  const clean = next ? withoutAuthReturnParams(next) : next;
  return clean ? `${path}?next=${encodeURIComponent(clean)}` : path;
}

/**
 * OAuth 복귀 때 supabase·프로바이더가 주소에 붙이는 파라미터 — 복귀 화면이 **한 번** 읽고 끝나는 값이다.
 * `code`(PKCE 교환 코드) · `error`·`error_code`·`error_description`(거절·실패 사유) · `state`(프로바이더의 왕복 값).
 */
const AUTH_RETURN_PARAMS = ["code", "error", "error_code", "error_description", "state"] as const;

/**
 * 복귀 경로(`?next=`)에 실을 값에서 **OAuth 복귀 파라미터를 걷는다.** 나머지 쿼리·조각은 그대로 둔다.
 *
 * ⚠ 걷지 않으면 두 가지가 샌다.
 *   - `next` 안에 감싸인 `code`는 바깥 주소의 쿼리가 아니라서 분석(`track`)의 `code` 걷어내기를 피해 간다 —
 *     로그인 화면의 `page_location`에 교환 코드가 그대로 실린다.
 *   - 로그인 뒤 그 주소로 돌아오면 끝난 복귀(`?code=`·`?error=`)를 화면이 다시 읽는다 — 이미 쓴 코드로
 *     교환을 시도하고, 지난 실패 배너가 다시 뜬다.
 * ⚠ 판정은 이 함수 하나가 갖는다 — `withNext`가 실을 때 걷고 `safeNextPath`가 돌려줄 때 한 번 더 걷는다
 *   (주소창에 손으로 넣은 `next`도 같은 판정을 지난다). 호출부가 파라미터 목록을 다시 적지 않는다.
 * ⚠ 걷을 것이 없으면 입력을 **그대로** 돌려준다 — 다시 조립하면 한글 쿼리(`?league=라리가`)의 표기가 바뀐다.
 * ⚠ 조각(`#access_token=…`)은 implicit 흐름의 복귀 값이라 그런 조각이면 통째로 버린다(이 앱은 PKCE라 오지 않는다).
 */
export function withoutAuthReturnParams(path: string): string {
  const hashAt = path.indexOf("#");
  const beforeHash = hashAt === -1 ? path : path.slice(0, hashAt);
  let hash = hashAt === -1 ? "" : path.slice(hashAt);
  if (/[#&](access_token|refresh_token|error|error_code|error_description)=/.test(hash)) hash = "";

  const queryAt = beforeHash.indexOf("?");
  if (queryAt === -1) return `${beforeHash}${hash}`;

  const pathname = beforeHash.slice(0, queryAt);
  const params = new URLSearchParams(beforeHash.slice(queryAt + 1));
  const found = AUTH_RETURN_PARAMS.filter((key) => params.has(key));
  if (found.length === 0) return `${beforeHash}${hash}`;

  for (const key of found) params.delete(key);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
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

    // OAuth 복귀 파라미터는 돌려줄 목적지에 싣지 않는다(`withoutAuthReturnParams`)
    const path = withoutAuthReturnParams(`${url.pathname}${url.search}${url.hash}`);
    // 정규화 결과 재검증 — 파서 동작에 기대지 않고 불변식을 직접 확인한다
    if (new URL(path, origin).origin !== origin) return null;
    return path;
  } catch {
    return null;
  }
}

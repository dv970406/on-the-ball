import { OAUTH_PROVIDERS, type OAuthProvider } from "@/shared/config";

/**
 * **마지막으로 로그인에 성공한 소셜 프로바이더** — 로그인 화면의 "최근 사용" 표시가 읽는다.
 *
 * ⚠ **왜 남기는가.** 카카오·구글이 서로 다른 이메일을 주면 supabase의 자동 연결
 *   (이메일 일치 + 검증)이 성립하지 않아 **같은 사람이 계정 2개를 갖는다**
 *   (`supabase/config.toml`의 `enable_manual_linking` 주석). 그런데 한 번 갈리고 나면
 *   `auth.identities`의 `(provider, provider_id)` 유니크 제약 때문에 **수동 연결도 실패한다** —
 *   즉 이 사고는 사후 수습이 불가능하고 **예방만 가능하다.** 갈리는 주된 원인이
 *   "저번에 뭘로 로그인했더라?"이므로 그 답을 로그인 화면에 적어 둔다.
 *
 * ⚠ **`sign-out-intent`와 달리 localStorage에 둔다.** 그쪽은 로그아웃 한 번 안에서만 유효한
 *   1회성 신호라 모듈 변수로 족하지만, 이 값은 **세션과 탭을 넘어 살아남아야** 뜻이 있다
 *   (다음 방문에 보여줄 값이다).
 *
 * ⚠ **힌트일 뿐 판정이 아니다.** 읽기·쓰기 모두 throw할 수 있고(사파리 프라이빗·사이트 데이터
 *   차단), 기기를 바꾸면 사라진다. 실패하면 조용히 "모름"으로 다룬다 — 배지가 안 뜰 뿐
 *   두 버튼은 그대로 눌린다.
 */
const STORAGE_KEY = "otb.auth.last-provider";

/**
 * ⚠ 저장값을 **읽을 때도 쓸 때도** 대조한다. `app_metadata.provider`는 소셜 둘로 한정되지
 *   않고(로컬 테스트 계정의 `email`이 그렇다), 저장소 값은 사용자가 직접 고칠 수 있다.
 *   `isPostCategory`와 같은 형태 — 런타임 배열이 그대로 입력 검증이 된다.
 */
function isOAuthProvider(value: unknown): value is OAuthProvider {
  return (
    typeof value === "string" && (OAUTH_PROVIDERS as readonly string[]).includes(value)
  );
}

/**
 * 로그인에 성공한 프로바이더를 기억한다.
 *
 * ⚠ **모르는 값은 지우지 않고 무시한다.** 로그아웃(session이 null)·이메일 로그인에도
 *   그대로 불리는데, 거기서 지워 버리면 **다음 로그인에 보여줄 값이 사라진다** —
 *   이 값의 쓸모는 정확히 "로그아웃한 뒤 다시 왔을 때"다.
 */
export function rememberAuthProvider(value: unknown): void {
  if (!isOAuthProvider(value)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 저장할 수 없는 환경 — 배지가 안 뜰 뿐이라 조용히 넘어간다
  }
}

/**
 * ⚠ **렌더 중에 부르지 않는다.** 서버에는 이 값이 없어 첫 렌더가 갈리면 하이드레이션이
 *   깨진다 — 호출부는 `useNowMs`와 같은 형태로 **마운트 이후에** 읽는다.
 */
export function readLastAuthProvider(): OAuthProvider | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isOAuthProvider(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * **사용자가 직접 로그아웃을 눌렀다**는 1회성 신호 — 가드가 목적지를 가르는 데만 쓴다.
 *
 * ⚠ **왜 신호가 필요한가.** `/profile`처럼 `AuthRequired` 아래 있는 화면에서 로그아웃하면
 *   세션이 사라지는 순간 `useRedirectGuestToSignIn`이 `/sign-in?next=/profile`로 보낸다.
 *   방금 나온 문을 다시 여는 셈인데, 그렇다고 **호출부에서 이동을 걸어 해결할 수 없다.**
 *   - `mutate` 성공 콜백: 그 시점엔 세션이 이미 사라져 `AuthRequired`가 children을
 *     스켈레톤으로 갈아치운 뒤라 **콜백 자체가 실행되지 않는다**(레이스가 아니라 파손).
 *   - `mutate` 직전 `router.replace`: 순서 보장이 없다. `signOut({ scope: "local" })`도
 *     `/logout` POST를 먼저 태우고(auth-js 2.110 `_signOut` → `admin.signOut` →
 *     `_removeSession` → SIGNED_OUT) 목적지는 DB를 타는 동적 라우트라, 어느 쪽이 먼저
 *     커밋될지 알 수 없다 — 나중 이동이 앞 이동을 취소하므로 **결과가 갈린다.**
 *   ("로그인 후 이동은 가드가 단독으로 소유한다"와 같은 사정의 반대편이다.)
 *   → 판정은 가드에 그대로 두고, 가드가 **"만료·비로그인 진입"과 "직접 로그아웃"을 가를**
 *     신호만 남긴다.
 *
 * ⚠ 세션 스토어에 넣지 않는다. 스토어는 supabase 세션의 **사본**이라 `applySession`을
 *   `AuthProvider`만 부른다는 규약이 걸려 있는데, 이 값은 세션이 아니라 이동 의도다.
 *   렌더가 읽지도 않는다(가드의 effect만 읽는다) → 상태일 이유가 없다.
 *
 * ⚠ 쓰는 쪽(`features/sign-out`의 이벤트 핸들러)도 읽는 쪽(가드의 effect)도 브라우저에서만
 *   돈다 — 서버에서 이 모듈의 값을 읽지 않는다.
 */
let intentional = false;

/** 로그아웃을 **시작하기 전에** 찍는다 — SIGNED_OUT보다 먼저여야 가드가 볼 수 있다. */
export function markSignOutIntent() {
  intentional = true;
}

/**
 * 신호를 읽고 **지운다** — 로그아웃 한 번에 한 번만 유효하다.
 * 남겨 두면 나중에 일어난 세션 만료까지 "직접 로그아웃"으로 오인한다.
 *
 * ⚠ 가드는 이 값만 보고 판정하지 않는다 — **쓰지 않을 때도 읽어서 버린다.**
 *   가드는 셋(`/profile`·`/posts/new`·`/posts/[id]/edit`)이라, 남은 신호를 다음 가드가
 *   먹으면 비로그인 사용자가 로그인 화면 대신 목록으로 되튕긴다.
 */
export function consumeSignOutIntent() {
  const value = intentional;
  intentional = false;
  return value;
}

/**
 * 로그아웃이 실패했거나 다시 로그인했을 때 — 소비되지 않은 신호를 버린다.
 *
 * 가드의 "이 화면에서 세션이 사라졌는가" 판정과 **서로 다른 구멍을 막는다.**
 * 그쪽은 비로그인으로 들어온 화면을, 이쪽은 **가드 없는 화면에서 로그아웃한 뒤 다시
 * 로그인해 둔 신호**를 막는다(그 상태로 세션이 만료되면 가드 판정이 오염된다).
 */
export function clearSignOutIntent() {
  intentional = false;
}

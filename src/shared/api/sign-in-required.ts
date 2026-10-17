/**
 * 로그인해야만 성립하는 조회·쓰기를 세션 없이(또는 다른 사람 명의로) 부르려 할 때 던지는 문구 — 훅의 이중 방어다
 * (실제 차단은 RLS·EXECUTE 권한, `data-and-state.md` 뮤테이션 절). 화면은 `error.message`를 노출만 하므로 문구를 한 곳에 둔다.
 * ⚠ 세션이 **만료돼 서버가 거부한** 쓰기는 이 문구가 아니라 `toWriteErrorMessage`의 "로그인이 만료됐어요"다.
 */
export const SIGN_IN_REQUIRED_MESSAGE = "로그인이 필요해요.";

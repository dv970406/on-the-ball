/**
 * 이 브라우저에 PKCE code_verifier가 남아 있는지 — 즉 **코드 교환이 성립할 수 있는지**.
 * 순수 함수라 서버에서도 쓸 수 있다("use client" 없음).
 *
 * ⚠ verifier는 교환 시도에서 성공·실패 무관하게 삭제된다(auth-js 2.110 `_exchangeCodeForSession`).
 *   그래서 다음 경우 auth-js는 교환을 **아예 시도하지 않고** 조용히 빠져나간다 —
 *   요청도 이벤트도 없으므로, 상한만 두면 그 시간을 통째로 빈 화면으로 버린다:
 *     · 교환이 한 번 실패한 뒤 새로고침
 *     · 복귀 URL을 다른 브라우저·시크릿 창에 붙여넣기
 *     · 카카오톡 인앱브라우저 → 시스템 브라우저 핸드오프
 *
 * ⚠ **판정을 서버에서 한다.** `@supabase/ssr`의 브라우저 클라이언트는 세션을 쿠키에 담으므로
 *   verifier도 요청 헤더에 실려 온다. 클라이언트 effect에서 보면 setState가 필요해지고
 *   (react-hooks/set-state-in-effect), 첫 렌더 결과가 서버와 갈려 하이드레이션도 위태롭다.
 *
 * ⚠ **supabase의 쿠키 이름에 결합한다**(`{storageKey}-code-verifier`). 이름이 바뀌면 이 함수는
 *   "없다"고 답하는데, 그때의 대가는 에러 문구가 조금 일찍 뜨는 것뿐이다 —
 *   교환이 실제로 성공하면 `GuestOnly`가 화면을 걷어간다.
 */
export function hasPkceVerifier(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => name.includes("-code-verifier"));
}

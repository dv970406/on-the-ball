/** 좋아요·댓글 수 등 숫자를 "28,412" 형태로 표기 */
export function formatCount(n: number): string {
  return n.toLocaleString("ko-KR");
}

/**
 * ISO 시각을 "8분 전" 형태로 표기. 7일 이후는 "N월 N일", 해가 다르면 "N년 N월 N일".
 *
 * ⚠ **`nowMs`를 인자로 받는 것이 규약이다** — `isHotPost(post, nowMs)`와 같은 형태이고,
 *   같은 이유다: 렌더는 순수해야 하는데 함수 안에서 시계를 읽으면 서버 렌더와
 *   하이드레이션이 **다른 값**을 만든다. 지배 변수는 SSR↔하이드레이션 지연이 아니라
 *   **사용자 기기의 시계 오차**다(서버는 NTP 동기 시각, 브라우저는 기기 시각).
 *
 * ⚠ **`nowMs`가 `null`이면(서버·하이드레이션 직전) 절대시각을 돌려준다.** 상대시각은
 *   기준 시각이 있어야만 계산할 수 있고, 없는 채로 추측하면 그 순간 불일치가 된다.
 *   호출부는 `useNowMs()`를 그대로 넘기면 되고, 마운트 직후 상대시각으로 바뀐다.
 *   ⚠ 크롤러는 JS를 실행하지 않을 수 있는데, **절대시각이 오히려 낫다** —
 *     "3분 전"은 크롤 시점에 굳어 버리는 값이라 색인에 남으면 거짓이 된다.
 *
 * ⚠ **연도를 생략해도 되는 건 올해 글뿐이다.** 전에는 무조건 "7월 30일"만 찍어서
 *   작년·재작년 글이 올해 글과 구분되지 않았다(`<time dateTime>` 속성은 정확한데
 *   화면 텍스트만 거짓말하는 상태였다).
 *   ⚠ `nowMs`가 없으면 "올해인가"를 알 수 없다 → 그때는 **항상 연도를 붙인다.**
 *     연도를 빼는 쪽이 거짓이 될 수 있는 방향이라, 모를 때는 붙이는 쪽이 안전하다.
 */
export function formatRelativeTime(iso: string, nowMs: number | null): string {
  const date = new Date(iso);
  const monthDay = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  const withYear = `${date.getFullYear()}년 ${monthDay}`;

  if (nowMs === null) return withYear;

  const diffMs = nowMs - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  return date.getFullYear() === new Date(nowMs).getFullYear() ? monthDay : withYear;
}

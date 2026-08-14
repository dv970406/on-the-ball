/** 좋아요·댓글 수 등 숫자를 "28,412" 형태로 표기 */
export function formatCount(n: number): string {
  return n.toLocaleString("ko-KR");
}

/**
 * ISO 시각을 "8분 전" 형태로 표기 (댓글 등). 7일 이후는 "N월 N일", 해가 다르면 "N년 N월 N일".
 * 클라이언트 쿼리 이후에만 렌더되는 곳에서 사용(hydration mismatch 없음).
 *
 * ⚠ **연도를 생략해도 되는 건 올해 글뿐이다.** 전에는 무조건 "7월 30일"만 찍어서
 *   작년·재작년 글이 올해 글과 구분되지 않았다(`<time dateTime>` 속성은 정확한데
 *   화면 텍스트만 거짓말하는 상태였다).
 */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  const monthDay = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === now.getFullYear()
    ? monthDay
    : `${date.getFullYear()}년 ${monthDay}`;
}

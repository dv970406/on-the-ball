/** 투표수 등 숫자를 "28,412" 형태로 표기 */
export function formatCount(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 0~1 비율을 "57%" 형태로 표기 */
export function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** 마감일까지 남은 일수를 "D-8" 형태로 표기 (지났으면 "마감") — 순수 표시용 */
export function formatDday(closesAt: string | Date): string {
  const diffMs = new Date(closesAt).getTime() - Date.now();
  const days = Math.ceil(diffMs / 86_400_000);
  return days > 0 ? `D-${days}` : "마감";
}

/**
 * 투표 마감 여부(비즈니스 판정). 표시용 formatDday의 반환 문자열에 의존하지 않는다.
 * closesAt이 없으면 마감 없음(false).
 */
export function isClosed(closesAt: string | null | undefined): boolean {
  return closesAt != null && new Date(closesAt).getTime() <= Date.now();
}

/**
 * 오늘 날짜(UTC, "YYYY-MM-DD"). Postgres current_date(DB 세션 tz)와 맞추기 위한 단일 소스.
 * ⚠ DB 타임존이 UTC라는 전제 — 다른 tz로 바꾸면 이 함수와 RPC의 날짜 경계가 어긋난다.
 */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * ISO 시각을 "8분 전" 형태로 표기 (댓글 등). 7일 이후는 "N월 N일".
 * 클라이언트 쿼리 이후에만 렌더되는 곳에서 사용(hydration mismatch 없음).
 */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

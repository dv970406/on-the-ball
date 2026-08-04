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

/** KST(UTC+9) 오프셋 — 한국은 서머타임이 없어 상수로 충분하다 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 오늘(한국 기준) 00:00의 ISO 시각. "오늘 N개의 글이 올라왔어요" 같은 하루 경계에 쓴다.
 *
 * ⚠ todayUtc를 쓰면 안 된다 — 그건 Postgres current_date와 맞추기 위한 값이라,
 *   한국 사용자에게는 **오전 0~9시 사이 "오늘"이 어제가 된다.**
 * ⚠ 내부에서 Date.now()를 부르므로 렌더 중에 호출하지 않는다(queryFn 안에서만).
 */
export function startOfTodaySeoul(): string {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  // UTC 게터로 읽으면 그 값이 곧 KST의 연·월·일이다
  const kstMidnightUtcMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  );
  return new Date(kstMidnightUtcMs - KST_OFFSET_MS).toISOString();
}

/**
 * ISO 시각을 "2024.03"(연.월) 형태로 표기 (가입일 등).
 * UTC 기준으로 뽑아 SSR·CSR 타임존 차이로 월이 어긋나지 않게 한다(todayUtc와 동일 전제).
 */
export function formatYearMonth(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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

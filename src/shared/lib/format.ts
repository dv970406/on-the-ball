/** 좋아요·댓글 수 등 숫자를 "28,412" 형태로 표기 */
export function formatCount(n: number): string {
  return n.toLocaleString("ko-KR");
}

/**
 * **이 앱의 벽시계는 한국 표준시로 고정한다.**
 *
 * ⚠ `new Date(iso).getMonth()`·`getHours()` 같은 접근자는 **런타임의 로컬 타임존**을 읽는다.
 *   그런데 서버(Vercel)는 UTC이고 브라우저는 KST라, 같은 `timestamptz`가 두 곳에서
 *   **다른 날짜·요일·시각**으로 그려진다(실측: `2026-11-03T19:30Z` → UTC "11월 3일 (화) 19:30"
 *   vs KST "11월 4일 (수) 04:30"). SSR 화면에서는 하이드레이션 텍스트 불일치가 되고,
 *   크롤러가 받는 HTML에는 **한국 사용자 기준으로 틀린 날짜**가 실린다.
 *   ⚠ **로컬 개발에서는 절대 재현되지 않는다** — dev 서버와 브라우저가 같은 기기라 TZ가 같다.
 *
 * ⚠ `nowMs`를 인자로 받는 규약이 막는 것은 **시계 오차**이지 **타임존 차이**가 아니다.
 *   둘은 다른 문제이고 둘 다 막아야 한다.
 *
 * 이 앱은 화면 문구·`toLocaleString("ko-KR")`까지 한국어 단일 로케일이므로 TZ도 하나로 못박는다.
 */
const TIME_ZONE = "Asia/Seoul";

/**
 * ⚠ `Intl.DateTimeFormat`은 생성 비용이 크다 — 모듈 스코프에 한 번만 만든다.
 * ⚠ `hourCycle: "h23"`이 필요하다. `hour12: false`만 주면 자정이 "24"로 나오는 구현이 있다.
 */
const PARTS = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface SeoulParts {
  year: number;
  month: number;
  day: number;
  /** "월"·"화" … (ko-KR short weekday는 한 글자다) */
  weekday: string;
  hour: string;
  minute: string;
}

/** 한국 시간 기준의 달력 조각 — 런타임 TZ와 무관하게 같은 값이 나온다 */
function seoulParts(date: Date): SeoulParts {
  const found: Record<string, string> = {};
  for (const { type, value } of PARTS.formatToParts(date)) found[type] = value;
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    weekday: found.weekday ?? "",
    hour: found.hour ?? "00",
    minute: found.minute ?? "00",
  };
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

  // ⚠ **상대시각 구간을 먼저 판정한다.** 이 구간은 차이(ms)만 쓰므로 달력 조각이 필요 없다 —
  //   위에서 계산해 두면 목록의 거의 모든 항목("3분 전"·"2시간 전")이 쓰지도 않을
  //   `formatToParts`를 치른다(실측 1.93µs → 0.14µs, 30건 목록 0.058ms → 0.004ms).
  //   절대값 자체는 작지만 이 함수는 글 카드·댓글마다 불리는 자리라 공짜인 절약은 취한다.
  if (nowMs !== null) {
    const minutes = Math.floor((nowMs - date.getTime()) / 60_000);
    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}일 전`;
  }

  // 여기부터가 절대 표기 — 달력 조각은 **KST 기준**이다(위 TIME_ZONE 주석).
  const p = seoulParts(date);
  const monthDay = `${p.month}월 ${p.day}일`;
  const withYear = `${p.year}년 ${monthDay}`;

  if (nowMs === null) return withYear;
  return p.year === seoulParts(new Date(nowMs)).year ? monthDay : withYear;
}


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

/**
 * 킥오프 시각을 "11월 3일 (일) 04:30"으로 표기. 해가 다르면 앞에 연도를 붙인다.
 *
 * ⚠ **`formatRelativeTime`을 쓸 수 없다.** 그 함수는 `nowMs - date`로 과거를 전제하는데
 *   킥오프는 대개 **미래**라 차이가 음수가 되어 전부 "방금 전"이 된다.
 *
 * ⚠ **요일을 함께 찍는다.** 축구 일정에서 요일은 장식이 아니라 정보다 — "11월 3일"만으로는
 *   주말 경기인지 알 수 없고, 사용자가 실제로 기억하는 단위가 요일이다.
 *
 * ⚠ `nowMs`를 받는 계약은 형제 함수와 같다 — **연도를 붙일지만** 그 값으로 정하고,
 *   `null`이면(서버·하이드레이션 직전) **항상 붙인다.** 연도를 빼는 쪽이 거짓이 될 수 있는
 *   방향이라 모를 때는 붙이는 쪽으로 기운다.
 */
export function formatKickoff(iso: string, nowMs: number | null): string {
  // ⚠ **런타임 TZ를 읽지 않는다** — 서버(UTC)와 브라우저(KST)가 다른 날짜를 그린다(위 주석).
  const p = seoulParts(new Date(iso));
  const base = `${p.month}월 ${p.day}일 (${p.weekday}) ${p.hour}:${p.minute}`;

  if (nowMs !== null && p.year === seoulParts(new Date(nowMs)).year) return base;
  return `${p.year}년 ${base}`;
}

/**
 * 한국 시간 기준의 달력 하루를 가리키는 키 — `"2026-09-05"`.
 *
 * 경기 목록을 날짜로 묶는 데 쓴다(`groupMatchesByDay`).
 *
 * ⚠ **표시 문구로 묶지 않는다.** `formatMatchDay`가 돌려주는 라벨은 해가 다른 같은 날짜에서
 *   똑같아지므로("9월 5일 (토)"), 그걸 키로 삼으면 1년 떨어진 두 경기가 한 그룹이 된다.
 * ⚠ 하루의 경계는 **KST**다 — 서버(UTC)에서 자르면 화면이 그리는 날짜와 어긋난다(위 주석).
 */
export function seoulDayKey(iso: string): string {
  const p = seoulParts(new Date(iso));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * 경기 목록의 날짜 헤딩 — `"오늘 (금)"` · `"내일 (토)"` · `"9월 5일 (토)"`.
 *
 * 카드마다 되풀이되던 날짜를 헤딩 하나로 접기 위한 표기라, **시각을 담지 않는다**
 * (시각은 카드가 `formatKickoffTime`으로 그린다).
 *
 * ⚠ **요일은 오늘·내일에도 붙인다.** 축구 일정에서 요일은 장식이 아니라 정보이고
 *   (`formatKickoff`과 같은 판단), 헤딩끼리 형태가 갈리면 목록이 들쭉날쭉해 보인다.
 * ⚠ `nowMs`가 `null`이면(서버·하이드레이션 직전) 오늘/내일을 판정할 수 없다 → 절대 날짜에
 *   **연도까지 붙인다.** 형제 함수들과 같은 계약이다 — 모를 때는 붙이는 쪽으로 기운다.
 * ⚠ **`formatKickoff`을 이걸로 바꾸지 않는다.** 상세는 공유·색인되는 페이지라 "오늘"이
 *   크롤 시점에 굳어 거짓이 된다(`formatRelativeTime` 주석이 남긴 판단).
 */
export function formatMatchDay(iso: string, nowMs: number | null): string {
  const p = seoulParts(new Date(iso));
  const suffix = `(${p.weekday})`;

  if (nowMs === null) return `${p.year}년 ${p.month}월 ${p.day}일 ${suffix}`;

  // ⚠ **날짜 차이를 ms로 재지 않는다.** `(kickoff - now) / 86400000`은 "24시간 뒤"를 재는
  //   것이라 오늘 23시와 내일 01시가 같은 날로 접힌다 — 우리가 세는 것은 **달력 하루**다.
  const today = seoulDayKey(new Date(nowMs).toISOString());
  const day = seoulDayKey(iso);
  if (day === today) return `오늘 ${suffix}`;
  // 내일은 "오늘 + 하루"의 키와 대조한다 — 월·연 넘김을 Date가 알아서 처리한다
  if (day === seoulDayKey(new Date(nowMs + 86_400_000).toISOString())) return `내일 ${suffix}`;

  const n = seoulParts(new Date(nowMs));
  const base = `${p.month}월 ${p.day}일 ${suffix}`;
  return p.year === n.year ? base : `${p.year}년 ${base}`;
}

/**
 * 킥오프의 시:분만 — `"23:00"`.
 *
 * 날짜를 헤딩이 갖는 목록 카드용이다. 날짜까지 함께 필요하면 `formatKickoff`을 쓴다.
 * ⚠ `nowMs`를 받지 않는다 — 연도를 붙일지 정할 일이 없어 기준 시각이 필요 없다.
 */
export function formatKickoffTime(iso: string): string {
  const p = seoulParts(new Date(iso));
  return `${p.hour}:${p.minute}`;
}

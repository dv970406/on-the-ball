/**
 * **한국 시각 날짜 키**(`YYYY-MM-DD`) — 날짜별 화면(`/transfers/daily/[date]`)의 주소 조각이자 하루의 경계.
 *
 * ⚠ 경계는 **한국 시각 고정 오프셋**(UTC+9 — 서머타임이 없다)으로 계산한다. `Date`의 지역 시각 메서드(`getDate()`)는
 *   서버(UTC)와 브라우저(기기 시간대)가 다른 날짜로 묶어 SSR 화면이 갈린다(`data-and-state.md` 하이드레이션 절).
 * ⚠ 주소는 영구 계약이다 — 같은 날을 가리키는 별칭 URL이 생기지 않게 **엄격한 한 표기만** 받는다(`2026-10-07`).
 *   `2026-10-7`·`2026-1007`·`2026-02-30`은 키가 아니다(`parsePostId`가 `002`를 거부하는 것과 같은 이유).
 * ⚠ 순수 함수다(`"use client"` 없음) — 서버 page·사이트맵이 직접 경로(`@/shared/lib/date-key`)로 가져간다.
 */

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 하루 — 키와 그 날의 시작·끝(UTC ms, 끝은 다음 날의 시작이라 포함하지 않는다) */
export interface KstDay {
  key: string;
  startMs: number;
  endMs: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 시각(ms)이 속한 한국 시각 날짜의 키 */
export function kstDateKey(ms: number): string {
  const d = new Date(ms + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 키 → 하루. 표기가 틀렸거나 달력에 없는 날이면 `null` */
export function parseKstDateKey(value: string): KstDay | null {
  const m = DATE_KEY.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utcMidnight = Date.UTC(year, month - 1, day);
  // 달력에 없는 날(`02-30`)은 `Date.UTC`가 다음 달로 넘긴다 — 되읽어 같은 키인지로 거른다
  const startMs = utcMidnight - KST_OFFSET_MS;
  if (kstDateKey(startMs) !== value) return null;
  return { key: value, startMs, endMs: startMs + DAY_MS };
}

/**
 * 키 → 읽는 날짜 `2026년 10월 7일 (수)`. 키가 아니면 키를 그대로 돌려준다.
 * ⚠ 연도를 늘 붙인다 — 색인·공유되는 화면의 제목이라 "올해인가"를 보는 사람의 시계에 맡기지 않는다(`reuse.md`의 `formatRelativeTime` 절).
 */
export function kstDateLabel(key: string, { weekday = true }: { weekday?: boolean } = {}): string {
  const day = parseKstDateKey(key);
  if (!day) return key;
  // 시작 시각에 오프셋을 더해 UTC로 읽으면 곧 한국 시각의 달력이다
  const d = new Date(day.startMs + KST_OFFSET_MS);
  const label = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return weekday ? `${label} (${WEEKDAYS[d.getUTCDay()]})` : label;
}

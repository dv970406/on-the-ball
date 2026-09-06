/**
 * `<input type="datetime-local">` ↔ ISO 변환.
 *
 * ⚠ **`datetime-local`에는 타임존이 없다.** 값은 "YYYY-MM-DDTHH:mm"이고 브라우저가 어떤
 *   시간대에 있든 그대로 온다. `new Date(value)`로 파싱하면 **브라우저 로컬 시간대**로
 *   해석되는데, 이 앱의 화면은 전부 KST로 그린다(`shared/lib/format`의 `TIME_ZONE`).
 *   해외에서 접속한 관리자가 킥오프를 넣으면 화면 표기와 몇 시간씩 어긋난다.
 *   → **양방향을 KST로 못박는다.**
 *
 * ⚠ **`shared/lib`에 있는 이유**: 승부예측(킥오프)·입축구(마감)·공지(노출 기간) 셋이 같은
 *   변환을 쓰는데 features끼리는 import할 수 없다. 도메인을 모르는 순수 메커니즘이라
 *   이 자리가 맞다(`resizeToWebp`가 올라온 것과 같은 판단).
 *
 * ⚠ KST는 DST가 없어 언제나 UTC+9다 — 그래서 오프셋을 문자열로 붙이는 것이 정확하다.
 *   (DST가 있는 지역이면 이 방식이 성립하지 않는다.)
 */
const KST_OFFSET = "+09:00";

const KST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO 시각 → 입력창 값(KST 기준). 값이 없으면 빈 문자열 */
export function toKstInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = KST_PARTS.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  /*
   * ⚠ **자정을 "24"로 내는 런타임이 있다**(ICU 구현에 따라 갈린다). 그대로 두면 입력창이
   *   값을 거부하는데, 시각만 "00"으로 바꾸면 **날짜가 하루 어긋난다** — `24:00`은 그 날짜의
   *   *다음* 날 자정이기 때문이다. 그래서 시각을 고칠 때 날짜도 하루 민다.
   *   (현재 Node/ICU에서는 "00" + 다음 날짜가 나와 이 분기가 돌지 않는다 — 그래서 더욱,
   *    돌게 되는 날 조용히 틀리지 않도록 정확히 짜 둔다.)
   */
  if (pick("hour") === "24") {
    const nextDay = new Date(date.getTime() + 60 * 1000);
    const next = KST_PARTS.formatToParts(nextDay);
    const pickNext = (type: Intl.DateTimeFormatPartTypes) =>
      next.find((part) => part.type === type)?.value ?? "";
    return `${pickNext("year")}-${pickNext("month")}-${pickNext("day")}T00:${pick("minute")}`;
  }
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}

/** 입력창 값(KST 기준) → ISO 시각. 비었거나 형식이 어긋나면 `null` */
export function fromKstInputValue(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00${KST_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

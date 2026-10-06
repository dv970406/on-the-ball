import { env } from "@/shared/config";

/**
 * 분석 이벤트 카탈로그 — **이름과 파라미터의 단일 소스.**
 *
 * 이름은 GA4 규칙(소문자 snake_case, 40자 이내)을 따르고, GA4 권장 이벤트가 있으면 그 이름을 쓴다
 * (`login`·`share`). 파라미터 값은 숫자·불리언·짧은 문자열만 — 닉네임·이메일·댓글 본문처럼 사람을
 * 가리키거나 사용자가 쓴 글은 싣지 않는다.
 *
 * ⚠ 화면 조회(`page_view`)는 여기 없다 — gtag가 주소 변화를 스스로 센다(보드 필터의 `pushState`도 포함).
 */
export interface AnalyticsEvents {
  /** 소셜 로그인 버튼을 눌러 프로바이더로 넘어간다 */
  sign_in_start: { method: string };
  /** 로그인이 끝나 목적지로 이동한다(GA4 권장 이벤트) */
  login: { method: string };
  /** 관심 목록에 담았다(`watched: true`) / 뺐다 */
  watch_toggle: { deal_id: number; watched: boolean };
  /** 응원 구단으로 골랐다(`following: true`) / 풀었다 */
  club_follow: { club_code: string; following: boolean };
  /** 댓글·답글을 등록했다 */
  comment_write: { deal_id: number; is_reply: boolean };
  /** 댓글에 표를 던졌다 — 1 좋아요 · -1 싫어요 · 0 거두기 */
  comment_vote: { deal_id: number; value: number };
  /** 딜 성사를 예측했다(`will_happen` — true 성사 · false 불발). 같은 창에서 고른 것을 바꿔도 센다 */
  deal_predict: { deal_id: number; will_happen: boolean };
  /** 링크를 공유했다(GA4 권장 이벤트) — `method`는 OS 공유 시트(`sheet`) 또는 복사(`clipboard`) */
  share: { method: "sheet" | "clipboard"; content_type: string };
  /** 알림을 켰다 — `source`는 켠 자리(프로필 · 딜 상세의 안내) */
  push_enable: { source: "profile" | "deal" };
  /** 알림을 껐다 */
  push_disable: { source: "profile" };
  /** 알림 권한 요청이 거절됐다 */
  push_denied: { source: "profile" | "deal" };
}

declare global {
  interface Window {
    /** 루트 layout의 `GoogleAnalytics`가 심는 전역 — 스크립트가 아직 안 왔으면 없다 */
    gtag?: (command: "event", name: string, params: Record<string, unknown>) => void;
  }
}

/**
 * 주소에 OAuth 복귀 파라미터(`?code=`)가 남아 있으면 그것을 걷어 낸 주소를 이벤트의 `page_location`으로 준다.
 * gtag는 이벤트마다 지금 주소를 함께 보내는데, 로그인 완료(`login`)는 코드 교환 직후 — 주소에 일회용 코드가
 * 아직 남아 있는 순간에 나간다(실측). 이미 쓴 코드라 재사용은 안 되지만 인증 값을 분석 도구에 쌓지 않는다.
 */
function locationWithoutAuthCode(): { page_location: string } | undefined {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("code")) return undefined;
  url.searchParams.delete("code");
  return { page_location: url.toString() };
}

/**
 * 분석 이벤트를 보낸다 — **이벤트는 이 함수로만 보낸다.**
 *
 * - 측정 ID(`env.gaId`)가 없으면 아무것도 하지 않는다(로컬·프리뷰).
 * - gtag가 아직 내려오지 않았으면 그 이벤트는 버린다 — 사용자의 동작을 분석 스크립트 뒤에 줄 세우지 않는다.
 * - 실패해도 던지지 않는다. 분석이 기능을 막으면 안 된다.
 *
 * ⚠ **뮤테이션의 성공은 그 훅의 `onSuccess`에서 보낸다** — 호출부마다 기억해야 하는 계측은 빠진다
 *   (성공 토스트와 같은 자리다). 누른 횟수가 아니라 **일어난 일**을 센다.
 * ⚠ `@next/third-parties/google`의 `sendGAEvent`를 여기서 import하지 않는다 — 그 패키지는 CJS 배럴이라
 *   털리지 않고, 이 모듈은 `@/shared/lib` 배럴을 타는 모든 화면에 실린다. 전역 `gtag`를 부르면 의존이 없다.
 */
export function track<K extends keyof AnalyticsEvents>(name: K, params: AnalyticsEvents[K]): void {
  if (!env.gaId || typeof window === "undefined") return;
  try {
    window.gtag?.("event", name, { ...params, ...locationWithoutAuthCode() });
  } catch (e) {
    console.error("[analytics] 이벤트 전송 실패:", e);
  }
}

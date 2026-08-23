import type { Survey } from "../model/types";

/**
 * 아직 참여할 수 있는 서베이인가.
 *
 * ⚠ **`nowMs`를 인자로 받는 것이 규약이다** — `isHotPost(post, nowMs)`와 같은 이유다.
 *   매퍼에 넣으면 순수·서버 안전이 깨지고 같은 행이 호출 시점마다 달라진다.
 *   호출부는 `useNowMs()`를 넘기고, **`null`인 프레임은 "아직 판정 전"** 으로 다룬다
 *   (`false`로 접으면 첫 프레임에 멀쩡한 서베이가 "마감됨"으로 보인다).
 *
 * ⚠ `new Date(문자열)`은 시계를 읽지 않아 렌더 중 호출해도 순수하다
 *   (규약이 금지하는 것은 인자 없는 `new Date()`·`Date.now()`다).
 *
 * ⚠ **이 판정은 안내일 뿐 방어가 아니다.** `useNowMs`가 마운트 시각에 고정되므로 탭을
 *   오래 열어 두면 경계를 넘는 순간을 놓치는데, 그때 투표하면 `survey_is_open` 정책이
 *   막고 훅이 한국어 에러로 바꾼다(zod가 UX이지 방어가 아닌 것과 같은 층위다).
 */
export function isSurveyOpen(survey: Pick<Survey, "closesAt">, nowMs: number): boolean {
  return new Date(survey.closesAt).getTime() > nowMs;
}

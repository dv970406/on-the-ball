import type { Database } from "@/types/database.types";

export type SurveyRow = Database["public"]["Tables"]["survey"]["Row"];
export type SurveyOptionRow = Database["public"]["Tables"]["survey_option"]["Row"];
export type SurveyVoteRow = Database["public"]["Tables"]["survey_vote"]["Row"];

export interface SurveyOption {
  id: SurveyOptionRow["id"];
  label: SurveyOptionRow["label"];
  sortOrder: SurveyOptionRow["sort_order"];
  /** 분할 카드의 부제("GOAT, 좌발"). 없으면 이름만 그린다 */
  subtitle: SurveyOptionRow["subtitle"];
  /**
   * 면 배경 이미지의 **버킷 안 경로**. 있으면 색보다 우선한다.
   * ⚠ 전체 URL이 아니다 — 조립은 `surveyImageUrl()`(`@/shared/config`) 한 곳에서만.
   * ⚠ `bgColor`를 대체하지 않는다 — 이미지가 뜨기 전·실패했을 때 깔릴 배경이고,
   *   분할 카드 판별자도 여전히 색이다(`splitCount`).
   */
  imagePath: SurveyOptionRow["image_path"];
  /**
   * 분할 카드에서 이 면이 쓸 배경·글자색(`#rrggbb`).
   *
   * ⚠ **이 값의 유무가 곧 "분할 카드로 그릴 문항인가"의 판별자다** — layout 컬럼을 따로
   *   두지 않는 이유는 마이그레이션 20260823000001 주석에 있다. 판정은 직접 짜지 말고
   *   `splitCount`(lib/split-layout)를 쓴다.
   * ⚠ DB CHECK가 **둘을 쌍으로 강제**하므로 한쪽만 null인 상태는 존재하지 않는다.
   */
  bgColor: SurveyOptionRow["bg_color"];
  textColor: SurveyOptionRow["text_color"];
}

export interface Survey {
  id: SurveyRow["id"];
  title: SurveyRow["title"];
  /**
   * 마감 시각. **판정은 `isSurveyOpen(survey, nowMs)`가 소유한다** — 렌더 중 시계를 읽지
   * 않기 위해서다(`isHotPost(post, nowMs)`와 같은 형태).
   * ⚠ 클라이언트 판정은 안내일 뿐이고 **실제 차단은 `survey_is_open` 정책**이 한다.
   */
  closesAt: SurveyRow["closes_at"];
  /** `sort_order` 오름차순 */
  options: SurveyOption[];
  /**
   * 내가 고른 선택지. 비로그인·미참여면 `null`.
   * ⚠ `survey_vote`의 SELECT 정책이 "내 행만"이라 임베딩 결과가 곧 이 값이다
   *   (`post_like`·`post_poll_vote`와 같은 트릭).
   */
  myOptionId: SurveyVoteRow["option_id"] | null;
}

/**
 * 목록 한 줄이 그리는 값 — 목록도 상세와 **같은 카드·같은 분기**를 쓰므로 `Survey`를 넓힌다.
 *
 * ⚠ **`answered` 같은 파생 필드를 따로 두지 않는다.** `myOptionId !== null`이 그 사실이고,
 *   같은 사실을 두 필드가 말하면 한쪽만 갱신되는 순간이 생긴다(낙관적 업데이트가 그 자리다).
 * ⚠ **참여자 수가 없다.** 득표수 컬럼을 두지 않아(마이그레이션 20260823000001 머리말)
 *   집계를 세려면 `survey_results`를 거쳐야 하는데 그건 참여자에게만 열린다 —
 *   목록에서 부르면 미참여자에게는 0이 나가 화면이 거짓말을 한다.
 */
export interface SurveyListItem extends Survey {
  createdAt: SurveyRow["created_at"];
}

/**
 * 선택지별 득표수.
 *
 * ⚠ **득표수는 컬럼이 아니다.** `survey_results` 함수가 그때그때 세고, **참여한 사람에게만**
 *   돌려준다 — 미참여자에게는 0행이 온다. 그래서 도메인 타입에서도 `Survey`와 분리해 둔다:
 *   "선택지는 있는데 결과는 아직 없다"가 정상 상태다.
 */
export interface SurveyResult {
  optionId: SurveyOptionRow["id"];
  voteCount: number;
}

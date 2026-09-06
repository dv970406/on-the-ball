import type {
  AdminSurvey,
  Survey,
  SurveyOption,
  SurveyListItem,
  SurveyOptionRow,
  SurveyResult,
  SurveyRow,
  SurveyVoteRow,
} from "../model/types";

/**
 * 목록 상한.
 * ⚠ **화면이 잘림을 안내해야 한다** — 조용히 자르면 그 뒤 항목은 URL을 아는 사람 말고는
 *   도달할 방법이 없다(`POST_LIST_LIMIT`과 같은 규약).
 *
 * ⚠ **`api/queries.ts`가 아니라 여기 있다.** 그 파일은 `"use client"`라 서버가 import할 수
 *   없는데, 목록 SSR 프리페치가 같은 상한을 써야 한다(`POST_LIST_LIMIT`과 같은 이유).
 */
export const SURVEY_LIST_LIMIT = 30;

/**
 * 선택지 컬럼 — 목록·상세가 **같은 형태**를 받아야 한다.
 * 히어로(목록)와 상세가 같은 `SplitCard`를 그리므로, 한쪽만 컬럼을 늘리면 같은 카드가
 * 화면마다 다르게 그려진다.
 */
const OPTION_COLUMNS = "id, label, sort_order, subtitle, image_path, bg_color, text_color";

/**
 * PostgREST select 문자열의 단일 소스 — 스키마가 바뀌면 여기 한 곳만 고친다.
 *
 * ⚠ **득표수가 여기 없다.** 컬럼이 아니라 `survey_results` 함수가 세고, 참여한 사람에게만
 *   열린다. 여기에 넣으려고 컬럼을 만들면 게이팅이 무너진다(`POLL_SELECT`와 같은 판단).
 *
 * ⚠ `survey_vote` 임베딩은 SELECT 정책이 "내 행만"이라 **배열 길이가 곧 "내가 참여했는가"** 다.
 *   목록에도 이게 실려야 카드가 "참여 완료"를 그릴 수 있다.
 */
export const SURVEY_LIST_SELECT =
  `id, title, created_at, closes_at, survey_option(${OPTION_COLUMNS}), survey_vote(option_id)`;

/**
 * ⚠ **`survey` 아래에 두 자식을 나란히** 둔다. `survey_option` 밑에 `survey_vote`를 3단으로
 *   중첩하면 복합 FK(`(survey_id, option_id) → survey_option`) 추론에 기대게 되는데, 둘 다
 *   `survey(id)`를 향하는 **단일 컬럼 FK**로 잡으면 평범한 관계 추론으로 끝난다.
 *   (그래서 `survey_vote`에 논리적으로 중복인 단일 FK를 일부러 선언해 두었다 —
 *    마이그레이션 20260823000001 주석 참고. 지우면 이 select가 깨진다.)
 */
export const SURVEY_SELECT =
  `id, title, closes_at, survey_option(${OPTION_COLUMNS}), survey_vote(option_id)`;

/** OPTION_COLUMNS가 돌려주는 행 */
type SurveyOptionSelectRow = Pick<
  SurveyOptionRow,
  "id" | "label" | "sort_order" | "subtitle" | "image_path" | "bg_color" | "text_color"
>;

/** ⚠ 정렬을 DB order에 맡기지 않는다 — 임베딩된 자식의 순서는 보장되지 않는다 */
function buildOptions(rows: SurveyOptionSelectRow[] | null): SurveyOption[] {
  return (rows ?? [])
    .map((o) => ({
      id: o.id,
      label: o.label,
      sortOrder: o.sort_order,
      subtitle: o.subtitle,
      imagePath: o.image_path,
      bgColor: o.bg_color,
      textColor: o.text_color,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** SURVEY_LIST_SELECT가 돌려주는 행 — 컬럼 타입은 생성 타입에서 뽑는다 */
export interface SurveyListSelectRow {
  id: SurveyRow["id"];
  title: SurveyRow["title"];
  closes_at: SurveyRow["closes_at"];
  created_at: SurveyRow["created_at"];
  /** SELECT 정책이 "내 행만"이라 길이가 0 또는 1이다 */
  survey_option: SurveyOptionSelectRow[] | null;
  survey_vote: Pick<SurveyVoteRow, "option_id">[] | null;
}

/** SURVEY_SELECT가 돌려주는 행 */
export interface SurveySelectRow {
  id: SurveyRow["id"];
  title: SurveyRow["title"];
  closes_at: SurveyRow["closes_at"];
  survey_option: SurveyOptionSelectRow[] | null;
  survey_vote: Pick<SurveyVoteRow, "option_id">[] | null;
}

export function buildSurveyListItem(row: SurveyListSelectRow): SurveyListItem {
  return {
    id: row.id,
    title: row.title,
    closesAt: row.closes_at,
    createdAt: row.created_at,
    options: buildOptions(row.survey_option),
    myOptionId: row.survey_vote?.[0]?.option_id ?? null,
  };
}

export function buildSurvey(row: SurveySelectRow): Survey {
  return {
    id: row.id,
    title: row.title,
    closesAt: row.closes_at,
    options: buildOptions(row.survey_option),
    myOptionId: row.survey_vote?.[0]?.option_id ?? null,
  };
}

/** `survey_results` RPC의 행 → 도메인 */
export function buildSurveyResult(row: { option_id: number; vote_count: number }): SurveyResult {
  return { optionId: row.option_id, voteCount: row.vote_count };
}

/*
 * 어드민 목록·수정 화면용 select·매퍼.
 *
 * ⚠ **`api/queries.ts`·`api/admin-queries.ts`가 아니라 여기 있다.** 그 파일들은
 *   `"use client"`라 서버가 import할 수 없는데, "매핑은 `api/mappers.ts`(순수·서버 안전)에서"가
 *   규약이다(`ADMIN_MATCH_SELECT`가 `entities/match`에서 같은 자리에 있다).
 */
export const ADMIN_SURVEY_LIMIT = 100;
export const ADMIN_SURVEY_SELECT =
  "id, title, closes_at, created_at, updated_at, deleted_at" as const;
export const ADMIN_OPTION_SELECT =
  "id, label, sort_order, subtitle, image_path, bg_color, text_color" as const;

export function buildAdminSurvey(row: {
  id: number;
  title: string;
  closes_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}): AdminSurvey {
  return {
    id: row.id,
    title: row.title,
    closesAt: row.closes_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * DB(snake_case) → 퀴즈 도메인 타입(camelCase) 매퍼.
 * ⚠ Route Handler에서 import하는 파일 — "use client" 금지.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LineupCell,
  QuizChoice,
  QuizLineup,
  QuizSummary,
} from "../model/types";

// ---------------------------------------------------------------------------
// select 컬럼 상수 (라우트들이 재사용)
// ---------------------------------------------------------------------------

/** quizzes — answer_text는 컬럼 권한이 없어 select * 하면 에러. 반드시 명시 */
export const QUIZ_SELECT =
  "id, slug, kind, title, subtitle, hint, lineup_id, opens_on, created_at";

/** quiz_choices — is_correct·seed_picks는 컬럼 권한이 없어(정답 역산 방지) 반드시 명시 */
export const QUIZ_CHOICE_SELECT = "id, quiz_id, position, team, season";

export const LINEUP_SELECT = "id, formation, caption, rows";

export const QUIZ_STATS_SELECT = "quiz_id, attempts, accuracy_pct";

export const QUIZ_CHOICE_STATS_SELECT = "quiz_id, choice_id, picks";

export const QUIZ_REVEAL_SELECT = "quiz_id, choice_id, is_correct, answer_text";

// ---------------------------------------------------------------------------
// DB 행 타입
// ---------------------------------------------------------------------------

/** quizzes 테이블 행 (공개 컬럼만) — id는 정수, slug는 공개 식별자 */
export interface QuizRow {
  id: number;
  slug: string;
  kind: string;
  title: string;
  subtitle: string | null;
  hint: string | null;
  lineup_id: number | null;
  opens_on: string;
  created_at: string;
}

/** quiz_choices 테이블 행 (공개 컬럼만) */
export interface QuizChoiceRow {
  id: number;
  quiz_id: number;
  position: number;
  team: string;
  season: string | null;
}

/** lineups 테이블 행 — rows: GK줄부터 4줄 11셀 jsonb (lineup_id로만 조회, slug 미사용) */
export interface LineupRow {
  id: number;
  formation: string;
  caption: string | null;
  rows: LineupCell[][];
}

/** quiz_stats 뷰 행 — 도전자 수·정답률 집계 */
export interface QuizStatsRow {
  quiz_id: number;
  attempts: number;
  accuracy_pct: number;
}

/** quiz_choice_stats 뷰 행 — 보기별 픽 수 (시드 + 실픽 합) */
export interface QuizChoiceStatsRow {
  quiz_id: number;
  choice_id: number;
  picks: number;
}

/** quiz_attempts 테이블 행 (RLS로 본인 행만 조회됨) */
export interface QuizAttemptRow {
  quiz_id: number;
  choice_id: number;
  is_correct: boolean;
}

/** quiz_reveal 뷰 행 — 해당 퀴즈를 시도한 유저에게만 행이 보임 */
export interface QuizRevealRow {
  quiz_id: number;
  choice_id: number;
  is_correct: boolean;
  answer_text: string | null;
}

// ---------------------------------------------------------------------------
// 매핑 함수
// ---------------------------------------------------------------------------

/** slug → quiz 정수 id 해석 (없으면 null). 실패 시 throw. */
export async function resolveQuizIdBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("quizzes")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as { id: number }).id : null;
}

/** quiz_choice_stats 행들을 choice_id → picks 맵으로 변환 */
export function buildPicksByChoice(
  rows: QuizChoiceStatsRow[],
): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of rows) map.set(row.choice_id, row.picks);
  return map;
}

/** quizzes + quiz_stats + 내 시도 → QuizSummary */
export function buildQuizSummary(
  quiz: QuizRow,
  stats: QuizStatsRow | undefined,
  myAttempt: QuizAttemptRow | undefined,
): QuizSummary {
  return {
    id: quiz.slug,
    kind: quiz.kind,
    title: quiz.title,
    subtitle: quiz.subtitle,
    opensOn: quiz.opens_on,
    attempts: stats?.attempts ?? 0,
    accuracyPct: stats?.accuracy_pct ?? 0,
    myResult: myAttempt ? (myAttempt.is_correct ? "correct" : "wrong") : null,
  };
}

/** quiz_choices + 픽 집계 → QuizChoice[] (position asc, 비율 포함) */
export function buildQuizChoices(
  choiceRows: QuizChoiceRow[],
  picksByChoice: Map<number, number>,
): QuizChoice[] {
  const sorted = [...choiceRows].sort((a, b) => a.position - b.position);
  const totalPicks = sorted.reduce(
    (sum, row) => sum + (picksByChoice.get(row.id) ?? 0),
    0,
  );

  return sorted.map((row) => {
    const picks = picksByChoice.get(row.id) ?? 0;
    return {
      id: row.id,
      position: row.position,
      team: row.team,
      season: row.season,
      picks,
      // 비율 = 픽 / 전체 (전체 0이면 0)
      pickRatio: totalPicks === 0 ? 0 : picks / totalPicks,
    };
  });
}

/** lineups 행 → QuizLineup */
export function mapLineup(row: LineupRow): QuizLineup {
  return {
    formation: row.formation,
    caption: row.caption,
    rows: row.rows,
  };
}

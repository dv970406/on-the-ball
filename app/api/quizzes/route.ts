import { fail, ok, withSupabase } from "@/shared/api/handler";
import { todayUtc } from "@/shared/lib/format";
import {
  QUIZ_SELECT,
  QUIZ_STATS_SELECT,
  buildQuizSummary,
  type QuizAttemptRow,
  type QuizRow,
  type QuizStatsRow,
} from "@/entities/quiz/api/mappers";
import type { QuizListData, QuizSummary } from "@/entities/quiz/model/types";

/**
 * GET /api/quizzes — 퀴즈 리스트
 * opens_on 기준: 오늘 → today / 미래 → upcoming(잠금) / 과거 → past(보관함).
 * answer_text·is_correct는 컬럼 권한이 없어 select 컬럼을 반드시 명시한다.
 */
export async function GET() {
  return withSupabase(async ({ supabase, user }) => {
    // 1) 퀴즈 + 집계(도전자 수·정답률) 병렬 조회
    const [quizzesRes, statsRes] = await Promise.all([
      supabase
        .from("quizzes")
        .select(QUIZ_SELECT)
        .order("opens_on", { ascending: false }),
      supabase.from("quiz_stats").select(QUIZ_STATS_SELECT),
    ]);
    if (quizzesRes.error || statsRes.error) {
      return fail(500, "퀴즈 목록을 불러오지 못했어요.");
    }

    const quizzes = (quizzesRes.data ?? []) as QuizRow[];
    const statsByQuiz = new Map(
      ((statsRes.data ?? []) as QuizStatsRow[]).map((s) => [s.quiz_id, s]),
    );

    // 2) 내 도전 기록 (RLS로 본인 행만 조회됨 — 세션 없으면 생략)
    const attemptByQuiz = new Map<number, QuizAttemptRow>();
    if (user && quizzes.length > 0) {
      const { data: attemptData, error: attemptsError } = await supabase
        .from("quiz_attempts")
        .select("quiz_id, choice_id, is_correct")
        .eq("user_id", user.id);
      if (attemptsError) return fail(500, "퀴즈 목록을 불러오지 못했어요.");
      for (const row of (attemptData ?? []) as QuizAttemptRow[]) {
        attemptByQuiz.set(row.quiz_id, row);
      }
    }

    // 3) opens_on 기준 분류 — ISO 날짜 문자열이라 사전순 비교가 곧 날짜 비교
    const today = todayUtc();
    let todayQuiz: QuizSummary | null = null;
    const upcoming: QuizSummary[] = [];
    const past: QuizSummary[] = [];

    for (const quiz of quizzes) {
      const summary = buildQuizSummary(
        quiz,
        statsByQuiz.get(quiz.id),
        attemptByQuiz.get(quiz.id),
      );
      if (quiz.opens_on === today) todayQuiz = todayQuiz ?? summary;
      else if (quiz.opens_on > today) upcoming.push(summary);
      else past.push(summary);
    }

    // 예정은 가까운 날짜부터, 지난 문제는 최신부터 (원 정렬이 desc라 예정만 뒤집음)
    upcoming.reverse();

    return ok<QuizListData>({ today: todayQuiz, upcoming, past });
  });
}

import type { NextRequest } from "next/server";
import { fail, ok, withSupabase } from "@/shared/api/handler";
import {
  LINEUP_SELECT,
  QUIZ_CHOICE_SELECT,
  QUIZ_CHOICE_STATS_SELECT,
  QUIZ_REVEAL_SELECT,
  QUIZ_SELECT,
  QUIZ_STATS_SELECT,
  buildPicksByChoice,
  buildQuizChoices,
  mapLineup,
  type LineupRow,
  type QuizAttemptRow,
  type QuizChoiceRow,
  type QuizChoiceStatsRow,
  type QuizRevealRow,
  type QuizRow,
  type QuizStatsRow,
} from "@/entities/quiz/api/mappers";
import type { QuizDetailData, QuizMyAttempt } from "@/entities/quiz/model/types";
import { todayUtc } from "@/shared/lib/format";

/**
 * GET /api/quizzes/[id] — 퀴즈 디테일 (라인업 + 보기 + 내 도전 기록)
 * 정답 정보(correctChoiceId/answerText)는 시도한 유저에게만 보이는
 * quiz_reveal 뷰에서 채운다 — 치팅 방지 설계.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withSupabase(async ({ supabase, user }) => {
    const { data: quizData, error: quizError } = await supabase
      .from("quizzes")
      .select(QUIZ_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (quizError) return fail(500, "퀴즈를 불러오지 못했어요.");
    if (!quizData) return fail(404, "퀴즈를 찾을 수 없어요.");

    const quiz = quizData as QuizRow;

    // 미래 문제는 잠금 — 보기·라인업 노출 금지
    if (quiz.opens_on > todayUtc()) {
      return fail(423, "아직 열리지 않은 문제예요. 매일 오전 8시에 새 문제가 열려요.");
    }

    // 보기·집계·라인업·내 시도·리빌 병렬 조회
    // quiz_reveal은 시도한 유저에게만 행이 보이므로 미시도면 빈 결과가 온다
    const [choicesRes, choiceStatsRes, statsRes, lineupRes, attemptRes, revealRes] =
      await Promise.all([
        supabase
          .from("quiz_choices")
          .select(QUIZ_CHOICE_SELECT)
          .eq("quiz_id", id)
          .order("position", { ascending: true }),
        supabase
          .from("quiz_choice_stats")
          .select(QUIZ_CHOICE_STATS_SELECT)
          .eq("quiz_id", id),
        supabase
          .from("quiz_stats")
          .select(QUIZ_STATS_SELECT)
          .eq("quiz_id", id)
          .maybeSingle(),
        quiz.lineup_id
          ? supabase
              .from("lineups")
              .select(LINEUP_SELECT)
              .eq("id", quiz.lineup_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        user
          ? supabase
              .from("quiz_attempts")
              .select("quiz_id, choice_id, is_correct")
              .eq("quiz_id", id)
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        user
          ? supabase.from("quiz_reveal").select(QUIZ_REVEAL_SELECT).eq("quiz_id", id)
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (
      choicesRes.error ||
      choiceStatsRes.error ||
      statsRes.error ||
      lineupRes.error ||
      attemptRes.error ||
      revealRes.error
    ) {
      return fail(500, "퀴즈를 불러오지 못했어요.");
    }

    const stats = (statsRes.data ?? null) as QuizStatsRow | null;
    const lineupRow = (lineupRes.data ?? null) as LineupRow | null;
    const attemptRow = (attemptRes.data ?? null) as QuizAttemptRow | null;

    // 내 도전 기록이 있으면 quiz_reveal에서 정답·해설을 채움
    let myAttempt: QuizMyAttempt | null = null;
    if (attemptRow) {
      const revealRows = (revealRes.data ?? []) as QuizRevealRow[];
      const correctRow = revealRows.find((row) => row.is_correct) ?? null;
      myAttempt = {
        choiceId: attemptRow.choice_id,
        isCorrect: attemptRow.is_correct,
        correctChoiceId: correctRow?.choice_id ?? null,
        answerText: correctRow?.answer_text ?? revealRows[0]?.answer_text ?? null,
      };
    }

    return ok<QuizDetailData>({
      id: quiz.id,
      kind: quiz.kind,
      title: quiz.title,
      subtitle: quiz.subtitle,
      hint: quiz.hint,
      opensOn: quiz.opens_on,
      attempts: stats?.attempts ?? 0,
      accuracyPct: stats?.accuracy_pct ?? 0,
      lineup: lineupRow ? mapLineup(lineupRow) : null,
      choices: buildQuizChoices(
        (choicesRes.data ?? []) as QuizChoiceRow[],
        buildPicksByChoice((choiceStatsRes.data ?? []) as QuizChoiceStatsRow[]),
      ),
      myAttempt,
    });
  });
}

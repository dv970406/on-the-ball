import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok, withSupabase } from "@/shared/api/handler";
import {
  QUIZ_CHOICE_SELECT,
  QUIZ_CHOICE_STATS_SELECT,
  buildPicksByChoice,
  buildQuizChoices,
  resolveQuizIdBySlug,
  type QuizChoiceRow,
  type QuizChoiceStatsRow,
} from "@/entities/quiz/api/mappers";
import type { QuizAttemptResult, QuizChoice } from "@/entities/quiz/model/types";

const bodySchema = z.object({
  choiceId: z.number().int().positive(),
});

/** submit_quiz_attempt RPC의 raise exception 메시지 → HTTP 응답 매핑 */
const RPC_ERROR_MAP: [needle: string, status: number, message: string][] = [
  ["AUTH_REQUIRED", 401, "로그인 세션이 필요해요."],
  ["QUIZ_NOT_FOUND", 404, "퀴즈를 찾을 수 없어요."],
  ["QUIZ_LOCKED", 423, "아직 열리지 않은 문제예요."],
  ["INVALID_CHOICE", 400, "올바르지 않은 보기예요."],
  ["ALREADY_ATTEMPTED", 409, "이미 도전한 문제예요."],
];

/** RPC(submit_quiz_attempt) 반환 jsonb 형태 */
type RpcResult = {
  is_correct: boolean;
  correct_choice_id: number | null;
  answer_text: string | null;
  streak: number;
};

/**
 * POST /api/quizzes/[id]/attempts — 정답 제출 (body: { choiceId })
 * 판정·중복 방지·오픈일 검증·스트릭 증감은 submit_quiz_attempt RPC가 원자 처리.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: slug } = await params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400, "choiceId가 필요해요.");

  return withSupabase(async ({ supabase, user }) => {
    // RPC도 AUTH_REQUIRED를 던지지만, 세션 없음은 왕복 전에 차단
    if (!user) return fail(401, "로그인 세션이 필요해요.");

    // [id]는 slug — 정수 quiz id로 해석
    const quizId = await resolveQuizIdBySlug(supabase, slug);
    if (quizId === null) return fail(404, "퀴즈를 찾을 수 없어요.");

    const { data, error } = await supabase.rpc("submit_quiz_attempt", {
      p_quiz_id: quizId,
      p_choice_id: parsed.data.choiceId,
    });

    if (error) {
      // supabase error.message에 RPC 예외 문자열이 포함됨 — includes로 판별
      const message = error.message ?? "";
      for (const [needle, status, userMessage] of RPC_ERROR_MAP) {
        if (message.includes(needle)) return fail(status, userMessage);
      }
      return fail(500, "정답 제출 중 오류가 발생했어요.");
    }

    const result = data as RpcResult;

    // 내 픽이 반영된 최신 선택률 — 실패해도 제출 자체는 성공이므로 빈 배열로 응답
    // (클라이언트는 빈 배열이면 디테일 재조회 값으로 대체)
    let choices: QuizChoice[] = [];
    const [choicesRes, choiceStatsRes] = await Promise.all([
      supabase
        .from("quiz_choices")
        .select(QUIZ_CHOICE_SELECT)
        .eq("quiz_id", quizId)
        .order("position", { ascending: true }),
      supabase
        .from("quiz_choice_stats")
        .select(QUIZ_CHOICE_STATS_SELECT)
        .eq("quiz_id", quizId),
    ]);
    if (!choicesRes.error && !choiceStatsRes.error) {
      choices = buildQuizChoices(
        (choicesRes.data ?? []) as QuizChoiceRow[],
        buildPicksByChoice((choiceStatsRes.data ?? []) as QuizChoiceStatsRow[]),
      );
    }

    return ok<QuizAttemptResult>({
      isCorrect: result.is_correct,
      correctChoiceId: result.correct_choice_id,
      answerText: result.answer_text,
      streak: result.streak,
      choices,
    });
  });
}

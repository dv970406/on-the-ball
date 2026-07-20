import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok, withSupabase } from "@/shared/api/handler";
import { resolvePollIdBySlug } from "@/entities/poll/api/mappers";
import type { CastVoteResult } from "@/entities/poll/model/types";

const bodySchema = z.object({
  optionId: z.number().int().positive(),
});

/** cast_vote RPC의 raise exception 메시지 → HTTP 응답 매핑 */
const RPC_ERROR_MAP: [needle: string, status: number, message: string][] = [
  ["AUTH_REQUIRED", 401, "로그인 세션이 필요해요."],
  ["POLL_NOT_FOUND", 404, "투표를 찾을 수 없어요."],
  ["INVALID_OPTION", 400, "올바르지 않은 선택지예요."],
  ["POLL_CLOSED", 409, "마감된 투표예요."],
  ["CHANGE_LIMIT", 409, "투표 변경은 한 번만 가능해요."],
  ["CHANGE_WINDOW_OVER", 409, "투표 후 24시간이 지나 변경할 수 없어요."],
];

/**
 * POST /api/polls/[id]/votes — 투표하기 (body: { optionId })
 * 쓰기 정책(중복 방지·마감·kit 재탭 취소·24h 내 1회 변경)은 cast_vote RPC가 원자 처리.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: slug } = await params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400, "optionId가 필요해요.");

  return withSupabase(async ({ supabase, user }) => {
    // RPC도 AUTH_REQUIRED를 던지지만, 세션 없음은 왕복 전에 차단
    if (!user) return fail(401, "로그인 세션이 필요해요.");

    // [id]는 slug — 정수 poll id로 해석
    const pollId = await resolvePollIdBySlug(supabase, slug);
    if (pollId === null) return fail(404, "투표를 찾을 수 없어요.");

    const { data, error } = await supabase.rpc("cast_vote", {
      p_poll_id: pollId,
      p_option_id: parsed.data.optionId,
    });

    if (error) {
      // supabase error.message에 RPC 예외 문자열이 포함됨 — includes로 판별
      const message = error.message ?? "";
      for (const [needle, status, userMessage] of RPC_ERROR_MAP) {
        if (message.includes(needle)) return fail(status, userMessage);
      }
      return fail(500, "투표 처리 중 오류가 발생했어요.");
    }

    const result = data as {
      status: CastVoteResult["status"];
      option_id?: number | null;
    };

    return ok<CastVoteResult>({
      status: result.status,
      optionId: result.option_id ?? null,
    });
  });
}

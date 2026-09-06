"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { useToast } from "@/shared/lib";
import { matchKeys } from "@/entities/match";

export interface AdminMatchInput {
  season: string;
  matchday: number;
  homeTeam: string;
  awayTeam: string;
  /** ISO 시각 */
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  voided: boolean;
}

/**
 * ⚠ **무효화가 `matchKeys.all`이다.** 어드민 캐시(`admin`)와 일반 캐시(목록·상세·분포)가
 *   같은 prefix 아래 있어 한 번에 정리된다 — 어드민이 킥오프를 고치면 `/matches`의 표시도
 *   따라 바뀌어야 한다.
 * ⚠ 무효화 Promise를 **반환한다** — 저장 후 화면에 머무르므로 리페치가 끝날 때까지
 *   `isPending`을 유지해 연타를 막는다(`data-and-state.md`의 표).
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: matchKeys.all });
}

export function useUpdateMatch(matchId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (input: AdminMatchInput) => {
      const supabase = requireBrowserSupabase();
      /*
       * ⚠ **스코어는 `null` 대신 "넣지 않음"으로 보낸다.** Postgres 함수 인자는 언제나
       *   nullable인데 supabase 생성기가 그 사실을 표현하지 못해 타입이 `number`다.
       *   함수 쪽에 `default null`을 둬서 선택 인자로 만들었으므로, 결과가 없는 경기는
       *   키 자체를 빼면 DB가 null로 채운다(캐스트로 타입을 속이지 않는다).
       * ⚠ 두 값은 DB CHECK가 쌍으로 묶으므로 **함께** 넣거나 함께 뺀다 — 폼 검증이 이미
       *   그 규칙을 막고, 여기서도 형태로 드러낸다.
       */
      const scores =
        input.homeScore === null || input.awayScore === null
          ? {}
          : { p_home_score: input.homeScore, p_away_score: input.awayScore };

      const { error } = await supabase.rpc("admin_update_match", {
        p_id: matchId,
        p_season: input.season,
        p_matchday: input.matchday,
        p_home_team: input.homeTeam,
        p_away_team: input.awayTeam,
        p_kickoff_at: input.kickoffAt,
        p_voided: input.voided,
        ...scores,
      });
      if (error) {
        console.error("[admin-match] 경기 수정 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

export function useUnlockMatch() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (matchId: number) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_unlock_match", { p_id: matchId });
      if (error) {
        console.error("[admin-match] 동기화 잠금 해제 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

export function useDeleteMatch() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (matchId: number) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_soft_delete_match", { p_id: matchId });
      if (error) {
        console.error("[admin-match] 경기 삭제 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

export function useRestoreMatch() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (matchId: number) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_restore_match", { p_id: matchId });
      if (error) {
        console.error("[admin-match] 경기 복구 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

export interface SyncMatchesResult {
  season: string;
  teams: { saved: number; failed: number };
  matches: { saved: number; failed: number; skipped: number; locked: number; aborted: boolean };
  api: { used: number; dayRemaining: number | null };
  warnings: string[];
  durationMs: number;
}

/**
 * 경기 일정 가져오기.
 *
 * ⚠ **이 앱의 유일한 Route Handler를 부른다.** API-Football 키와 service_role 키가 서버
 *   비밀이라 브라우저가 제공자를 직접 부를 수 없다 — 금지 규약의 근거("중간 검증층 없이
 *   RLS가 방어한다")가 외부 API 호출에는 닿지 않는 자리다.
 * ⚠ **부분 실패는 200 + 필드로 온다.** 상태 코드로 접으면 여기서 삼켜 "성공"이 된다 →
 *   화면이 `failed`·`warnings`를 읽어 알린다.
 */
export function useSyncMatches() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (): Promise<SyncMatchesResult> => {
      const response = await fetch(ROUTES.adminSyncMatches, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // 쿠키 세션으로 인가한다(핸들러가 getUser → is_admin 순으로 확인)
        credentials: "same-origin",
      });

      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "일정을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.";
        console.error("[admin-match] 동기화 실패:", response.status, body);
        throw new Error(message);
      }
      return body as SyncMatchesResult;
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

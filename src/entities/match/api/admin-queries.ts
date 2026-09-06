"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { ADMIN_MATCH_SELECT, buildAdminMatch } from "./mappers";
import { matchKeys } from "./keys";
import type { AdminMatch } from "../model/types";

/** 어드민 목록의 상한 — 운영 화면이라 일반 목록(지난 10·다가오는 20)보다 넓게 본다 */
const ADMIN_MATCH_LIMIT = 200;

/**
 * 어드민 경기 목록.
 *
 * ⚠ **테이블이 아니라 `admin_match_list` RPC를 부른다.** `match_select_alive` 정책이 삭제된
 *   경기를 감추므로 테이블 조회로는 어드민도 그것을 볼 수 없다. 정책에 `or is_admin()`을
 *   얹지 않은 이유는 그러면 관리자의 `/matches`·적중률까지 남들과 달라지기 때문이다.
 * ⚠ 비관리자에게는 에러가 아니라 **0행**이 온다.
 */
export function useAdminMatchListQuery(deleted: boolean | null) {
  return useQuery({
    queryKey: matchKeys.adminList(deleted),
    queryFn: async (): Promise<AdminMatch[]> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .rpc("admin_match_list", deleted === null ? {} : { p_deleted: deleted })
        .select(ADMIN_MATCH_SELECT)
        .order("kickoff_at", { ascending: false })
        .limit(ADMIN_MATCH_LIMIT);

      if (error) {
        console.error("[match] 어드민 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildAdminMatch);
    },
  });
}

/** 어드민 경기 단건 — 목록과 같은 RPC를 id로 좁힌다 */
export function useAdminMatchQuery(matchId: number) {
  return useQuery({
    queryKey: matchKeys.adminDetail(matchId),
    queryFn: async (): Promise<AdminMatch | null> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .rpc("admin_match_list")
        .select(ADMIN_MATCH_SELECT)
        .eq("id", matchId)
        // 0행이 정상이다(없는 id·비관리자) → single()이면 PGRST116이 에러로 섞인다
        .maybeSingle();

      if (error) {
        console.error("[match] 어드민 단건 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildAdminMatch(data) : null;
    },
    enabled: Number.isSafeInteger(matchId) && matchId > 0,
  });
}

/** 팀 선택 목록 — `team`은 비로그인에게도 공개라 정책을 지나지 않는다 */
export function useTeamListQuery() {
  return useQuery({
    queryKey: matchKeys.teams(),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("team")
        .select("code, name, short_name")
        .order("name");

      if (error) {
        console.error("[match] 팀 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map((t) => ({ code: t.code, name: t.name, shortName: t.short_name }));
    },
    // 팀은 시즌 단위로만 바뀐다 — 화면을 옮길 때마다 다시 받을 이유가 없다
    staleTime: 10 * 60 * 1000,
  });
}

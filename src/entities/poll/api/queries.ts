"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import type { Poll, PollResult } from "../model/types";
import { pollKeys } from "./keys";
import { POLL_SELECT, buildPoll, buildPollResult } from "./mappers";

/**
 * 글에 딸린 투표 — 없으면 `null`을 돌려준다(대부분의 글에 투표가 없다).
 *
 * ⚠ 상세 화면이 이 쿼리를 **항상** 쏜다. 투표 유무를 미리 알 방법이 없어서인데,
 *   `post`에 `has_poll` 같은 컬럼을 두면 트리거로 관리해야 할 값이 하나 더 생긴다
 *   (`like_count`가 어긋났던 그 종류다) — 요청 1건이 더 싸다.
 *
 * ⚠ **세션이 확정되기 전에는 부르지 않는다**(`enabled`). 키가 userId로 스코프돼 있어서,
 *   복원 중에 `undefined`로 한 번 조회하면 세션이 선 뒤 키가 바뀌며 **투표 블록이
 *   언마운트됐다 다시 마운트된다** — 로그인 사용자의 매 상세 진입에서 레이아웃이 두 번 튄다.
 */
export function usePollQuery(postId: number, userId: string | undefined, enabled = true) {
  return useQuery<Poll | null, Error>({
    queryKey: pollKeys.detail(postId, userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("poll")
        .select(POLL_SELECT)
        .eq("post_id", postId)
        // 투표가 없는 글이 정상이다 — single()이면 PGRST116으로 "없음"과 진짜 에러가 섞인다
        .maybeSingle();

      if (error) {
        console.error("[poll] 투표 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildPoll(data) : null;
    },
    enabled: enabled && Number.isSafeInteger(postId) && postId > 0,
  });
}

/**
 * 선택지별 득표수 — **투표한 사람에게만** 열린다(미투표자에게는 0행이 온다).
 *
 * ⚠ 게이팅이 화면이 아니라 DB에 있다. v1은 수치를 항상 내려주고 UI에서만 가려
 *   "실제로는 게이팅이 아니었다"(`docs/legacy/v1-inventory.md` 판단 #4).
 * ⚠ `enabled`는 최적화일 뿐 방어가 아니다 — 꺼도 `poll_results`가 0행을 돌려준다.
 *   비로그인은 EXECUTE 권한 자체가 없다.
 */
export function usePollResultsQuery(postId: number, userId: string | undefined, enabled: boolean) {
  return useQuery<PollResult[], Error>({
    queryKey: pollKeys.results(postId, userId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase.rpc("poll_results", { p_post_id: postId });

      if (error) {
        console.error("[poll] 집계 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildPollResult);
    },
    enabled: enabled && Number.isSafeInteger(postId) && postId > 0,
  });
}

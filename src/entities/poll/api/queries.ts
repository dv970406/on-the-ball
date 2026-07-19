"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api";
import type { PollComment, PollDetail, PollListItem, PollType } from "../model/types";

/** poll 도메인 쿼리 키 팩토리 — 무효화는 상위 키로(예: lists()) 한 번에 */
export const pollQueryKeys = {
  all: ["polls"] as const,
  lists: () => [...pollQueryKeys.all, "list"] as const,
  list: (type?: PollType) => [...pollQueryKeys.lists(), type ?? "all"] as const,
  details: () => [...pollQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...pollQueryKeys.details(), id] as const,
  comments: (pollId: string) => [...pollQueryKeys.all, "comments", pollId] as const,
};

/** 투표 리스트 — type 미지정 시 전체 (position asc) */
export function usePollsQuery(type?: PollType) {
  return useQuery({
    queryKey: pollQueryKeys.list(type),
    queryFn: () =>
      apiFetch<PollListItem[]>(type ? `/api/polls?type=${type}` : "/api/polls"),  });
}

/** 투표 디테일 — 응답자 분석·댓글 수 포함 */
export function usePollDetailQuery(id: string) {
  return useQuery({
    queryKey: pollQueryKeys.detail(id),
    queryFn: () => apiFetch<PollDetail>(`/api/polls/${id}`),
    enabled: id.length > 0,  });
}

/** "한 줄 거들기" 댓글 목록 (최신순) */
export function usePollCommentsQuery(pollId: string) {
  return useQuery({
    queryKey: pollQueryKeys.comments(pollId),
    queryFn: () => apiFetch<PollComment[]>(`/api/polls/${pollId}/comments`),
    enabled: pollId.length > 0,
  });
}

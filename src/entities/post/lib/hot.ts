import type { PostListItem } from "../model/types";

/**
 * HOT 배지 판정. 순수 함수라 서버에서도 import할 수 있다("use client" 없음).
 *
 * DB에 hot 플래그가 없어 파생값이다. 다만 **매퍼에서 계산하지 않는다** — 두 가지 이유:
 *   1. mappers.ts는 순수·서버 안전 파일인데 Date.now()가 들어가면 같은 행에 대해
 *      다른 값을 내는 비순수 함수가 된다.
 *   2. 더 실질적으로는 **캐시 고착**이다. fetch 시점에 계산한 값이 gcTime 동안 얼어붙어
 *      25시간째 글이 HOT을 달고 남는다.
 *
 * ⚠ nowMs를 인자로 받는다 — 함수 안에서 시계를 읽지 않아야 순수하고, 나중에 서버
 *   프리페치를 붙일 때 formatRelativeTime과 **한 곳에서 함께** "서버 기준 시각 주입"으로
 *   전환할 수 있다(data-and-state.md의 처방).
 */

export const HOT_LIKE_THRESHOLD = 20;
export const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isHotPost(
  post: Pick<PostListItem, "likeCount" | "createdAt">,
  nowMs: number,
): boolean {
  if (post.likeCount < HOT_LIKE_THRESHOLD) return false;
  return nowMs - new Date(post.createdAt).getTime() < HOT_WINDOW_MS;
}

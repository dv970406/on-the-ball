"use client";

import { type Poll, usePollQuery } from "@/entities/poll";
import { useSessionStore } from "@/entities/session";

interface UsePostPollArgs {
  postId: number;
  /** 서버가 미리 조회한 투표 — `null`은 "투표 없는 글", `undefined`는 "프리페치 안 함" */
  initialPoll?: Poll | null;
  /** 서버가 본 로그인 사용자 */
  initialUserId?: string;
}

/**
 * 글에 딸린 투표의 **조회·대기 판정**을 소유한다.
 *
 * 서베이 상세(`views/survey-detail/model/use-survey-detail.ts`)와 같은 형태·같은 이유다 —
 * 세션 상태와 서버가 내려준 prop이 서로를 조건으로 삼는 판정이라, 뷰 본문에 두면 같은
 * 판정이 두 화면에서 갈린다. 실제로 서베이 쪽만 훅으로 나가 있고 여기만 남아 있었다.
 *
 * ⚠ `pollKeys.detail`이 **userId로 스코프**돼 있다. `myOptionId`도 집계도 "나"에 종속된
 *   값이라 상세를 연 채 계정이 바뀌면 이전 사용자의 선택이 남기 때문이다(`identityKeys`와
 *   같은 이유). 그래서 **세션 복원 전에는 서버가 알려준 사용자를 키로 쓴다** — 키가 갈리면
 *   서버가 채운 캐시에 닿지 못해 블록이 한 번 스켈레톤으로 되돌아간다.
 * ⚠ 쿠키가 같으니 복원 후 값도 같다. 다르면(세션 만료) 키가 바뀌며 리페치되는데,
 *   그건 서버가 부정된 상황이라 다시 받는 것이 맞다.
 * ⚠ **프리페치가 있으면 복원을 기다리지 않는다**(`enabled`를 열어 둔다) — 기다리면 서버가
 *   그린 HTML을 스켈레톤으로 덮어 SSR이 헛일이 된다.
 */
export function usePostPoll({ postId, initialPoll, initialUserId }: UsePostPollArgs) {
  const sessionStatus = useSessionStore((s) => s.status);
  const storeUserId = useSessionStore((s) => s.user?.id);
  const userId = sessionStatus === "loading" ? initialUserId : storeUserId;

  const { data: poll, error } = usePollQuery(
    postId,
    userId,
    initialPoll !== undefined || sessionStatus !== "loading",
    initialPoll,
  );

  return { poll, error };
}

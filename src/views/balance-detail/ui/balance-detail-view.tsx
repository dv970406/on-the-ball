"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import { EmptyState, Skeleton } from "@/shared/ui";
import { isClosed, useDelayedReveal } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import { pickSides, usePollDetailQuery } from "@/entities/poll";
import { useCastVote } from "@/features/cast-vote";
import { SubHeader } from "@/widgets/sub-header";
import { BalanceVoteView } from "./balance-vote-view";
import { BalanceRevealView } from "./balance-reveal-view";

type Side = "a" | "b";

/**
 * 밸런스 디테일 루트 — 투표 전(BalanceVoteView) ↔ 결과(BalanceRevealView) 전환.
 * 탭 → 380ms 선택 강조 → 리빌. 이미 투표했거나 마감된 폴은 즉시 리빌 뷰.
 */
export function BalanceDetailView({ id }: { id: string }) {
  const { data: poll, isPending, error } = usePollDetailQuery(id);
  const castVote = useCastVote(id);
  const { revealed, trigger, reset } = useDelayedReveal(380);

  // 이번 세션에서 탭한 면 (380ms 강조 + 리빌 마커에 사용)
  const [picked, setPicked] = useState<Side | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  const sides = poll ? pickSides(poll.options) : null;

  if (isPending || error || !poll || !sides) {
    return (
      <div className="min-h-full bg-canvas">
        <SubHeader title="밸런스 게임" fallbackHref={ROUTES.balanceList} />
        {isPending ? (
          <BalanceDetailSkeleton />
        ) : (
          <EmptyState
            icon={Scale}
            title="투표를 불러오지 못했어요"
            description={error ? error.message : "선택지 정보가 올바르지 않아요."}
          />
        )}
      </div>
    );
  }

  const { a, b } = sides;
  const closed = isClosed(poll.closesAt);

  // 서버에 기록된 내 표 → 면 환산
  const serverSide: Side | null =
    poll.myVote === a.id ? "a" : poll.myVote === b.id ? "b" : null;

  // 이번 세션 투표는 "380ms 경과 + 서버 기록 성공"을 모두 만족해야 리빌
  // (느린 네트워크에서 실패할 투표가 결과부터 노출되는 레이스 방지)
  const votedLocally = picked !== null;
  const showReveal = votedLocally
    ? revealed && castVote.isSuccess
    : serverSide !== null || closed;

  const handlePick = (side: Side) => {
    if (votedLocally || showReveal || closed) return;
    setPicked(side);
    setVoteError(null);
    castVote.mutate(side === "a" ? a.id : b.id, {
      onError: (err) => {
        // 실패 시 투표 전 상태로 복귀 + 메시지 인라인 노출
        reset();
        setPicked(null);
        setVoteError(err.message);
      },
    });
    trigger();
  };

  return (
    <div className="min-h-full bg-canvas">
      <SubHeader title={poll.tag ?? "밸런스 게임"} fallbackHref={ROUTES.balanceList} />
      {showReveal ? (
        <BalanceRevealView poll={poll} a={a} b={b} mySide={picked ?? serverSide} />
      ) : (
        <BalanceVoteView
          poll={poll}
          a={a}
          b={b}
          picked={picked}
          onPick={handlePick}
          voteError={voteError}
        />
      )}
    </div>
  );
}

/** 로딩 스켈레톤 — 메타 줄 + 헤드라인 + 3/4 스플릿 카드 구조 유지 */
function BalanceDetailSkeleton() {
  return (
    <div className="px-5 pb-6 pt-3">
      <div className="mb-2.5 flex items-center gap-2">
        <Skeleton className="h-[21px] w-16 rounded-full" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <Skeleton className="mb-1.5 h-7 w-4/5" />
      <Skeleton className="mb-[18px] h-3.5 w-3/5" />
      <Skeleton className="aspect-[3/4] w-full rounded-[18px]" />
      <div className="mt-3 flex justify-center">
        <Skeleton className="h-3.5 w-56" />
      </div>
    </div>
  );
}

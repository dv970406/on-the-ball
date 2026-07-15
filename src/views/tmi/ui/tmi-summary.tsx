"use client";

import { RotateCw } from "lucide-react";
import type { PollListItem } from "@/entities/poll";
import { Button } from "@/shared/ui";
import { isMajoritySide, type TmiSide } from "../model/deck";

type TmiSummaryProps = {
  deck: PollListItem[];
  /** poll.id → 이번 세션에서 판정한 면 (서버 myVote 반영 전 보정용) */
  sideOf: (poll: PollListItem) => TmiSide | null;
  onReview: () => void;
};

/** 덱 완료 요약 — 다수 의견 일치 수 + 결과 다시 보기 */
export function TmiSummary({ deck, sideOf, onReview }: TmiSummaryProps) {
  const judged = deck.filter((poll) => sideOf(poll) !== null);
  const matched = judged.filter((poll) => {
    const side = sideOf(poll);
    return side !== null && isMajoritySide(poll, side);
  }).length;

  return (
    <div className="animate-fade-up px-5 py-10 text-center">
      <div className="mx-auto mb-4 flex size-[72px] items-center justify-center rounded-full bg-primary text-[28px] font-bold text-on-primary tnum">
        {matched}
      </div>
      <h2 className="mb-1.5 text-[22px] font-semibold tracking-[-0.4px] text-ink">
        다수 의견과 {matched}개 일치
      </h2>
      <p className="mb-5 text-[13px] leading-relaxed text-ink-mute">
        총 {deck.length}개 중. 판정한 카드는 다시 투표할 수 없어요 — 결과만 넘겨볼 수 있어요.
      </p>
      <Button variant="dark" icon={RotateCw} onClick={onReview} aria-label="결과 다시 보기">
        결과 다시 보기
      </Button>
    </div>
  );
}

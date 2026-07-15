"use client";

import { Info } from "lucide-react";
import { Icon, LiveDot, Pill } from "@/shared/ui";
import { formatCount, formatDday } from "@/shared/lib";
import { SplitCard, type PollDetail, type PollOption } from "@/entities/poll";

type Side = "a" | "b";

type BalanceVoteViewProps = {
  poll: PollDetail;
  a: PollOption;
  b: PollOption;
  /** 탭한 면 — 380ms 강조 구간 동안 선택 면이 떠오른다 */
  picked: Side | null;
  onPick: (side: Side) => void;
  /** 투표 실패 시 인라인 노출할 메시지 (ApiError.message) */
  voteError: string | null;
};

/** 투표 전 화면 — 메타 pill 줄 + 헤드라인 + 대각선 스플릿 + 안내/인포 스트립 */
export function BalanceVoteView({ poll, a, b, picked, onPick, voteError }: BalanceVoteViewProps) {
  return (
    <div className="px-5 pb-6 pt-3">
      {/* 메타 pill 줄 */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Pill variant="green">
          <LiveDot color="#171717" />
          진행 중
        </Pill>
        <span className="whitespace-nowrap text-[12px] text-ink-mute">
          <span className="tnum font-mono text-ink">{formatCount(poll.totalVotes)}</span>명 투표
        </span>
        {poll.closesAt ? (
          <>
            <span className="text-[12px] text-ink-mute-2">·</span>
            <span className="whitespace-nowrap text-[12px] text-ink-mute">
              마감 {formatDday(poll.closesAt)}
            </span>
          </>
        ) : null}
      </div>

      {/* 헤드라인 + 서브카피 */}
      <h1 className="mb-1.5 text-[24px] font-bold leading-[1.2] tracking-[-0.5px] text-ink">
        {poll.title}
      </h1>
      {poll.subtitle ? (
        <p className="mb-[18px] text-[13px] leading-[1.45] text-ink-mute">{poll.subtitle}</p>
      ) : (
        <div className="mb-[18px]" />
      )}

      {/* 대각선 스플릿 — 탭 = 투표 */}
      <SplitCard a={a} b={b} aspect="3/4" showLatin animateVs picked={picked} onPick={onPick} />

      <p className="mt-3 text-center text-[12px] text-ink-mute-2">
        한쪽 카드를 탭하면 즉시 한 표 반영돼요.
      </p>

      {/* 투표 실패 인라인 메시지 */}
      {voteError ? (
        <p role="alert" className="mt-2 text-center text-[12px] text-crimson">
          {voteError}
        </p>
      ) : null}

      {/* 인포 스트립 — 결과/댓글 게이팅 안내 */}
      <div className="mt-[18px] flex items-start gap-2.5 rounded-lg border border-hairline-cool bg-canvas-soft p-3.5">
        <Icon as={Info} size={16} className="mt-0.5 shrink-0 text-ink-mute" />
        <p className="text-[12px] leading-normal text-ink-mute">
          결과 그래프는 투표한 사람만 볼 수 있어요. 댓글은 결과 공개 후에 열려요.
        </p>
      </div>
    </div>
  );
}

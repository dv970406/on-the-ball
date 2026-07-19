import Link from "next/link";
import { Trophy } from "lucide-react";
import { Icon, LiveStatusPill, Pill, SectionHead, Shirt } from "@/shared/ui";
import { cn, formatCount, formatDday, isClosed } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import type { PollListItem } from "@/entities/poll";
import { readHomeCardMeta } from "../model/poll-meta";

/** 타입별 디테일 경로 — 홈 ongoing 섹션은 ranking/kit만 담는다 */
function detailHref(poll: PollListItem): string {
  return poll.type === "ranking"
    ? ROUTES.rankingDetail(poll.id)
    : ROUTES.kitDetail(poll.id);
}

/**
 * 진행 중인 투표 행 — 프로토타입 PollListCard 재현.
 * 80px 커버 썸네일(ranking=다크+옐로 트로피 / kit=유니폼 미니) + 제목 + 투표수·마감.
 */
function OngoingPollCard({ poll }: { poll: PollListItem }) {
  const card = readHomeCardMeta(poll.meta);

  return (
    <Link
      href={detailHref(poll)}
      aria-label={`${card.title ?? poll.title} 투표 상세로 이동`}
      className="flex items-start gap-3.5 rounded-xl border border-hairline bg-canvas p-4"
    >
      {/* 80px 커버 썸네일 */}
      <span
        className={cn(
          "flex size-20 shrink-0 items-center justify-center rounded-[10px] border border-hairline-cool",
          poll.type === "ranking"
            ? "bg-canvas-night text-accent-yellow"
            : "bg-canvas-soft",
        )}
      >
        {poll.type === "ranking" ? (
          <Icon as={Trophy} size={32} />
        ) : (
          <Shirt tone="var(--color-primary)" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        {/* 상태 pill 줄 — 내가 투표한 폴이면 '참여함' */}
        <span className="mb-2 flex flex-wrap gap-1.5">
          <LiveStatusPill>진행 중</LiveStatusPill>
          {poll.tag ? <Pill variant="soft">{poll.tag}</Pill> : null}
          {poll.myVote ? <Pill variant="soft">참여함</Pill> : null}
        </span>

        {/* 제목 — 홈 카드 전용 문구(meta.card.title) 우선 */}
        <span className="mb-1.5 block text-[16px] font-semibold leading-[1.3] tracking-[-0.3px] text-ink">
          {card.title ?? poll.title}
        </span>

        <span className="block text-[12px] text-ink-mute">
          <span className="tnum font-mono text-ink">{formatCount(poll.totalVotes)}</span>명
          투표
          {/* 마감이 지나면 "마감 마감"이 되지 않도록 단독 표기 */}
          {poll.closesAt
            ? isClosed(poll.closesAt)
              ? " · 마감"
              : ` · 마감 ${formatDday(poll.closesAt)}`
            : null}
        </span>
      </span>
    </Link>
  );
}

/** 진행 중인 투표 섹션 — ranking + kit 리스트 카드 */
export function OngoingPolls({ polls }: { polls: PollListItem[] }) {
  if (polls.length === 0) return null;

  return (
    <section>
      <SectionHead title="진행 중인 투표" />
      <div className="flex flex-col gap-3 px-5">
        {polls.map((poll) => (
          <OngoingPollCard key={poll.id} poll={poll} />
        ))}
      </div>
    </section>
  );
}

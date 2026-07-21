import Link from "next/link";
import { SectionHead } from "@/shared/ui";
import { formatCount } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import { readSideMeta, VsBadge, type PollListItem } from "@/entities/poll";
import { pickSides, readHomeCardMeta } from "../model/poll-meta";

/**
 * 캐러셀 미니 카드 — 프로토타입 MiniBalanceCard 재현.
 * 상단 110px 2분할(각 면 tone/text) + 중앙 34px VS 배지(흰 보더 3px)
 * + 하단 태그(mono 10px)·투표수.
 */
function MiniBalanceCard({ poll }: { poll: PollListItem }) {
  const sides = pickSides(poll.options);
  if (!sides) return null;

  const card = readHomeCardMeta(poll.meta);
  const aTone = readSideMeta(sides.a);
  const bTone = readSideMeta(sides.b);
  const tag = card.tag ?? poll.tag;

  return (
    <Link
      href={ROUTES.balanceDetail(poll.id)}
      aria-label={`${poll.title} — ${sides.a.label} 대 ${sides.b.label} 밸런스 게임`}
      className="block overflow-hidden rounded-[14px] border border-hairline bg-canvas"
    >
      {/* 상단 2분할 — 홈 전용 라벨(meta.card) 우선 */}
      <span className="relative grid h-[110px] grid-cols-2">
        <span
          className="flex items-center justify-center p-2 text-center text-[16px] font-semibold"
          style={{ background: aTone.tone, color: aTone.text }}
        >
          {card.a ?? sides.a.label}
        </span>
        <span
          className="flex items-center justify-center border-l border-hairline p-2 text-center text-[16px] font-semibold"
          style={{ background: bTone.tone, color: bTone.text }}
        >
          {card.b ?? sides.b.label}
        </span>
        <VsBadge size={34} className="border-[3px] shadow-none" />
      </span>

      <span className="block p-3">
        {tag ? (
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.4px] text-ink-mute-2">
            {tag}
          </span>
        ) : null}
        <span className="block text-[12px] text-ink-mute">
          <span className="tnum font-mono text-ink">{formatCount(poll.totalVotes)}</span>명
          투표
        </span>
      </span>
    </Link>
  );
}

/** 가벼운 양자택일 캐러셀 — 240px 미니 카드 가로 스크롤 */
export function QuickPicks({ polls }: { polls: PollListItem[] }) {
  if (polls.length === 0) return null;

  return (
    <section>
      <SectionHead title="더 가벼운 양자택일" more="전체" moreHref={ROUTES.balanceList} />
      <ul className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-1">
        {polls.map((poll) => (
          <li key={poll.id} className="w-60 shrink-0">
            <MiniBalanceCard poll={poll} />
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";
import { Pill, RatioBar } from "@/shared/ui";
import { formatCount, formatDday } from "@/shared/lib";
import { readSideMeta, VsBadge, type PollListItem, type PollOption } from "@/entities/poll";
import { ROUTES } from "@/shared/config";

type BalanceListCardProps = {
  poll: PollListItem;
  /** meta.side 기준으로 정렬된 A/B 옵션 */
  a: PollOption;
  b: PollOption;
};

/**
 * 밸런스 리스트 카드 — 프로토타입 BalanceListItem 재현.
 * 상단 70px 2분할 스트립(각 면 tone/text) + 중앙 30px VS 배지
 * + 태그·마감 pill + 제목 + 4px 비율 바(A 점유율=잉크) + 양측 투표수.
 */
export function BalanceListCard({ poll, a, b }: BalanceListCardProps) {
  const aTone = readSideMeta(a);
  const bTone = readSideMeta(b);

  return (
    <Link
      href={ROUTES.balanceDetail(poll.id)}
      aria-label={`${poll.title} — ${a.label} 대 ${b.label} 밸런스 게임`}
      className="block overflow-hidden rounded-[14px] border border-hairline bg-canvas"
    >
      {/* 상단 2분할 스트립 — A면 좌 / B면 우, 중앙 VS */}
      <div className="relative flex h-[70px]">
        <span
          className="flex flex-1 items-center justify-start px-3.5 text-[20px] font-bold tracking-[-0.5px]"
          style={{ background: aTone.tone, color: aTone.text }}
        >
          {a.label}
        </span>
        <span
          className="flex flex-1 items-center justify-end px-3.5 text-[20px] font-bold tracking-[-0.5px]"
          style={{ background: bTone.tone, color: bTone.text }}
        >
          {b.label}
        </span>
        <VsBadge size={30} className="border-2 shadow-none" />
      </div>

      <div className="p-3.5">
        {/* 태그 / 마감 pill 줄 */}
        <div className="mb-2 flex gap-1.5">
          {poll.tag ? <Pill variant="soft">{poll.tag}</Pill> : null}
          {poll.closesAt ? <Pill variant="outline">{formatDday(poll.closesAt)}</Pill> : null}
        </div>

        {/* 제목 */}
        <p className="mb-2 text-[15px] font-semibold leading-[1.35] tracking-[-0.3px] text-ink">
          {poll.title}
        </p>

        {/* 4px 비율 바 — 다크 = A 점유율 */}
        <RatioBar
          segments={[{ ratio: a.ratio, color: "#171717" }]}
          height={4}
          trackColor="#f1f1f1"
        />

        {/* 양측 투표수 */}
        <div className="tnum mt-1.5 flex font-mono text-[11px] text-ink-mute">
          <span>{formatCount(a.votes)}</span>
          <span className="ml-auto">{formatCount(b.votes)}</span>
        </div>
      </div>
    </Link>
  );
}

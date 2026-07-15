import Link from "next/link";
import { Pill, SectionHead } from "@/shared/ui";
import { cn } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import type { PollType } from "@/entities/poll";
import type { HomeTrendingItem } from "../model/types";

/** 프로토타입 표기(28.4k)를 따르는 컴팩트 투표수 포맷 */
function formatCompactCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** 연결된 폴의 타입별 디테일 경로 — 홈 피드에 없는 폴이면 null(비인터랙티브) */
function trendHref(
  pollId: string | null,
  pollTypeById: ReadonlyMap<string, PollType>,
): string | null {
  if (!pollId) return null;
  switch (pollTypeById.get(pollId)) {
    case "balance":
      return ROUTES.balanceDetail(pollId);
    case "ranking":
      return ROUTES.rankingDetail(pollId);
    case "kit":
      return ROUTES.kitDetail(pollId);
    default:
      return null;
  }
}

/** 델타 pill — up=에메랄드 톤 / down=크림슨 톤 / new=NEW */
function DeltaPill({ delta }: { delta: HomeTrendingItem["delta"] }) {
  if (delta === "new") {
    return (
      <Pill variant="green" className="px-[5px] py-[3px] text-[9px]">
        NEW
      </Pill>
    );
  }
  const isUp = delta === "up";
  return (
    <span
      aria-label={isUp ? "상승" : "하락"}
      className={cn(
        "min-w-[26px] rounded-[4px] px-[5px] py-0.5 text-center font-mono text-[10px]",
        isUp
          ? "bg-primary/[0.14] text-primary-deep"
          : "bg-crimson/[0.08] text-crimson",
      )}
    >
      {isUp ? "↑" : "↓"}
    </span>
  );
}

/** 트렌딩 행 — mono 순번 + 제목 + 투표수 + 델타 (prototype .otb-trend-row 수치) */
function TrendRow({ item, href }: { item: HomeTrendingItem; href: string | null }) {
  const content = (
    <>
      <span className="tnum min-w-3.5 font-mono text-[11px] text-ink-mute-2">
        {String(item.position).padStart(2, "0")}
      </span>
      <span className="flex-1 text-[14px] leading-[1.35] text-ink">{item.title}</span>
      <span className="tnum font-mono text-[10px] text-ink-mute">
        {formatCompactCount(item.voteCount)}
      </span>
      <DeltaPill delta={item.delta} />
    </>
  );

  const rowClassName = "flex items-center gap-3 border-b border-hairline-cool px-5 py-3";

  return href ? (
    <Link href={href} className={rowClassName}>
      {content}
    </Link>
  ) : (
    <div className={rowClassName}>{content}</div>
  );
}

type TrendingListProps = {
  items: HomeTrendingItem[];
  /** 홈 피드에 실린 폴들의 id → type 맵 (트렌딩 행 링크 라우팅용) */
  pollTypeById: ReadonlyMap<string, PollType>;
};

/** 지금 뜨거운 떡밥 — 트렌딩 랭킹 리스트 */
export function TrendingList({ items, pollTypeById }: TrendingListProps) {
  if (items.length === 0) return null;

  return (
    <section>
      <SectionHead title="지금 뜨거운 떡밥" />
      <div className="border-t border-hairline-cool">
        {items.map((item) => (
          <TrendRow
            key={item.position}
            item={item}
            href={trendHref(item.pollId, pollTypeById)}
          />
        ))}
      </div>
    </section>
  );
}

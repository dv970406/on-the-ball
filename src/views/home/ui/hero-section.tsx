import Link from "next/link";
import { BarChart3, Hand } from "lucide-react";
import { Icon, LiveDot, Pill } from "@/shared/ui";
import { formatCount, formatDday, isClosed } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import { SplitCard, type PollListItem, type PollOption } from "@/entities/poll";
import { pickSides, readHeroMeta } from "../model/poll-meta";

/**
 * meta.hero의 aSub/bSub(홈 전용 서브 문구)가 있으면 SplitCard가 그리는
 * metaLine을 홈 문구로 교체한다 — 카드 자체는 SplitCard/VsBadge 그대로 재사용.
 */
function withHeroSub(option: PollOption, sub: string | undefined): PollOption {
  if (!sub) return option;
  return { ...option, meta: { ...option.meta, metaLine: sub } };
}

/** 오늘의 밸런스 히어로 — 태그 → 26px 헤드라인 → 메타 줄 → 4/5 스플릿 카드 → 버튼 줄 */
export function HeroSection({ poll }: { poll: PollListItem }) {
  const sides = pickSides(poll.options);
  if (!sides) return null;

  const hero = readHeroMeta(poll.meta);
  const detailHref = ROUTES.balanceDetail(poll.id);
  const dday = poll.closesAt ? formatDday(poll.closesAt) : null;
  const closed = isClosed(poll.closesAt);

  return (
    <section className="px-5 pt-3.5">
      {/* 태그 — uppercase mono 10px */}
      {poll.tag ? (
        <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.8px] text-ink-mute">
          {poll.tag}
        </div>
      ) : null}

      {/* 헤드라인 — 홈 전용 문구(meta.hero.title) 우선 */}
      <h1 className="mb-2 text-[26px] font-semibold leading-[1.2] tracking-[-0.6px] text-ink">
        {hero.title ?? poll.title}
      </h1>

      {/* 메타 줄 — 진행 중/마감 pill + 투표수 + 남은 기간 */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        {closed ? (
          <Pill variant="soft">마감</Pill>
        ) : (
          <Pill variant="green">
            <LiveDot tone="ink" />
            진행 중
          </Pill>
        )}
        <span className="whitespace-nowrap text-[12px] text-ink-mute">
          <span className="tnum font-mono text-ink">{formatCount(poll.totalVotes)}</span>명
          투표
        </span>
        {dday && !closed ? (
          <>
            <span className="text-[12px] text-ink-mute-2">·</span>
            <span className="whitespace-nowrap text-[12px] text-ink-mute">마감 {dday}</span>
          </>
        ) : null}
      </div>

      {/* 대각선 스플릿 카드 — 탭 시 디테일 진입 (홈은 라틴 서브라벨 없이 46px 이름) */}
      <Link
        href={detailHref}
        aria-label={`${hero.title ?? poll.title} — ${sides.a.label} 대 ${sides.b.label} 밸런스 게임 상세`}
        className="block"
      >
        <SplitCard
          a={withHeroSub(sides.a, hero.aSub)}
          b={withHeroSub(sides.b, hero.bSub)}
          aspect="4/5"
          nameSize={46}
        />
      </Link>

      {/* 버튼 줄 — 둘 다 디테일로 이동 (버튼 스타일의 Link) */}
      <div className="mt-3.5 flex gap-2">
        <Link
          href={detailHref}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-ink px-[18px] py-3.5 text-[15px] font-medium leading-none text-white transition-colors duration-150 ease-otb active:bg-[#2a2a2a]"
        >
          <Icon as={Hand} size={16} />한 표 던지기
        </Link>
        <Link
          href={detailHref}
          className="flex items-center justify-center gap-1.5 rounded-sm border border-hairline-strong bg-canvas px-3 text-[13px] font-medium leading-none text-ink"
        >
          <Icon as={BarChart3} size={14} />
          결과
        </Link>
      </div>

      <p className="mt-2 text-center text-[11px] text-ink-mute-2">
        한 번 투표하면 24시간 안에 한 번만 바꿀 수 있어요.
      </p>
    </section>
  );
}

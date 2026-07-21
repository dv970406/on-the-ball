"use client";

import { CheckCircle2, SearchX } from "lucide-react";
import {
  PollMetaStrip,
  readKitMeta,
  usePollDetailQuery,
  type PollDetail,
  type PollOption,
} from "@/entities/poll";
import { useCastVote } from "@/features/cast-vote";
import { SubHeader } from "@/widgets/sub-header";
import {
  EmptyState,
  Icon,
  LiveStatusPill,
  Pill,
  RatioBar,
  Shirt,
  Skeleton,
} from "@/shared/ui";
import { ApiError } from "@/shared/api";
import { cn, formatCount, formatPct, isClosed } from "@/shared/lib";
import { COLOR } from "@/shared/config";

type KitVoteViewProps = {
  pollId: string;
};

/** 유니폼 투표 디테일 화면 루트 — 로딩 / 본문 / 에러 분기 */
export function KitVoteView({ pollId }: KitVoteViewProps) {
  const { data: poll, isPending, error, refetch } = usePollDetailQuery(pollId);

  if (isPending) return <KitVoteSkeleton />;
  if (poll && poll.type === "kit") return <KitVoteBody poll={poll} />;

  // 404·서버 오류 또는 kit 타입이 아닌 id로 진입한 경우
  return (
    <div>
      <SubHeader title="유니폼" />
      <EmptyState
        icon={SearchX}
        title="투표를 불러오지 못했어요"
        description={
          error instanceof ApiError ? error.message : "유니폼 투표를 찾을 수 없어요."
        }
        retryVariant="secondary"
        onRetry={error ? () => void refetch() : undefined}
      />
    </div>
  );
}

function KitVoteBody({ poll }: { poll: PollDetail }) {
  const castVote = useCastVote(poll.id);

  // 마감이면 투표 불가 — 결과만 공개
  const closed = isClosed(poll.closesAt);
  // 결과 게이팅 — 투표(또는 마감) 후에만 수치 공개
  const revealed = poll.myVote !== null || closed;

  const kits = [...poll.options].sort((a, b) => a.position - b.position);
  const myKit = poll.myVote
    ? (poll.options.find((option) => option.id === poll.myVote) ?? null)
    : null;

  return (
    <div>
      <SubHeader title={poll.tag ?? "유니폼"} />

      <article className="px-5 pb-10 pt-3">
        {/* 헤드라인 헤더 — 메타(상태 + 투표수 + D-day) + 제목 */}
        <header>
          <PollMetaStrip
            className="mb-2.5"
            pill={
              closed ? (
                <Pill variant="outline">마감</Pill>
              ) : (
                <LiveStatusPill>진행 중</LiveStatusPill>
              )
            }
            totalVotes={poll.totalVotes}
            closesAt={poll.closesAt}
          />
          <h1 className="text-2xl font-medium leading-[1.2] tracking-[-0.5px] text-ink">
            {poll.title}
          </h1>
          {poll.subtitle && (
            <p className="mt-1.5 text-[13px] leading-[1.45] text-ink-mute">{poll.subtitle}</p>
          )}
        </header>

        {castVote.isError && (
          <p className="mt-2 text-[11px] text-crimson">{castVote.error.message}</p>
        )}

        {/* 2열 유니폼 카드 그리드 — 탭 = 투표, 재탭 = 취소(서버가 cancelled 처리) */}
        <ul className="mt-[18px] grid grid-cols-2 gap-3">
          {kits.map((kit) => (
            <li key={kit.id}>
              <KitCard
                option={kit}
                isMine={poll.myVote === kit.id}
                revealed={revealed}
                disabled={closed || castVote.isPending}
                onVote={() => castVote.mutate(kit.id)}
              />
            </li>
          ))}
        </ul>

        {/* 투표 확인 스트립 — 재탭 취소 안내 */}
        {myKit && !closed && (
          <div className="mt-5 flex animate-fade-up items-center gap-2.5 rounded-lg border border-hairline-cool bg-canvas-soft p-3.5">
            <Icon as={CheckCircle2} size={16} className="shrink-0 text-primary-deep" aria-hidden />
            <p className="flex-1 text-xs text-ink">
              {myKit.label}에 한 표 던졌어요.{" "}
              <span className="text-ink-mute">마음 바뀌면 다시 탭해서 취소.</span>
            </p>
          </div>
        )}
      </article>
    </div>
  );
}

type KitCardProps = {
  option: PollOption;
  isMine: boolean;
  /** 결과(비율 바·퍼센트) 공개 여부 */
  revealed: boolean;
  disabled: boolean;
  onVote: () => void;
};

/** 유니폼 카드 — 1:1 소프트 배경 + Shirt + 클럽명 (+ 결과 공개 시 비율 바) */
function KitCard({ option, isMine, revealed, disabled, onVote }: KitCardProps) {
  const meta = readKitMeta(option);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onVote}
      aria-pressed={isMine}
      aria-label={isMine ? `${option.label} 투표 취소` : `${option.label}에 투표`}
      className={cn(
        "flex h-full w-full flex-col gap-2 rounded-lg border bg-canvas p-3 text-left transition-[border-color,box-shadow] duration-150 ease-otb",
        isMine
          ? "border-primary shadow-[inset_0_0_0_1px_#3ecf8e]"
          : "border-hairline",
      )}
    >
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-canvas-soft">
        <Shirt tone={meta.tone} stripe={meta.stripe} dark={meta.dark} />
      </span>
      <span className="block w-full">
        <span className="block text-[13px] font-medium text-ink">{option.label}</span>
        {revealed ? (
          <span className="mt-1.5 block">
            <RatioBar
              height={5}
              segments={[
                { ratio: option.ratio, color: isMine ? COLOR.primary : COLOR.inkMute2 },
              ]}
            />
            <span className="mt-1 block font-mono text-[11px] text-ink-mute tnum">
              {formatPct(option.ratio)} · {formatCount(option.votes)}표
            </span>
          </span>
        ) : (
          <span className="mt-1.5 block text-[11px] text-ink-mute">탭해서 한 표</span>
        )}
      </span>
    </button>
  );
}

/** 로딩 스켈레톤 — 헤더 + 2열 그리드 구조 유지 */
function KitVoteSkeleton() {
  return (
    <div>
      <SubHeader title="유니폼" />
      <div className="px-5 pb-10 pt-3">
        <Skeleton className="h-[21px] w-40 rounded-full" />
        <Skeleton className="mt-3 h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-48" />
        <div className="mt-[18px] grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-hairline p-3">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

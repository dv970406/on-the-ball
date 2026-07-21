"use client";

import { useState } from "react";
import { Check, SearchX, Trophy } from "lucide-react";
import {
  readRankingMeta,
  usePollDetailQuery,
  type PollDetail,
  type PollOption,
} from "@/entities/poll";
import { useCastVote } from "@/features/cast-vote";
import { SubHeader } from "@/widgets/sub-header";
import { Button, EmptyState, Flag, Icon, LiveStatusPill, Pill, RatioBar, Skeleton } from "@/shared/ui";
import { ApiError } from "@/shared/api";
import { cn, formatCount, formatDday, formatPct, isClosed } from "@/shared/lib";
import { COLOR } from "@/shared/config";

type RankingDetailViewProps = {
  pollId: string;
};

/** 랭킹 투표 디테일 화면 루트 — 로딩 / 본문 / 에러 분기 */
export function RankingDetailView({ pollId }: RankingDetailViewProps) {
  const { data: poll, isPending, error, refetch } = usePollDetailQuery(pollId);

  if (isPending) return <RankingDetailSkeleton />;
  if (poll && poll.type === "ranking") return <RankingDetailBody poll={poll} />;

  // 404·서버 오류 또는 랭킹 타입이 아닌 id로 진입한 경우
  return (
    <div>
      <SubHeader title="랭킹 투표" />
      <EmptyState
        icon={SearchX}
        title="투표를 불러오지 못했어요"
        description={
          error instanceof ApiError ? error.message : "랭킹 투표를 찾을 수 없어요."
        }
        action={
          error ? (
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              다시 시도
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

function RankingDetailBody({ poll }: { poll: PollDetail }) {
  // 투표 전 radio 선택 — 로컬 상태
  const [picked, setPicked] = useState<number | null>(null);
  const castVote = useCastVote(poll.id);

  // 마감이면 투표 불가 — 결과만 공개
  const closed = isClosed(poll.closesAt);
  const revealed = poll.myVote !== null || closed;

  // 투표 전: position 순 / 투표 후: 득표순
  const candidates = [...poll.options].sort((a, b) =>
    revealed ? b.votes - a.votes : a.position - b.position,
  );
  const pickedOption = picked
    ? (poll.options.find((option) => option.id === picked) ?? null)
    : null;
  const regions = poll.demographics
    .filter((d) => d.dimension === "region")
    .sort((a, b) => a.position - b.position);

  return (
    <div>
      <SubHeader title={poll.tag ?? "랭킹 투표"} dark />

      <article>
      {/* 다크 히어로 — 다크 서브헤더와 이어지는 canvas-night 밴드 */}
      <section className="bg-canvas-night px-5 pb-7 pt-4">
        <div className="mb-3 flex items-center gap-2">
          {closed ? (
            <Pill variant="outline" className="border-white/25 text-white/70">
              마감
            </Pill>
          ) : (
            <LiveStatusPill>진행 중</LiveStatusPill>
          )}
          {poll.closesAt && !closed && (
            <span className="text-[11px] text-ink-mute-2">
              마감 <time dateTime={poll.closesAt}>{formatDday(poll.closesAt)}</time>
            </span>
          )}
        </div>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.4px] text-accent-yellow">
              {poll.tag ?? "RANKING"}
            </p>
            <h1 className="text-[22px] font-medium leading-[1.2] tracking-[-0.4px] text-white">
              {poll.title}
            </h1>
            <p className="mt-1.5 text-xs text-ink-mute-2">
              <span className="font-mono tnum">{formatCount(poll.totalVotes)}</span>
              명이 한 표 던졌어요
            </p>
          </div>
          <Icon as={Trophy} size={42} className="shrink-0 text-accent-yellow" aria-hidden />
        </div>
      </section>

      {/* 후보 리스트 — 투표 전 radio 선택 / 투표 후 득표순 결과. CTA 높이만큼 하단 패딩 확보 */}
      <div className={cn("px-5 pt-4", revealed ? "pb-10" : "pb-[132px]")}>
        {revealed ? (
          <ol className="rounded-[14px] border border-hairline p-1.5" aria-label="후보별 득표 결과">
            {candidates.map((candidate, i) => (
              <CandidateResultRow
                key={candidate.id}
                option={candidate}
                rank={i + 1}
                isMine={poll.myVote === candidate.id}
              />
            ))}
          </ol>
        ) : (
          <div
            role="radiogroup"
            aria-label="후보 선택"
            className="rounded-[14px] border border-hairline p-1.5"
          >
            {candidates.map((candidate, i) => (
              <CandidatePickRow
                key={candidate.id}
                option={candidate}
                order={i + 1}
                isPicked={picked === candidate.id}
                onPick={() => setPicked(candidate.id)}
              />
            ))}
          </div>
        )}

        {!revealed && poll.subtitle && (
          <p className="mt-3 text-center text-xs text-ink-mute-2">{poll.subtitle}</p>
        )}

        {/* 지역별 1위 — 투표 후 공개되는 응답자 분석 */}
        {revealed && regions.length > 0 && (
          <section className="mt-[18px]">
            <h2 className="mb-2.5 text-[13px] font-medium text-ink">지역별 1위</h2>
            <ul className="grid grid-cols-2 gap-2">
              {regions.map((region) => {
                const winner = poll.options.find((option) => option.id === region.optionId);
                return (
                  <li
                    key={region.bucket}
                    className="rounded-[10px] border border-hairline-cool p-2.5"
                  >
                    <p className="text-[10px] uppercase tracking-[0.4px] text-ink-mute-2">
                      {region.bucket}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-ink">
                      {winner?.label ?? "—"}
                    </p>
                    <p className="font-mono text-[11px] text-ink-mute tnum">
                      {formatPct(region.ratio)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      </article>

      {/* 하단 고정 CTA 스트립 — 디테일 화면엔 탭바가 없어 프레임 하단에 부착 */}
      {!revealed && (
        <div className="absolute inset-x-3 bottom-[max(18px,env(safe-area-inset-bottom))] z-50 rounded-xl border border-hairline bg-canvas p-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
          {castVote.isError && (
            <p className="mb-1.5 px-1 text-[11px] text-crimson">{castVote.error.message}</p>
          )}
          <Button
            variant="dark"
            block
            disabled={!pickedOption || castVote.isPending || castVote.isSuccess}
            onClick={() => pickedOption && castVote.mutate(pickedOption.id)}
            aria-label={
              pickedOption ? `${pickedOption.label}에 투표하기` : "후보를 먼저 선택하세요"
            }
          >
            {pickedOption ? `${pickedOption.label}에 한 표` : "한 명을 골라주세요"}
          </Button>
        </div>
      )}
    </div>
  );
}

type CandidatePickRowProps = {
  option: PollOption;
  order: number;
  isPicked: boolean;
  onPick: () => void;
};

/** 투표 전 후보 행 — 순번 + 아바타 + 이름·클럽 + radio */
function CandidatePickRow({ option, order, isPicked, onPick }: CandidatePickRowProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isPicked}
      onClick={onPick}
      aria-label={`${option.label} 선택`}
      className={cn(
        "flex w-full items-center gap-3 rounded-[10px] border p-3 text-left transition-colors duration-150 ease-otb",
        isPicked ? "border-ink bg-canvas-soft" : "border-transparent active:bg-canvas-soft",
      )}
    >
      <span className="min-w-3 font-mono text-[11px] text-ink-mute-2">
        {String(order).padStart(2, "0")}
      </span>
      <CandidateAvatar option={option} />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate text-sm font-medium text-ink">{option.label}</span>
        {option.sublabel && (
          <span className="truncate text-xs text-ink-mute">· {option.sublabel}</span>
        )}
      </span>
      {/* radio — 선택 시 잉크 도트 */}
      <span
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
          isPicked ? "border-ink" : "border-hairline-strong",
        )}
        aria-hidden
      >
        {isPicked && <span className="size-[9px] rounded-full bg-ink" />}
      </span>
    </button>
  );
}

type CandidateResultRowProps = {
  option: PollOption;
  rank: number;
  isMine: boolean;
};

/** 투표 후 후보 행 — 득표순 순번 + 비율 바 + 퍼센트·득표수 + 내 표 칩 */
function CandidateResultRow({ option, rank, isMine }: CandidateResultRowProps) {
  // 결과 바 컬러 — 1위 에메랄드 / 내 선택 잉크 / 나머지 그레이
  const barColor = rank === 1 ? COLOR.primary : isMine ? COLOR.ink : COLOR.hairline;

  return (
    <li className="flex items-center gap-3 p-3">
      <span className="min-w-3 font-mono text-[11px] text-ink-mute-2">
        {String(rank).padStart(2, "0")}
      </span>
      <CandidateAvatar option={option} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-medium text-ink">{option.label}</span>
          {option.sublabel && (
            <span className="truncate text-xs text-ink-mute">· {option.sublabel}</span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[13px] text-ink tnum">
            {formatPct(option.ratio)}
          </span>
        </div>
        <RatioBar
          className="mt-[7px]"
          height={5}
          segments={[{ ratio: option.ratio, color: barColor }]}
        />
        <div className="mt-1 flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-ink-mute-2 tnum">
            {formatCount(option.votes)}표
          </span>
          {isMine && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-hairline-cool bg-canvas-soft px-1.5 py-0.5 text-[10px] leading-none text-ink">
              <Icon as={Check} size={10} /> 내 표
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/** 후보 아바타 — 파스텔 원(hue 기반) + 우하단 국기 뱃지 */
function CandidateAvatar({ option }: { option: PollOption }) {
  const meta = readRankingMeta(option);

  return (
    <span
      className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline-cool text-sm font-medium text-ink"
      style={{ background: `hsl(${meta.hue}, 40%, 92%)` }}
    >
      {option.label.charAt(0)}
      <span className="absolute -bottom-0.5 -right-0.5 leading-none">
        <Flag code={meta.flag} width={14} height={10} />
      </span>
    </span>
  );
}

/** 로딩 스켈레톤 — 다크 히어로 + 후보 6행 구조 유지 */
function RankingDetailSkeleton() {
  return (
    <div>
      <SubHeader title="랭킹 투표" dark />
      <section className="bg-canvas-night px-5 pb-7 pt-4">
        <Skeleton className="h-[21px] w-16 rounded-full bg-white/10" />
        <div className="mt-3 flex items-start gap-3">
          <div className="flex-1">
            <Skeleton className="h-3 w-28 bg-white/10" />
            <Skeleton className="mt-2 h-6 w-52 bg-white/10" />
            <Skeleton className="mt-2 h-3.5 w-36 bg-white/10" />
          </div>
          <Skeleton className="size-[42px] bg-white/10" />
        </div>
      </section>
      <div className="px-5 pb-[132px] pt-4">
        <div className="rounded-[14px] border border-hairline p-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="size-3" />
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="mt-1.5 h-3 w-16" />
              </div>
              <Skeleton className="size-[18px] rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

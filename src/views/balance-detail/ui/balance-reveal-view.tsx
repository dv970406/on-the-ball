"use client";

import { useMemo } from "react";
import { CheckCircle2 } from "lucide-react";
import { Icon, LiveStatusPill, RatioBar } from "@/shared/ui";
import { cn, formatCount, formatDday, formatPct, isClosed } from "@/shared/lib";
import { COLOR } from "@/shared/config";
import { readSideMeta, type BalanceSideMeta, type PollDetail, type PollOption } from "@/entities/poll";
import { RevealRatioBar } from "./reveal-ratio-bar";
import { CommentSection } from "./comment-section";

type Side = "a" | "b";

type BalanceRevealViewProps = {
  poll: PollDetail;
  a: PollOption;
  b: PollOption;
  /** 내가 투표한 면 — 마감 후 미투표 열람이면 null */
  mySide: Side | null;
};

/** 투표 후(또는 마감 후) 결과 화면 — 비율 바 + 스탯 비교 + blurb + 응답자 분석 + 댓글 */
export function BalanceRevealView({ poll, a, b, mySide }: BalanceRevealViewProps) {
  const aMeta = readSideMeta(a);
  const bMeta = readSideMeta(b);
  // 동률(0표 포함)이면 승자 없음 — WIN pill·에메랄드 보더 미표시
  const winner: Side | null = a.votes > b.votes ? "a" : b.votes > a.votes ? "b" : null;
  const myChoice = mySide === "a" ? a : mySide === "b" ? b : null;

  // 연령대 버킷별 A/B 비율 — position 순 유지
  const ageRows = useMemo(() => {
    const rows: { bucket: string; aRatio: number; bRatio: number }[] = [];
    const byBucket = new Map<string, { bucket: string; aRatio: number; bRatio: number }>();
    for (const d of poll.demographics.filter((d) => d.dimension === "age")) {
      let row = byBucket.get(d.bucket);
      if (!row) {
        row = { bucket: d.bucket, aRatio: 0, bRatio: 0 };
        byBucket.set(d.bucket, row);
        rows.push(row);
      }
      if (d.optionId === a.id) row.aRatio = d.ratio;
      else if (d.optionId === b.id) row.bRatio = d.ratio;
    }
    return rows;
  }, [poll.demographics, a.id, b.id]);

  // 스탯 비교 행 수 (시드 기준 3행)
  const statRowCount = Math.max(aMeta.stats.length, bMeta.stats.length);

  return (
    <div className="animate-fade-up px-5 pb-6 pt-3">
      {/* 메타 pill 줄 */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <LiveStatusPill>결과 공개</LiveStatusPill>
        <span className="whitespace-nowrap text-[12px] text-ink-mute">
          <span className="tnum font-mono text-ink">{formatCount(poll.totalVotes)}</span>명 투표
        </span>
        {poll.closesAt ? (
          <>
            <span className="text-[12px] text-ink-mute-2">·</span>
            <span className="whitespace-nowrap text-[12px] text-ink-mute">
              {/* 마감된 폴이면 formatDday가 "마감"을 반환 → "마감 마감" 방지 */}
              {isClosed(poll.closesAt) ? "마감" : `마감 ${formatDday(poll.closesAt)}`}
            </span>
          </>
        ) : null}
      </div>

      <h1 className="mb-3.5 text-[24px] font-bold leading-[1.2] tracking-[-0.5px] text-ink">
        {poll.title}
      </h1>

      {/* 내 선택 칩 */}
      {myChoice ? (
        <div className="mb-3.5 inline-flex items-center gap-1.5 rounded-full border border-hairline-cool bg-canvas-soft px-2.5 py-1.5 text-[12px] text-ink-mute">
          <Icon as={CheckCircle2} size={14} className="text-primary-deep" />
          <span>
            내 선택은{" "}
            <strong className="ml-0.5 font-medium text-ink">{myChoice.label}</strong>
          </span>
        </div>
      ) : null}

      {/* 56px 비율 바 — 센터피스 */}
      <RevealRatioBar a={a} b={b} aMeta={aMeta} bMeta={bMeta} winner={winner} mySide={mySide} />

      {/* 스탯 비교 그리드 — 중앙 세로 헤어라인 */}
      {statRowCount > 0 ? (
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-stretch">
          {Array.from({ length: statRowCount }, (_, i) => (
            <StatRow key={i} aStat={aMeta.stats[i]} bStat={bMeta.stats[i]} />
          ))}
        </div>
      ) : null}

      {/* 양측 blurb 카드 — 승자는 2px 에메랄드 보더 */}
      <div className="mt-[18px] grid grid-cols-2 gap-2.5">
        <BlurbCard option={a} meta={aMeta} won={winner === "a"} />
        <BlurbCard option={b} meta={bMeta} won={winner === "b"} />
      </div>

      {/* 응답자 분석 — 연령대별 스택바 */}
      {ageRows.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2.5 text-[13px] font-semibold text-ink">응답자 분석</h2>
          <div className="flex flex-col gap-2">
            {ageRows.map((row) => (
              <div key={row.bucket}>
                <div className="mb-1 flex items-center">
                  <span className="text-[11px] text-ink-mute">{row.bucket}</span>
                  <span className="tnum ml-auto font-mono text-[11px] text-ink">
                    {formatPct(row.aRatio)} / {formatPct(row.bRatio)}
                  </span>
                </div>
                <RatioBar
                  segments={[
                    { ratio: row.aRatio, color: COLOR.ink },
                    { ratio: row.bRatio, color: COLOR.hairline },
                  ]}
                  height={8}
                  trackColor="var(--color-canvas-soft)"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 한 줄 거들기 */}
      <CommentSection pollId={poll.id} commentCount={poll.commentCount} />
    </div>
  );
}

type StatRowProps = {
  aStat?: [string, string];
  bStat?: [string, string];
};

/** 스탯 비교 한 행 — 좌 A / 중앙 헤어라인 / 우 B */
function StatRow({ aStat, bStat }: StatRowProps) {
  return (
    <>
      <StatCell stat={aStat} side="a" />
      <div className="w-px bg-hairline-cool" />
      <StatCell stat={bStat} side="b" />
    </>
  );
}

function StatCell({ stat, side }: { stat?: [string, string]; side: Side }) {
  return (
    <div className={cn("py-2.5", side === "a" ? "pr-3 text-left" : "pl-3 text-right")}>
      {stat ? (
        <>
          <div className="text-[11px] text-ink-mute-2">{stat[0]}</div>
          <div className="tnum mt-0.5 font-mono text-[18px] font-semibold text-ink">{stat[1]}</div>
        </>
      ) : null}
    </div>
  );
}

type BlurbCardProps = {
  option: PollOption;
  meta: BalanceSideMeta;
  won: boolean;
};

/** 면별 blurb 카드 — 면 tone/text 배경, 승자는 에메랄드 2px 보더 */
function BlurbCard({ option, meta, won }: BlurbCardProps) {
  return (
    <div
      className="rounded-lg p-3.5"
      style={{
        background: meta.tone,
        color: meta.text,
        border: won ? "2px solid var(--color-primary)" : "1px solid var(--color-hairline-cool)",
      }}
    >
      <div className="mb-1 text-[17px] font-bold tracking-[-0.4px]">{option.label}</div>
      <div className="mb-2 text-[11px] opacity-70">{meta.metaLine}</div>
      <div className="text-[11.5px] leading-[1.45] opacity-85">{meta.blurb}</div>
    </div>
  );
}

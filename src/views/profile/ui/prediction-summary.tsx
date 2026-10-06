"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { formatCount } from "@/shared/lib";
import { EmptyState, Icon, Skeleton, StaleBanner, buttonClassName } from "@/shared/ui";
import { useMyScoreQuery } from "@/entities/prediction";

interface PredictionSummaryProps {
  userId: string | undefined;
}

/**
 * 내 예측 — 예측 랭킹의 내 순위·점수·적중과 랭킹 화면의 진입점.
 *
 * 점수는 파생 스크립트가 매시 채점한다 — 채점된 표가 없으면 행이 없어 안내만 그린다. 예측은 딜 상세의 카드에서 한다.
 */
export function PredictionSummary({ userId }: PredictionSummaryProps) {
  const score = useMyScoreQuery(userId);

  return (
    <section aria-labelledby="prediction-heading" className="px-5 pt-7">
      <h2 id="prediction-heading" className="text-[15px] font-semibold tracking-[-0.3px] text-ink">
        내 예측
      </h2>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-mute">
        딜 상세에서 이번 창 안의 성사 여부를 예측하면, 결과가 나온 뒤 채점돼 랭킹에 올라요.
      </p>

      {score.isPending && <Skeleton className="mt-4 h-[62px] w-full" />}

      {/* 보여줄 데이터가 없을 때만 전체 대체한다(data-and-state.md) */}
      {score.error && score.data === undefined && (
        <EmptyState
          title="예측 기록을 불러오지 못했어요"
          description={score.error.message}
          onRetry={() => score.refetch()}
        />
      )}
      {score.error && score.data !== undefined && (
        <div className="mt-4">
          <StaleBanner noun="예측 기록" onRetry={() => score.refetch()} />
        </div>
      )}

      {score.data === null && (
        <p className="mt-4 text-[13px] leading-[1.6] text-ink-mute-2">아직 채점된 예측이 없어요.</p>
      )}

      {score.data && (
        <dl className="mt-4 grid grid-cols-3 overflow-hidden rounded-sm border border-hairline-cool">
          {[
            { label: "순위", value: `${formatCount(score.data.rank)}위` },
            { label: "점수", value: `${formatCount(score.data.points)}점` },
            { label: "적중", value: `${formatCount(score.data.hits)}/${formatCount(score.data.scored)}` },
          ].map(({ label, value }, i) => (
            <div key={label} className={i > 0 ? "border-l border-hairline-cool px-3 py-2.5" : "px-3 py-2.5"}>
              <dt className="font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2">{label}</dt>
              <dd className="mt-1 font-mono text-[15px] tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <Link
        href={ROUTES.ranking}
        className={buttonClassName({ variant: "secondary", block: true, className: "mt-4" })}
      >
        <Icon as={Trophy} size={16} />
        예측 랭킹 보기
      </Link>
    </section>
  );
}

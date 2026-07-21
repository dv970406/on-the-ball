"use client";

import { Check, Flame, X } from "lucide-react";
import { Button, EmptyState, Icon, Skeleton, TabHeader } from "@/shared/ui";
import { cn } from "@/shared/lib";
import { useTmiDeck } from "../model/use-tmi-deck";
import { TmiCard } from "./tmi-card";
import { TmiSummary } from "./tmi-summary";

/** 로딩 스켈레톤 — 헤더/프로그레스/카드/버튼 구조 유지 */
function TmiSkeleton() {
  return (
    <div>
      <div className="px-5 pb-3 pt-14">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="flex gap-1 px-5 pb-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[3px] flex-1 rounded-full" />
        ))}
      </div>
      <Skeleton className="mx-5 min-h-[460px] rounded-[18px]" />
      <div className="flex gap-3 px-5 pb-3 pt-4">
        <Skeleton className="h-12 flex-1 rounded-sm" />
        <Skeleton className="h-12 flex-1 rounded-sm" />
      </div>
    </div>
  );
}

/** TMI 판정 덱 탭 화면 — 상태머신은 useTmiDeck, 여기선 렌더만 */
export function TmiView() {
  const {
    deck,
    isPending,
    isError,
    error,
    refetch,
    cursor,
    current,
    peek,
    done,
    currentSide,
    exitSide,
    animating,
    inlineError,
    showSkipControls,
    sideOf,
    judge,
    skip,
    skipBrokenCard,
    review,
  } = useTmiDeck();

  if (isPending) return <TmiSkeleton />;

  if (isError) {
    return (
      <EmptyState
        icon={Flame}
        title="TMI 덱을 불러오지 못했어요"
        description={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  if (deck.length === 0) {
    return (
      <EmptyState
        icon={Flame}
        title="아직 준비된 TMI가 없어요"
        description="새 떡밥이 들어오면 여기서 가릴 수 있어요."
      />
    );
  }

  return (
    <div>
      {/* 탭 헤더 — 타이틀 + 서브카피 */}
      <TabHeader title="선수 TMI" subtitle="진짜? 거짓? 한 장씩 넘기면서 가려요." />

      {/* 프로그레스 — 판정 완료=잉크 / 현재=에메랄드 / 남음=헤어라인 */}
      <div className="flex gap-1 px-5 pb-3" aria-hidden>
        {deck.map((poll, i) => (
          <div
            key={poll.id}
            className={cn(
              "h-[3px] flex-1 rounded-full transition-colors duration-200",
              !done && i === cursor
                ? "bg-primary"
                : sideOf(poll) !== null
                  ? "bg-ink"
                  : "bg-hairline-cool",
            )}
          />
        ))}
      </div>

      {done ? (
        <TmiSummary deck={deck} sideOf={sideOf} onReview={review} />
      ) : (
        <>
          {/* 카드 스택 — 현재 카드 + 다음 카드 peek */}
          <div className="relative mx-5 min-h-[460px]">
            {peek ? (
              <TmiCard key={peek.id} poll={peek} order={cursor + 1} total={deck.length} peek />
            ) : null}
            {current ? (
              <TmiCard
                key={current.id}
                poll={current}
                order={cursor}
                total={deck.length}
                resultSide={currentSide}
                exitSide={exitSide}
              />
            ) : null}
          </div>

          {/* 판정 버튼 줄 */}
          {showSkipControls ? (
            <div className="px-5 pb-3 pt-4">
              <p className="mb-2.5 text-center text-[11px] text-ink-mute-2">
                이미 판정한 카드예요 · 재투표는 할 수 없어요
              </p>
              <Button
                variant="dark"
                block
                disabled={animating}
                onClick={skip}
                aria-label="다음 카드 보기"
              >
                다음 카드
              </Button>
            </div>
          ) : (
            <div className="flex gap-3 px-5 pb-3 pt-4">
              <button
                type="button"
                aria-label="거짓으로 판정"
                disabled={animating || currentSide !== null}
                onClick={() => judge("false")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-crimson bg-canvas py-3.5 text-[15px] font-semibold leading-none text-crimson transition-opacity duration-150 ease-otb disabled:pointer-events-none disabled:opacity-40"
              >
                <Icon as={X} size={16} /> 거짓
              </button>
              <button
                type="button"
                aria-label="진실로 판정"
                disabled={animating || currentSide !== null}
                onClick={() => judge("true")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-primary-deep bg-primary py-3.5 text-[15px] font-semibold leading-none text-on-primary transition-opacity duration-150 ease-otb disabled:pointer-events-none disabled:opacity-40"
              >
                <Icon as={Check} size={16} /> 진실
              </button>
            </div>
          )}

          {inlineError ? (
            <div className="px-5 pb-2 text-center">
              <p role="alert" className="text-xs text-crimson">
                {inlineError}
              </p>
              {/* 판정 불가 카드(마감 등)에서 덱이 막히지 않도록 탈출구 제공 */}
              {currentSide === null ? (
                <button
                  type="button"
                  className="mt-1 text-[11px] text-ink-mute underline underline-offset-2"
                  onClick={skipBrokenCard}
                >
                  이 카드 건너뛰기
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

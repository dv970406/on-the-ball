"use client";

import { useState } from "react";
import { CircleAlert, Lightbulb, LightbulbOff, Share2 } from "lucide-react";
import { SubHeader } from "@/widgets/sub-header";
import { Button, EmptyState, Icon, LiveStatusPill, Pill, Skeleton } from "@/shared/ui";
import { cn, formatCount, formatPct } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import { QuizPitch } from "./quiz-pitch";
import { useQuizAttempt } from "../model/use-quiz-attempt";

/** 디테일 로딩 스켈레톤 — 메타/헤드라인/피치/4지선다 구조 유지 */
function QuizDetailSkeleton() {
  return (
    <div className="px-5 pb-10 pt-3">
      <Skeleton className="mb-3 h-6 w-44" />
      <Skeleton className="mb-2 h-7 w-full" />
      <Skeleton className="mb-4 h-4 w-3/5" />
      <Skeleton className="aspect-[3/4] w-full rounded-[14px]" />
      <div className="mt-[18px] flex flex-col gap-2">
        <Skeleton className="h-[52px] rounded-[10px]" />
        <Skeleton className="h-[52px] rounded-[10px]" />
        <Skeleton className="h-[52px] rounded-[10px]" />
        <Skeleton className="h-[52px] rounded-[10px]" />
      </div>
    </div>
  );
}

/** 퀴즈 디테일 화면 (/quiz/[id]) — 상태머신은 useQuizAttempt, 여기선 렌더만 */
export function QuizDetailView({ id }: { id: string }) {
  const {
    data,
    isPending,
    isError,
    error,
    fresh,
    done,
    result,
    myChoiceId,
    isCorrect,
    correctChoiceId,
    displayChoices,
    answerText,
    submitError,
    handlePick,
  } = useQuizAttempt(id);

  // 힌트 토글은 도전 상태와 무관한 순수 UI 상태라 뷰가 소유
  const [hintOpen, setHintOpen] = useState(false);

  if (isPending) {
    return (
      <div className="min-h-full bg-canvas-soft">
        <SubHeader title="오늘의 퀴즈" fallbackHref={ROUTES.quizList} />
        <QuizDetailSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-full bg-canvas-soft">
        <SubHeader title="오늘의 퀴즈" fallbackHref={ROUTES.quizList} />
        <EmptyState
          icon={CircleAlert}
          title="퀴즈를 불러오지 못했어요"
          description={error?.message}
        />
      </div>
    );
  }

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: data.title, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      // 사용자가 공유를 취소한 경우 — 무시
    }
  };

  return (
    <div className="min-h-full bg-canvas-soft">
      <SubHeader title="오늘의 퀴즈" fallbackHref={ROUTES.quizList} />

      <div className="px-5 pb-10 pt-3">
        {/* 메타 — 상태 pill + 정답률/도전자 수 */}
        <div className="mb-2.5 flex items-center gap-2">
          {done ? (
            <Pill variant="soft">도전 완료</Pill>
          ) : (
            <LiveStatusPill>진행 중</LiveStatusPill>
          )}
          <span className="tnum text-xs text-ink-mute">
            정답률{" "}
            <strong className="font-mono font-semibold text-ink">
              {data.accuracyPct}%
            </strong>{" "}
            · <span className="font-mono">{formatCount(data.attempts)}</span>명 도전
          </span>
        </div>

        {/* 질문 헤드라인 */}
        <h1 className="mb-1.5 text-[22px] font-bold leading-[1.2] tracking-[-0.4px] text-ink">
          {data.title}
        </h1>
        {data.subtitle ? (
          <p className="mb-4 text-[13px] leading-normal text-ink-mute">
            {data.subtitle}
          </p>
        ) : (
          <div className="mb-4" />
        )}

        {/* 피치 뷰 + 캡션 */}
        {data.lineup ? (
          <>
            <QuizPitch lineup={data.lineup} reveal={done} />
            {data.lineup.caption ? (
              <div className="mt-2.5 text-center font-mono text-[11px] text-ink-mute-2">
                {data.lineup.caption}
              </div>
            ) : null}
          </>
        ) : null}

        {/* 힌트 토글 — 도전 전에만 */}
        {!done && data.hint ? (
          <div className="mt-3.5">
            <button
              type="button"
              onClick={() => setHintOpen((open) => !open)}
              aria-expanded={hintOpen}
              aria-label={hintOpen ? "힌트 닫기" : "힌트 보기"}
              className="inline-flex items-center gap-[5px] rounded-full border border-dashed border-hairline-strong bg-transparent px-3 py-1.5 text-xs text-ink-mute"
            >
              <Icon as={hintOpen ? Lightbulb : LightbulbOff} size={12} />
              힌트 {hintOpen ? "닫기" : "보기"}
            </button>
            {hintOpen ? (
              <div className="animate-fade-up mt-2.5 rounded-[10px] border border-[#fff0a0] bg-[#fff8c5] p-3 text-[12.5px] leading-normal text-[#5a4a00]">
                💡 {data.hint}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 4지선다 */}
        <div className="mt-[18px] flex flex-col gap-2">
          {displayChoices.map((choice) => {
            const isCorrectChoice = done && choice.id === correctChoiceId;
            const isMyWrong = done && choice.id === myChoiceId && !isCorrectChoice;
            const isDim = done && !isCorrectChoice && !isMyWrong;

            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => handlePick(choice.id)}
                aria-disabled={done}
                aria-label={`${choice.team}${choice.season ? ` ${choice.season}` : ""} 선택`}
                className={cn(
                  "flex w-full items-center justify-between rounded-[10px] border bg-canvas px-4 py-3.5 text-left text-[15px] font-medium text-ink transition-colors duration-150 ease-otb",
                  !done && "border-hairline active:border-ink",
                  !done && myChoiceId === choice.id && "border-ink",
                  isCorrectChoice && "border-primary bg-primary/[0.12]",
                  isMyWrong && "border-crimson bg-crimson/[0.06] text-crimson",
                  isDim && "border-hairline opacity-[0.55]",
                )}
              >
                <span className="min-w-0">
                  <span className="block">{choice.team}</span>
                  {done ? (
                    <span className="tnum mt-1 block text-[11px] font-normal text-ink-mute">
                      <span className="font-mono">{formatPct(choice.pickRatio)}</span>가
                      이걸 골랐어요
                    </span>
                  ) : null}
                </span>
                {choice.season ? (
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs font-normal",
                      isCorrectChoice ? "text-primary-deep" : "text-ink-mute",
                    )}
                  >
                    {choice.season}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {submitError ? (
          <p className="mt-2 text-xs text-crimson">{submitError}</p>
        ) : null}

        {/* 리빌 카드 + 스트릭 업데이트 */}
        {done ? (
          <div className="animate-fade-up mt-6">
            <div
              className={cn(
                "rounded-xl border p-[18px] text-center",
                isCorrect
                  ? "border-canvas-night bg-canvas-night text-white"
                  : "border-hairline bg-canvas text-ink",
              )}
            >
              <div className="text-[22px] font-bold tracking-[-0.4px]">
                {isCorrect ? "정답이에요 ⚽" : "아쉽다."}
              </div>
              <div
                className={cn(
                  "mt-1 text-[13px] leading-normal",
                  isCorrect ? "text-ink-mute-2" : "text-ink-mute",
                )}
              >
                정답은{" "}
                <span
                  className={cn(
                    "font-medium",
                    isCorrect ? "text-primary" : "text-ink",
                  )}
                >
                  {answerText}
                </span>
              </div>
              {/* 실데이터라 재도전 불가 — 결과 공유만 제공 */}
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Share2}
                  onClick={handleShare}
                  aria-label="결과 공유"
                >
                  결과 공유
                </Button>
              </div>
            </div>

            {/* 스트릭 업데이트 — RPC 반환 streak 사용 (제출 직후에만) */}
            {fresh && result ? (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-hairline bg-canvas p-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-base font-bold text-on-primary">
                  {result.streak}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    {isCorrect
                      ? `연속 정답 ${result.streak}일째`
                      : "연속 정답이 0으로 리셋됐어요"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-mute">
                    {isCorrect ? `${result.streak + 1}일째도 가즈아.` : "내일 다시 도전해요."}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

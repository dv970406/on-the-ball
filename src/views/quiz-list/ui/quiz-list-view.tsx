"use client";

import Link from "next/link";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Lock,
  Map as MapIcon,
  X,
} from "lucide-react";
import { EmptyState, Icon, NightCard, Pill, SectionHead, Skeleton, TabHeader } from "@/shared/ui";
import { formatCount, formatDday } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import { useMyProfileQuery } from "@/entities/user";
import { useQuizListQuery, type QuizSummary } from "@/entities/quiz";

/** 다크 Streak 카드 — 56px 에메랄드 원 안에 연속 정답 일수 */
function StreakCard() {
  const { data: profile, isPending } = useMyProfileQuery();

  if (isPending) {
    return <Skeleton className="h-[92px] rounded-xl" />;
  }

  const streak = profile?.currentStreak ?? 0;

  return (
    <NightCard className="flex items-center gap-3.5 p-[18px]">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[22px] font-bold text-on-primary">
        {streak}
      </div>
      <div className="flex-1">
        <div className="font-mono text-xs uppercase tracking-[0.4px] text-primary">
          ▸ STREAK
        </div>
        <div className="text-[17px] font-semibold">연속 정답 {streak}일째</div>
        <div className="mt-0.5 text-[11px] text-ink-mute-2">
          상위 4% · 한 번이라도 틀리면 0으로 리셋
        </div>
      </div>
    </NightCard>
  );
}

/** 오늘의 문제 카드 — NEW pill + 정답률/도전자, 도전 완료 시 결과 pill */
function TodayQuizCard({ quiz }: { quiz: QuizSummary }) {
  return (
    <Link
      href={ROUTES.quizDetail(quiz.id)}
      className="flex items-center gap-3 rounded-[14px] border border-hairline bg-canvas p-4"
      aria-label={`오늘의 문제: ${quiz.title}`}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-hairline-cool bg-canvas-soft text-ink">
        <Icon as={MapIcon} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="mb-1 flex gap-1.5">
          {quiz.myResult === "correct" ? (
            <Pill variant="green">정답</Pill>
          ) : quiz.myResult === "wrong" ? (
            <Pill variant="crimson">오답</Pill>
          ) : (
            <Pill variant="green">NEW</Pill>
          )}
          <Pill variant="soft">{quiz.kind}</Pill>
        </span>
        <h3 className="block text-sm font-semibold text-ink">{quiz.title}</h3>
        <span className="tnum mt-1 block text-[11px] text-ink-mute">
          정답률 <strong className="font-mono font-semibold text-ink">{quiz.accuracyPct}%</strong>{" "}
          · <span className="font-mono">{formatCount(quiz.attempts)}</span>명 도전
        </span>
      </div>
      <Icon as={ChevronRight} size={18} className="shrink-0 text-ink-mute-2" />
    </Link>
  );
}

/** 예정된 문제 행 — dashed 보더 + 잠금 아이콘, 클릭 불가 */
function UpcomingQuizRow({ quiz }: { quiz: QuizSummary }) {
  return (
    // 잠금 상태 — 인터랙션 없는 행
    <li className="flex items-center gap-2.5 rounded-lg border border-dashed border-hairline-strong p-3">
      <time
        dateTime={quiz.opensOn}
        className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-canvas-soft font-mono text-[10px] text-ink-mute"
      >
        {formatDday(quiz.opensOn)}
      </time>
      <div className="min-w-0 flex-1">
        <h3 className="block text-[13px] font-medium text-ink">{quiz.title}</h3>
        <span className="mt-0.5 block text-[11px] text-ink-mute-2">
          {quiz.kind}
          {quiz.subtitle ? ` · ${quiz.subtitle}` : ""}
        </span>
      </div>
      <Icon as={Lock} size={14} className="shrink-0 text-ink-mute-2" aria-label="잠김" />
    </li>
  );
}

/** 지난 문제 행 — 내 정답/오답 아이콘 (미시도는 중립 dot) */
function PastQuizRow({ quiz }: { quiz: QuizSummary }) {
  return (
    <li className="border-b border-hairline-cool">
      <Link
        href={ROUTES.quizDetail(quiz.id)}
        className="flex items-center gap-3 py-2.5"
        aria-label={`지난 문제: ${quiz.title}`}
      >
        {quiz.myResult === "correct" ? (
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-sm bg-primary/[0.14] text-primary-deep">
            <Icon as={Check} size={14} aria-label="정답" />
          </span>
        ) : quiz.myResult === "wrong" ? (
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-sm bg-crimson/[0.08] text-crimson">
            <Icon as={X} size={14} aria-label="오답" />
          </span>
        ) : (
          <span
            className="flex size-[26px] shrink-0 items-center justify-center rounded-sm bg-canvas-soft"
            aria-label="미도전"
          >
            <span className="size-1.5 rounded-full bg-ink-faint" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="block text-[13px] text-ink">{quiz.title}</h3>
          <span className="tnum mt-0.5 block text-[10px] text-ink-mute-2">
            <span className="font-mono">{quiz.accuracyPct}%</span> ·{" "}
            <span className="font-mono">{formatCount(quiz.attempts)}</span>명 · {quiz.kind}
          </span>
        </div>
        <Icon as={ChevronRight} size={14} className="shrink-0 text-ink-mute-2" />
      </Link>
    </li>
  );
}

/** 리스트 로딩 스켈레톤 — 화면 구조(오늘 카드/예정/보관함) 유지 */
function QuizListSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-5">
      <Skeleton className="h-20 rounded-[14px]" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
      </div>
    </div>
  );
}

/** 퀴즈 리스트 화면 (/quiz 탭) */
export function QuizListView() {
  const { data, isPending, isError, error } = useQuizListQuery();

  return (
    <div>
      {/* 타이틀 */}
      <TabHeader title="축구 퀴즈" subtitle="매일 오전 8시, 새 문제가 한 개씩 열려요." />

      {/* Streak 카드 */}
      <div className="px-5 pb-5">
        <StreakCard />
      </div>

      {isPending ? (
        <QuizListSkeleton />
      ) : isError ? (
        <EmptyState
          icon={CircleAlert}
          title="퀴즈 목록을 불러오지 못했어요"
          description={error.message}
        />
      ) : (
        <>
          {/* 오늘의 문제 */}
          <section>
            <SectionHead title="오늘의 문제" />
            <div className="mb-6 px-5">
              {data.today ? (
                <TodayQuizCard quiz={data.today} />
              ) : (
                <EmptyState
                  icon={MapIcon}
                  title="오늘의 문제가 아직 열리지 않았어요"
                  description="매일 오전 8시에 새 문제가 열려요."
                  className="rounded-[14px] border border-hairline bg-canvas py-10"
                />
              )}
            </div>
          </section>

          {/* 예정된 문제 */}
          {data.upcoming.length > 0 ? (
            <section>
              <SectionHead title="예정된 문제" />
              <ul className="flex flex-col gap-2.5 px-5 pb-6">
                {data.upcoming.map((quiz) => (
                  <UpcomingQuizRow key={quiz.id} quiz={quiz} />
                ))}
              </ul>
            </section>
          ) : null}

          {/* 지난 문제 보관함 */}
          <section>
            <SectionHead title="지난 문제 (보관함)" />
            {data.past.length > 0 ? (
              <ul className="flex flex-col px-5 pb-6">
                {data.past.map((quiz) => (
                  <PastQuizRow key={quiz.id} quiz={quiz} />
                ))}
              </ul>
            ) : (
              <EmptyState title="지난 문제가 아직 없어요" className="py-8" />
            )}
          </section>
        </>
      )}
    </div>
  );
}

import { Flag, NightCard } from "@/shared/ui";
import { formatCount } from "@/shared/lib";
import { ROUTES } from "@/shared/config";
import type { HomeTodayQuiz } from "../model/types";

/**
 * 오늘의 퀴즈 다크 배너 — 에메랄드 mono 라벨 + 국기 4줄 프리뷰 + 에메랄드 CTA.
 * 국기 줄 순서는 프로토타입 홈 배너와 동일 (rows[0]=GK줄이 맨 위).
 */
export function QuizBanner({ quiz }: { quiz: HomeTodayQuiz }) {
  return (
    <section className="px-5">
      <NightCard
        href={ROUTES.quizDetail(quiz.id)}
        aria-label={`오늘의 퀴즈: ${quiz.title}`}
        className="relative block overflow-hidden p-5"
      >
        {/* 라벨 줄 */}
        <span className="mb-2.5 flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-primary">
            ▸ 오늘의 퀴즈
          </span>
          <span className="tnum text-[11px] text-ink-mute-2">
            정답률 <span className="font-mono">{quiz.accuracyPct}%</span>
          </span>
        </span>

        {/* 제목 */}
        <h2 className="mb-3.5 block text-[21px] font-semibold leading-[1.25] tracking-[-0.4px] text-white">
          {quiz.title}
        </h2>

        {/* 국기 프리뷰 — 라인업 없는 문제(비라인업 퀴즈)면 생략 */}
        {quiz.lineupRows.length > 0 && (
          <span className="mb-3.5 flex flex-col gap-2.5 rounded-[10px] bg-white/[0.04] p-3.5">
            {quiz.lineupRows.map((row, rowIndex) => (
              <span key={rowIndex} className="flex justify-center gap-2">
                {row.map((cell, cellIndex) => (
                  <Flag
                    key={`${cell.pos}-${cellIndex}`}
                    code={cell.flag}
                    width={24}
                    height={16}
                  />
                ))}
              </span>
            ))}
          </span>
        )}

        {/* CTA 줄 — 배너 전체가 링크라 버튼은 표시용 요소 */}
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-sm bg-primary px-3 py-2 text-[13px] font-medium leading-none text-on-primary">
            맞춰보기 →
          </span>
          <span className="text-[11px] text-ink-mute-2">
            <span className="tnum font-mono">{formatCount(quiz.attempts)}</span>명 도전 중
          </span>
        </span>
      </NightCard>
    </section>
  );
}

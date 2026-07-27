"use client";

import { cn } from "@/shared/lib";
import { Flag } from "@/shared/ui";
import type { QuizLineup } from "@/entities/quiz";

interface QuizPitchProps {
  lineup: QuizLineup;
  /** 정답 공개 시 칩 살짝 확대 */
  reveal: boolean;
}

/**
 * 피치 뷰 — 그린 그라데이션 + 잔디 스트라이프 + 라인 프레임 위에
 * 포메이션 4줄(GK 하단, column-reverse)을 국기+포지션 칩으로 렌더.
 */
export function QuizPitch({ lineup, reveal }: QuizPitchProps) {
  return (
    /* 그라데이션은 arbitrary로 — bg-linear-* 유틸은 in oklab 보간이라 원본 sRGB와 중간색이 다르다 */
    <div className="relative aspect-[3/4] overflow-hidden rounded-[14px] bg-[linear-gradient(to_bottom,#2d7a4f_0%,#245d3d_100%)] px-4 py-5">
      {/* 잔디 세로 스트라이프 (24px 간격) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_right,transparent_0,transparent_24px,rgba(255,255,255,0.04)_24px,rgba(255,255,255,0.04)_48px)]"
      />
      {/* 라인 프레임 + 센터라인 + 센터서클 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-2 rounded-[10px] border-[1.5px] border-white/45"
      >
        <div className="absolute inset-x-0 top-1/2 h-[1.5px] bg-white/40" />
        {/* 이 요소는 애니메이션·트랜지션이 없어 표준 translate 유틸을 그대로 쓴다 */}
        <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/40" />
      </div>

      {/* 포메이션 — 라인의 목록 × 라인별 선수 목록. column-reverse로 GK줄(rows[0])이 하단 */}
      <ul className="relative z-[1] flex h-full flex-col-reverse justify-around gap-2">
        {lineup.rows.map((row, rowIndex) => (
          <li key={rowIndex}>
            <ul className="flex justify-around">
              {row.map((cell, cellIndex) => (
                <li
                  key={cellIndex}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 py-1 pl-1 pr-2 backdrop-blur-[6px]",
                    "transition-[transform] duration-[250ms] ease-otb",
                    // ⚠ scale-* 표준 유틸 금지 — 개별 scale 프로퍼티로 출력되어 위 transition-[transform]이 잡지 못한다
                    reveal ? "[transform:scale(1.04)]" : "[transform:scale(1)]",
                  )}
                >
                  <Flag code={cell.flag} width={20} height={14} />
                  <span className="font-mono text-[9px] tracking-[0.4px] text-white/85">
                    {cell.pos}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { Flag } from "@/shared/ui";
import type { QuizLineup } from "@/entities/quiz";

type QuizPitchProps = {
  lineup: QuizLineup;
  /** 정답 공개 시 칩 살짝 확대 */
  reveal: boolean;
};

/**
 * 피치 뷰 — 그린 그라데이션 + 잔디 스트라이프 + 라인 프레임 위에
 * 포메이션 4줄(GK 하단, column-reverse)을 국기+포지션 칩으로 렌더.
 */
export function QuizPitch({ lineup, reveal }: QuizPitchProps) {
  return (
    <div
      className="relative overflow-hidden rounded-[14px] px-4 py-5"
      style={{
        aspectRatio: "3 / 4",
        background: "linear-gradient(to bottom, #2d7a4f 0%, #245d3d 100%)",
      }}
    >
      {/* 잔디 세로 스트라이프 (24px 간격) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, transparent 0, transparent 24px, rgba(255,255,255,0.04) 24px, rgba(255,255,255,0.04) 48px)",
        }}
      />
      {/* 라인 프레임 + 센터라인 + 센터서클 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-2 rounded-[10px]"
        style={{ border: "1.5px solid rgba(255,255,255,0.45)" }}
      >
        <div
          className="absolute inset-x-0 top-1/2"
          style={{ height: 1.5, background: "rgba(255,255,255,0.4)" }}
        />
        <div
          className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ border: "1.5px solid rgba(255,255,255,0.4)" }}
        />
      </div>

      {/* 포메이션 — column-reverse로 GK줄(rows[0])이 하단 */}
      <div className="relative z-[1] flex h-full flex-col-reverse justify-around gap-2">
        {lineup.rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-around">
            {row.map((cell, cellIndex) => (
              <div
                key={cellIndex}
                className="inline-flex items-center gap-1.5 rounded-full backdrop-blur-[6px]"
                style={{
                  background: "rgba(0,0,0,0.55)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  padding: "4px 8px 4px 4px",
                  transform: reveal ? "scale(1.04)" : "scale(1)",
                  transition: "transform 250ms cubic-bezier(0.2,0,0,1)",
                }}
              >
                <Flag code={cell.flag} width={20} height={14} />
                <span className="font-mono text-[9px] tracking-[0.4px] text-white/85">
                  {cell.pos}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

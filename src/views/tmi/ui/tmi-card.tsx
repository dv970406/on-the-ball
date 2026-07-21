"use client";

import type { CSSProperties } from "react";
import { readTmiPollMeta, type PollListItem } from "@/entities/poll";
import { Avatar, Flag } from "@/shared/ui";
import { cn, formatCount } from "@/shared/lib";
import { isMajoritySide, truePctOf, type TmiSide } from "../model/deck";

type TmiCardProps = {
  poll: PollListItem;
  /** 덱 내 순번 (0-base) */
  order: number;
  total: number;
  /** 뒤 카드 peek 상태 (translateY(12px) scale(0.96) opacity 0.6) */
  peek?: boolean;
  /** 이번 세션에서 방금/이전에 판정한 면 — 결과 오버레이 노출용 (null이면 미판정) */
  resultSide?: TmiSide | null;
  /** 카드 이탈 방향 — 진실=우측, 거짓=좌측 */
  exitSide?: TmiSide | null;
};

/** 이탈 애니메이션 transform — translateX(±120%) rotate(±14deg) */
function cardStyle(peek: boolean, exitSide: TmiSide | null): CSSProperties {
  if (peek) {
    return { transform: "translateY(12px) scale(0.96)", opacity: 0.6, zIndex: 1 };
  }
  if (exitSide) {
    return {
      transform:
        exitSide === "true"
          ? "translateX(120%) rotate(14deg)"
          : "translateX(-120%) rotate(-14deg)",
      opacity: 0,
      zIndex: 2,
    };
  }
  return { transform: "translateY(0) scale(1)", opacity: 1, zIndex: 2 };
}

/** TMI 판정 카드 한 장 — 주장 + 출처 박스 + (판정 후) 진실/거짓 비율 결과 */
export function TmiCard({ poll, order, total, peek = false, resultSide = null, exitSide = null }: TmiCardProps) {
  const meta = readTmiPollMeta(poll);
  const truePct = truePctOf(poll);
  const falsePct = 100 - truePct;
  // peek 카드는 항상 미판정 상태로 보여준다 (뒷장 스포일러 방지)
  const showResult = !peek && resultSide !== null;
  const myWins = resultSide !== null && isMajoritySide(poll, resultSide);

  return (
    <article
      aria-hidden={peek}
      className="absolute inset-0 flex flex-col rounded-[18px] border border-hairline bg-canvas p-[28px_24px_24px] transition-[transform,opacity] duration-[350ms] ease-otb [box-shadow:0_8px_24px_rgba(0,0,0,0.08)]"
      style={cardStyle(peek, exitSide)}
    >
      {/* 선수 아바타 + 국기 + 클럽 */}
      <header className="mb-4 flex items-center gap-2.5">
        <Avatar label={meta.player} size={44} className="text-base font-semibold" />
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <Flag code={meta.flag} width={16} height={11} />
            <span className="text-[15px] font-semibold text-ink">{meta.player}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-ink-mute">{meta.club}</div>
        </div>
        <span className="font-mono text-[11px] text-ink-mute-2 tnum">
          {order + 1}/{total}
        </span>
      </header>

      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.6px] text-ink-mute-2">
        TMI · 떡밥
      </div>

      {/* 주장 */}
      <h2 className="mb-3.5 text-[22px] font-bold leading-[1.3] tracking-[-0.4px] text-ink">
        {poll.title}
      </h2>

      {/* 출처 미상 디테일 박스 */}
      <div className="mb-auto rounded-[10px] border border-hairline-cool bg-canvas-soft p-3 text-xs leading-normal text-ink-mute">
        <span className="font-medium text-ink">출처 미상 — </span>
        {meta.detail}
      </div>

      {showResult ? (
        <div className="mt-4 animate-fade-up">
          {/* 진실/거짓 비율 바 — primary vs 잉크 다크 */}
          <div className="flex h-[38px] overflow-hidden rounded-[10px] border border-hairline">
            <div
              className="flex items-center overflow-hidden whitespace-nowrap bg-primary px-3 text-sm font-bold text-on-primary transition-[width] duration-500 ease-otb"
              style={{ width: `${truePct}%` }}
            >
              진실 {truePct}%
            </div>
            <div
              className="flex items-center justify-end overflow-hidden whitespace-nowrap bg-ink px-3 text-sm font-bold text-white transition-[width] duration-500 ease-otb"
              style={{ width: `${falsePct}%` }}
            >
              {falsePct}% 거짓
            </div>
          </div>
          <footer className="mt-2 flex items-baseline justify-between text-[11px] text-ink-mute">
            <span>
              <span className="font-mono tnum">{formatCount(poll.totalVotes)}</span>
              명이 가렸어요
            </span>
            <span className={cn(myWins ? "text-primary-deep" : "text-crimson")}>
              내 선택: {resultSide === "true" ? "진실" : "거짓"} (
              {myWins ? "다수 의견" : "소수 의견"})
            </span>
          </footer>
        </div>
      ) : (
        <div className="mt-4 text-center text-[11px] text-ink-mute-2">← 거짓 · 진실 →</div>
      )}
    </article>
  );
}

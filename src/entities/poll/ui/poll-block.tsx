"use client";

import type { ReactNode } from "react";
import { COLOR } from "@/shared/config";
import { cn, formatCount } from "@/shared/lib";
import { RatioBar, Skeleton } from "@/shared/ui";
import type { Poll, PollResult } from "../model/types";

interface PollBlockProps {
  poll: Poll;
  /**
   * 선택지별 득표수. **`null`이면 아직 볼 수 없다는 뜻**(미투표·비로그인)이고,
   * 빈 배열은 "열렸는데 표가 없다"이다 — 둘을 구분해야 화면이 거짓말하지 않는다.
   */
  results: PollResult[] | null;
  /**
   * 집계를 **기다리는 중**인가.
   *
   * ⚠ `results === null`만으로 판정하면 안 된다 — "아직 안 왔다"와 "조회가 실패했다"가
   *   같은 값이 되어, 실패했을 때 스켈레톤이 **영원히 돈다**("곧 온다"는 거짓 신호).
   *   실패는 상위가 배너로 알리고 이 값은 false가 된다.
   */
  resultsPending?: boolean;
  /** 없으면 읽기 전용 — 세션 판정은 상위(features)가 한다 */
  onVote?: (optionId: number) => void;
  /** 로그인 유도 등. entity가 인증 경로를 알 이유가 없어 슬롯으로 받는다 */
  footer?: ReactNode;
}

/**
 * 글에 딸린 투표 (단일 선택 · 마감 없음).
 *
 * 프레젠테이션 전용이다 — 세션도 뮤테이션도 모른다(`PostCard`·`CommentItem`과 같은 자리).
 * 세션 3분기와 실제 투표는 `features/cast-poll-vote`의 `PollVote`가 갖는다.
 *
 * ⚠ **막대를 에메랄드로 칠하지 않는다.** 상세 화면의 컬러 이벤트는 `LikeButton`이 이미
 *   갖고 있어("한 뷰포트당 컬러 이벤트 1개") 여기서 또 쓰면 규칙이 깨진다. 잉크 래더만 쓰되
 *   **내가 고른 선택지만 진하게** 해서 "내 표"를 색이 아닌 명도로 전달한다.
 *
 * ⚠ `role="radiogroup"`을 쓰지 않는다 — 화살표 키 이동(roving tabindex)을 약속하는 롤인데
 *   구현하지 않기 때문이다(말머리 칩 레일과 같은 판단). `aria-pressed`로 상태만 알린다.
 */
export function PollBlock({ poll, results, resultsPending, onVote, footer }: PollBlockProps) {
  const total = results?.reduce((sum, r) => sum + r.voteCount, 0) ?? 0;
  const countOf = (optionId: number) =>
    results?.find((r) => r.optionId === optionId)?.voteCount ?? 0;

  /**
   * 투표는 했는데 집계가 아직 안 온 순간.
   *
   * ⚠ 이 구간을 비워 두면 막대가 나중에 끼어들며 **레이아웃이 두 번 튄다**(선택 표시 한 번,
   *   막대 한 번). 규약대로 Skeleton으로 구조를 유지한다(data-and-state.md).
   * ⚠ 한때 `results === null && myOptionId !== null`로 **파생**시켰는데, 그러면 조회가
   *   실패했을 때도 참이 되어 스켈레톤이 영원히 돌았다 — 판정은 상위가 준다.
   */
  const awaitingResults = results === null && resultsPending === true;

  return (
    // ⚠ 여기만 `aria-label`이고 작성 화면(`PollComposer`)은 `aria-labelledby`인데, 어긋난 게
    //   아니라 **같은 기준의 두 결과**다 — "보이는 텍스트가 있으면 그것을 가리킨다".
    //   저쪽에는 "투표"라는 제목이 화면에 있고, 이쪽의 제목은 질문 자체라 영역의 이름으로는
    //   맞지 않는다(질문을 이름으로 삼으면 "이게 투표다"라는 사실이 사라진다).
    <section
      aria-label="투표"
      className="mt-5 rounded-[14px] border border-hairline-cool bg-canvas-soft px-4 py-4"
    >
      <h2 className="text-[15px] font-semibold leading-[1.45] tracking-[-0.3px] text-ink">
        {poll.question}
      </h2>

      <ul className="mt-3.5 flex flex-col gap-2">
        {poll.options.map((option) => {
          const mine = poll.myOptionId === option.id;
          const count = countOf(option.id);
          // 0으로 나누지 않는다 — 결과가 열렸는데 총 0표인 순간이 실제로 있다(내 표가 롤백된 직후)
          const ratio = total > 0 ? count / total : 0;

          return (
            <li key={option.id}>
              <button
                type="button"
                // ⚠ 텍스트가 든 버튼이라 aria-label을 붙이지 않는다(콘텐츠를 덮어쓴다)
                aria-pressed={mine}
                disabled={!onVote}
                onClick={onVote ? () => onVote(option.id) : undefined}
                className={cn(
                  "w-full rounded-sm border bg-canvas px-3 py-2.5 text-left",
                  "transition-colors duration-150 ease-otb",
                  mine ? "border-ink" : "border-hairline-cool",
                  onVote ? "active:border-ink" : "disabled:opacity-100",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[14px]",
                      mine ? "font-semibold text-ink" : "text-ink-secondary",
                    )}
                  >
                    {option.label}
                  </span>
                  {mine && <span className="sr-only">— 내가 고른 선택지</span>}
                  {results && (
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-mute">
                      {Math.round(ratio * 100)}%
                      <span className="sr-only"> ({formatCount(count)}표)</span>
                    </span>
                  )}
                </span>
              </button>
              {/*
                ⚠ 막대는 **버튼 밖**이다. `RatioBar`·`Skeleton`의 루트가 `div`인데
                  `button`의 콘텐츠 모델은 phrasing content라 `div`를 담을 수 없다
                  (브라우저가 관용해 조용히 통과하지만 무효 HTML이다).
                ⚠ rounded-full도 쓰지 않는다 — styling.md 예외 목록에 이 파일을 올려야 하는데,
                  4px 높이에서 Skeleton 기본 rounded-md와 시각차가 없다.
              */}
              {results && (
                <RatioBar
                  className="mt-2"
                  height={4}
                  segments={[{ ratio, color: mine ? COLOR.ink : COLOR.hairlineStrong }]}
                />
              )}
              {awaitingResults && <Skeleton className="mt-2 h-1 w-full" />}
            </li>
          );
        })}
      </ul>

      {/* ⚠ 참여자 수도 결과의 일부다 — 미투표자에게는 숫자를 흘리지 않는다 */}
      {results && (
        <p className="mt-3 text-[12px] text-ink-mute-2">{formatCount(total)}명이 투표했어요</p>
      )}
      {footer}
    </section>
  );
}

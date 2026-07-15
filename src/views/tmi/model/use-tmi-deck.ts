"use client";

import { useCallback, useMemo, useState } from "react";
import { usePollsQuery, type PollListItem } from "@/entities/poll";
import { useCastVote } from "@/features/cast-vote";
import { useDelayedReveal } from "@/shared/lib";
import { tmiSideOfOption, tmiSideOption, type TmiSide } from "./deck";

/** 결과 오버레이를 잠깐 보여주는 시간 */
const RESULT_HOLD_MS = 1200;
/** 카드 이탈 후 다음 카드까지의 지연 */
const NEXT_CARD_DELAY_MS = 600;

/**
 * TMI 판정 덱 상태머신 — tmi-view의 로직을 담당한다(뷰는 렌더만).
 * 판정 → 결과 오버레이(hold) → 카드 이탈 → 다음 카드(next) 시퀀스와
 * "이미 판정한 카드 넘겨보기"·"판정 불가 카드 건너뛰기" 전이를 관리한다.
 */
export function useTmiDeck() {
  const { data, isPending, isError, error, refetch } = usePollsQuery("tmi");
  const deck = useMemo(() => data ?? [], [data]);

  // 덱 진행 상태 (null = 아직 상호작용 전 — 첫 미판정 카드에서 시작)
  const [idx, setIdx] = useState<number | null>(null);
  // 이번 세션에서 판정한 면 — 서버 myVote 반영(리페치) 전에도 결과를 그리기 위한 로컬 기록
  const [localVotes, setLocalVotes] = useState<Record<string, TmiSide>>({});
  const [exitSide, setExitSide] = useState<TmiSide | null>(null);
  // 진행 중인 시퀀스 — 애니메이션 동안 하단 UI가 흔들리지 않게 유지
  const [flow, setFlow] = useState<"idle" | "judging" | "skipping">("idle");
  const [inlineError, setInlineError] = useState<string | null>(null);

  const hold = useDelayedReveal(RESULT_HOLD_MS);
  const next = useDelayedReveal(NEXT_CARD_DELAY_MS);

  /** 카드의 판정 면 — 로컬 기록 우선, 없으면 서버 myVote */
  const sideOf = useCallback(
    (poll: PollListItem): TmiSide | null =>
      localVotes[poll.id] ?? (poll.myVote ? tmiSideOfOption(poll, poll.myVote) : null),
    [localVotes],
  );

  // 첫 진입 시작 위치: 이미 판정한 카드는 건너뛰고 첫 미판정 카드부터 (전부 판정이면 요약)
  const firstUnjudged = useMemo(() => {
    const first = deck.findIndex((poll) => sideOf(poll) === null);
    return first === -1 ? deck.length : first;
  }, [deck, sideOf]);

  const cursor = idx ?? firstUnjudged;
  const current = deck[cursor];
  const peek = deck[cursor + 1];
  const done = deck.length > 0 && cursor >= deck.length;

  const castVote = useCastVote(current?.id ?? "");
  const animating = castVote.isPending || hold.pending || next.pending || exitSide !== null;
  const currentSide = current ? sideOf(current) : null;

  /** 다음 카드로 전진 — 애니메이션 상태 초기화 */
  const advance = () => {
    setExitSide(null);
    setFlow("idle");
    hold.reset();
    next.reset();
    setIdx((v) => (v ?? cursor) + 1);
  };

  /** 판정 — 성공 시 결과 오버레이 → 카드 이탈 → 600ms 후 다음 카드 */
  const judge = (side: TmiSide) => {
    if (!current || animating || currentSide !== null) return;
    // 옵션 id는 문자열 조립 대신 meta.verdict 기준으로 조회 (시드 id 관례에 결합 금지)
    const option = tmiSideOption(current, side);
    if (!option) {
      setInlineError("선택지 정보를 찾지 못했어요.");
      return;
    }
    // 리페치로 시작 위치가 밀리지 않도록 현재 커서를 고정
    if (idx === null) setIdx(cursor);
    setFlow("judging");
    setInlineError(null);
    castVote.mutate(option.id, {
      onSuccess: () => {
        setLocalVotes((prev) => ({ ...prev, [current.id]: side }));
        hold.trigger(() => {
          setExitSide(side);
          next.trigger(advance);
        });
      },
      onError: (e) => {
        // 마감/변경 제한 등 — 카드는 이탈시키지 않고 인라인으로 안내
        setFlow("idle");
        setInlineError(e instanceof Error ? e.message : "판정을 저장하지 못했어요.");
      },
    });
  };

  /** 이미 판정한 카드 넘겨보기 — 내 판정 방향으로 이탈 */
  const skip = () => {
    if (!current || animating || currentSide === null) return;
    if (idx === null) setIdx(cursor);
    setFlow("skipping");
    setExitSide(currentSide);
    next.trigger(advance);
  };

  /** 판정 불가 카드(마감 등) 건너뛰기 — 인라인 에러 해제 후 전진 */
  const skipBrokenCard = () => {
    if (idx === null) setIdx(cursor);
    setInlineError(null);
    advance();
  };

  /** 덱 완료 후 처음부터 결과 다시 보기 */
  const review = () => setIdx(0);

  // 하단 컨트롤: 판정 완료 카드는 넘겨보기 UI, 그 외(판정 시퀀스 포함)는 판정 버튼 유지
  const showSkipControls =
    flow === "skipping" || (flow === "idle" && currentSide !== null);

  return {
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
  };
}

"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ROUTES, predictionRound, transferWindowByKey } from "@/shared/config";
import { cn, formatCount } from "@/shared/lib";
import { Icon, Skeleton, chipClassName } from "@/shared/ui";
import {
  latestVotedRound,
  myPickOf,
  tallyOf,
  yesShare,
  type DealPrediction,
  type PredictionTally,
} from "@/entities/prediction";
import { useSessionStore } from "@/entities/session";
import { usePredictDeal } from "../model/use-predict-deal";

interface PredictionCardProps {
  dealId: number;
  /** 결과가 나왔는가(합의 완료·오피셜) — 그러면 투표가 닫힌다(DB 트리거와 같은 판정) */
  settled: boolean;
  /** 한 딜의 예측 — `undefined`면 아직 받는 중이거나 실패했다 */
  prediction: DealPrediction | undefined;
  error: Error | null;
  onRetry: () => void;
  /**
   * 누른 사람 — **캐시 키와 같은 사용자**다(세션 복원 전에는 서버가 본 사용자). 낙관적 갱신이 그 키 하나만 고친다.
   */
  userId: string | undefined;
  /**
   * 회차를 고르는 기준 시각 — ⚠ 서버 시각이 먼저다(`serverNowMs ?? useNowMs()` — 뷰가 고른다). 회차는 SSR로 그려진다.
   */
  nowMs: number | null;
  /** 비로그인이 눌렀다 — 안내는 뷰가 한 벌 갖는다(`SignInDialog` 주석) */
  onSignInRequired: (action: string) => void;
  /**
   * 카드 제목의 단계 — 놓인 자리의 제목 계층을 따른다. 기본은 딜 상세의 구역 단계(`h2`)이고, 보드의 오른쪽 판은 판 제목(`h2`)
   * 아래라 `h3`을 준다(고정이면 판 안에서 `h2 선수 → h3 … → h2 예측 → h3 최신 보도`로 계층이 뒤집힌다).
   */
  headingLevel?: "h2" | "h3";
  /** 바깥 여백 — 기본은 상세의 카드 사이 간격(`mt-3`). 넓은 화면의 곁 칸·보드의 오른쪽 판은 자기 간격을 준다 */
  className?: string;
}

/** 칸 라벨 — 이적료 카드와 같은 mono 10 uppercase */
const labelClassName = "font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2";

/**
 * 성사 예측 카드 — "이번 창 안에 오피셜이 뜰까?" 성사·불발 두 버튼과 팬 예측 비율.
 *
 * - **고르기 전에는 비율을 보여 주지 않는다**(참여 수만) — 먼저 본 비율을 따라 고르면 예측이 아니라 쏠림이 된다.
 *   채점도 소수 의견을 맞힐수록 점수가 커서(`api-and-db.md` 딜 성사 예측 절), 남의 비율을 보고 고르는 것은 손해다.
 * - 고르면 바꿀 수는 있지만 거둘 수는 없다(DB에 DELETE 경로가 없다) — 고른 버튼을 다시 눌러도 아무 일이 없다.
 * - 결과가 나오면(합의 완료·오피셜) 버튼을 걷고 마지막 회차의 비율과 내 예측만 남긴다.
 * - 다음 창 일정이 없으면(`windows.json`을 아직 갱신하지 않았다) 카드를 그리지 않는다 — 눌러도 DB가 받지 않는다.
 *
 * ⚠ 에메랄드를 쓰지 않는다 — 이 화면의 CTA는 하단 관심 토글이다(`styling.md` "CTA가 둘이면 나중 것을 잉크로").
 *   고른 버튼은 칩과 같은 잉크 채움이다.
 * ⚠ **세션 `status`를 3분기한다**(`WatchToggle`과 같다) — `loading`에 비로그인 안내를 띄우면 복원 중인 로그인 사용자가
 *   안내를 본다. 그동안은 서버가 그린 내 표를 그대로 보여 주고 누르는 것만 막는다.
 * ⚠ 중복 가드는 없다 — 낙관적 갱신이다(`usePredictDeal` 주석). `disabled`는 세션 복원 중에만 건다.
 * ⚠ **같은 tick의 연타를 prop으로 판정하지 않는다**(`CommentVoteButtons`와 같다) — 낙관적 갱신은 캐시를 곧바로 고치지만
 *   `prediction` prop은 다음 렌더에야 바뀌어, 그 사이 들어온 두 번째 클릭은 옛 표를 보고 같은 요청을 한 번 더 만든다
 *   (분석 이벤트도 두 번 센다). 마지막으로 요청한 표를 ref에 적어 두고 캐시가 따라오면(`pick`이 바뀌면) 비운다.
 */
export function PredictionCard({
  dealId,
  settled,
  prediction,
  error,
  onRetry,
  userId,
  nowMs,
  onSignInRequired,
  headingLevel: Heading = "h2",
  className = "mt-3",
}: PredictionCardProps) {
  const headingId = useId();
  const status = useSessionStore((s) => s.status);
  const predict = usePredictDeal(dealId);
  const requestedRef = useRef<boolean | null>(null);

  // 닫힌 딜은 표가 있는 마지막 회차를, 열린 딜은 지금 받는 회차를 그린다
  const round = settled
    ? (() => {
        const key = latestVotedRound(prediction);
        return key ? (transferWindowByKey(key) ?? { key, label: key }) : null;
      })()
    : nowMs === null
      ? null
      : predictionRound(nowMs);
  const pick = round ? myPickOf(prediction, round.key) : null;

  // 캐시가 따라오면(낙관적 갱신·롤백·재조회로 내 표가 바뀌면) 다시 캐시를 믿는다
  useEffect(() => {
    requestedRef.current = null;
  }, [pick]);

  if (!round) return null;

  const tally = tallyOf(prediction, round.key);
  const revealed = settled || pick !== null;

  const choose = (next: boolean) => {
    if (status === "loading") return;
    if (status === "guest" || !userId) {
      onSignInRequired("성사 여부를 예측하려면");
      return;
    }
    const current = requestedRef.current ?? pick;
    // 고른 것을 다시 누르면 아무 일도 하지 않는다(거두기가 없다)
    if (current === next) return;
    requestedRef.current = next;
    predict.mutate({ userId, roundKey: round.key, current, next });
  };

  return (
    <section aria-labelledby={headingId} className={cn("rounded-lg border border-hairline p-3.5", className)}>
      <div className="flex items-center gap-2">
        <span className={labelClassName}>성사 예측 · {round.label}</span>
        <Link
          href={ROUTES.ranking}
          className="relative ml-auto flex items-center text-[12px] text-ink-mute after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
        >
          예측 랭킹
          <Icon as={ChevronRight} size={14} />
        </Link>
      </div>
      <Heading id={headingId} className="mt-2 text-[16px] font-semibold leading-[1.4] tracking-[-0.3px] text-ink">
        {settled ? "결과가 나와 예측이 닫혔어요" : `${round.label} 이적 창 안에 오피셜이 뜰까요?`}
      </Heading>

      {/* 받는 중 — 버튼 줄과 같은 높이를 잡아 도착 순간 카드가 늘지 않게 한다 */}
      {!prediction && !error && <Skeleton className="mt-3 h-[46px] w-full" />}

      {/* 보여줄 데이터가 없을 때만 — 예측은 곁다리라 본문(딜)을 가리지 않고 이 자리에서만 알린다 */}
      {!prediction && error && (
        <p className="mt-3 text-[13px] leading-[1.5] text-ink-mute">
          예측을 불러오지 못했어요.{" "}
          <button type="button" onClick={onRetry} className="font-medium text-ink underline underline-offset-2">
            다시 시도
          </button>
        </p>
      )}

      {prediction && !settled && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { value: true, label: "성사" },
            { value: false, label: "불발" },
          ].map(({ value, label }) => (
            <button
              key={label}
              type="button"
              aria-pressed={pick === value}
              // 세션 복원 전에는 누를 수 없다는 것을 보여 준다(`WatchToggle`과 같다) — 막지 않으면 클릭이 조용히 삼켜진다
              disabled={status === "loading"}
              onClick={() => choose(value)}
              className={chipClassName(pick === value, "w-full py-[15px] text-[14px] disabled:opacity-60")}
            >
              {label}
              {status === "guest" && <span className="sr-only">(로그인 필요)</span>}
            </button>
          ))}
        </div>
      )}

      {prediction && <TallyLine tally={tally} revealed={revealed} />}

      {prediction && (
        <p className="mt-2 text-[12px] leading-[1.5] text-ink-mute-2">
          {settled
            ? pick === null
              ? "결과가 나와 더는 예측을 받지 않아요."
              : `내 예측: ${pick ? "성사" : "불발"} · 점수는 매시 랭킹에 반영돼요.`
            : `${round.label} 창이 닫힐 때까지 바꿀 수 있어요. 남들과 다른 예측을 맞힐수록 점수가 커요.`}
        </p>
      )}
    </section>
  );
}

/**
 * 팬 예측 — 고르기 전에는 참여 수만, 고른 뒤(또는 닫힌 뒤)에는 비율 막대.
 * 표가 적으면(`yesShare`가 null) 비율 대신 표 수를 적는다.
 * ⚠ 막대의 폭은 런타임 값이라 `style`로 준다(`styling.md` 동적 값 규칙). 막대는 장식이라 숨기고 뜻은 글자가 진다.
 */
function TallyLine({ tally, revealed }: { tally: PredictionTally; revealed: boolean }) {
  const total = tally.yes + tally.no;
  const share = yesShare(tally);

  if (!revealed) {
    return (
      <p className="mt-3 text-[13px] text-ink-mute">
        {total === 0
          ? "아직 예측한 사람이 없어요. 고르면 팬들의 예측이 보여요."
          : `${formatCount(total)}명이 예측했어요. 고르면 팬들의 예측이 보여요.`}
      </p>
    );
  }

  if (share === null) {
    return (
      <p className="mt-3 font-mono text-[13px] tabular-nums text-ink-mute">
        성사 {formatCount(tally.yes)}표 · 불발 {formatCount(tally.no)}표
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div aria-hidden className="flex h-2 overflow-hidden rounded-[2px] bg-hairline">
        <span className="bg-ink" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-1.5 flex font-mono text-[13px] tabular-nums text-ink-mute">
        <span>성사 {share}%</span>
        <span className="ml-auto">불발 {100 - share}%</span>
      </p>
      <p className="mt-0.5 text-[12px] text-ink-mute-2">{formatCount(total)}명 예측</p>
    </div>
  );
}

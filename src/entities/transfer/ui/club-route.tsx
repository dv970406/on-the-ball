import { ArrowRight, Slash, X } from "lucide-react";
// ⚠ 배럴이 아니라 직접 경로다 — `"use client"`가 없어 서버 렌더 여지를 남긴다(`pill.tsx`와 같은 이유)
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui";
import { destinationClubs, routeLabels } from "../lib/route-label";
import { isDeadStage } from "../lib/stage";
import type { TransferDeal } from "../model/types";
import { CrestStack } from "./crest-stack";
import { TransferCrest } from "./transfer-crest";

interface ClubRouteProps {
  deal: Pick<TransferDeal, "fromClub" | "toClub" | "isFreeAgent" | "suitors" | "stage">;
  /** 엠블럼 px */
  size: number;
  className?: string;
  /** 표의 칸 표지 — `DealRow`가 `"route"`를 넘긴다(칸 배치·md+ 줄바꿈은 `DealTable`의 범위가 건다) */
  "data-col"?: string;
}

/**
 * `로고 약칭 → 로고 약칭` — 행선지만 `font-medium text-ink`로 강조한다.
 * ⚠ **약칭이다**(정식명은 상세 경로 카드만) — 좁은 폭에 두 구단을 놓는 자리에서 정식명은 잘리고,
 *   잘린 구단 이름은 어느 구단인지 알 수 없다(`Team.shortName`과 같은 판단).
 * ⚠ 빈 칸의 문구는 `routeLabels`가 정한다 — 자유계약의 출발은 `FA`, 아직 정해지지 않은 행선지는 `미정`.
 * ⚠ 행선지 자리에 구단이 여럿이면(여러 구단이 노리는 루머) 엠블럼을 겹쳐 그리고(`CrestStack`) 이름은 `routeLabels`가
 *   접은 글자(앞 셋 + `외 N`)를 **두 줄까지** 흘린다 — 한 줄 `truncate`면 세 번째 구단이 잘려 `외 N`의 수가 거짓이 된다.
 * ⚠ 표지(`data-name` — 이름 글자, `data-route-to` — 행선지 덩어리, 구단이 여럿이면 `"stacked"`)는 표의 범위(`DealTable`)가 md+에서 잘림을 풀고 줄을
 *   바꾸는 데 쓴다. 이 컴포넌트는 폭을 모른다 — 캐러셀·미니 카드에서는 표지가 아무 일도 하지 않는다.
 * ⚠ 죽은 딜은 화살표 대신 원을 그린다 — 결렬은 X, 부인은 빗금(`/`). 원(`rounded-full`)은 컨트롤이 아니라 표시 요소 —
 *   `styling.md` "대상이 아닌 것". 크림슨 채움이지만 행 전체가 `grayscale`이라 회색으로 보인다(색이 아니라 형태가 뜻을 진다).
 */
export function ClubRoute({ deal, size, className, "data-col": dataCol }: ClubRouteProps) {
  const label = routeLabels(deal);
  const dead = isDeadStage(deal.stage);
  const denied = deal.stage === "denied";
  const destinations = destinationClubs(deal);
  const stacked = destinations.length > 1;
  return (
    <span
      data-col={dataCol}
      className={cn(
        "flex min-w-0 items-center gap-[5px] text-[12px] text-ink-mute",
        stacked ? "items-start" : "whitespace-nowrap",
        className,
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-[5px]">
        <TransferCrest club={deal.fromClub} size={size} />
        <span data-name="" className="truncate">
          {label.from}
        </span>
      </span>
      {dead ? (
        <span
          aria-hidden
          className="inline-grid size-4 shrink-0 place-items-center rounded-full bg-crimson text-white"
        >
          <Icon as={denied ? Slash : X} size={11} />
        </span>
      ) : (
        <Icon as={ArrowRight} size={12} className="shrink-0 text-ink-faint" />
      )}
      {/* 스크린리더용 — 아이콘이 `aria-hidden`이라 방향이 읽히지 않는다. "A, 행선지 B (결렬)"로 읽힌다
          ("A에서 B"는 조사 "(으)로"를 구단 이름 받침에 맞춰 붙일 수 없어 쓰지 않는다) */}
      <span className="sr-only">, 행선지 </span>
      <span
        data-route-to={stacked ? "stacked" : ""}
        className={cn("inline-flex min-w-0 items-center gap-[5px]", dead ? "font-normal text-ink-mute-2" : "font-medium text-ink")}
      >
        {stacked ? (
          <CrestStack clubs={destinations} size={size} className={dead ? "opacity-50" : undefined} />
        ) : (
          <TransferCrest club={destinations[0] ?? null} size={size} className={dead ? "opacity-50" : undefined} />
        )}
        {/* 취소선은 이름 글자에 건다(엠블럼에는 어차피 그려지지 않는다) — 표가 md+에서 행선지 덩어리를 풀어도(`contents`) 남게 */}
        <span
          data-name=""
          className={cn(
            stacked ? "line-clamp-2 whitespace-normal" : "truncate",
            dead && "line-through decoration-hairline-strong",
          )}
        >
          {label.to}
        </span>
        {dead && <span className="sr-only"> ({denied ? "부인" : "결렬"})</span>}
      </span>
    </span>
  );
}

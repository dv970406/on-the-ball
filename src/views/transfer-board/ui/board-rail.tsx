"use client";

import { Heart, X } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
  dealInLeague,
  FeeDelta,
  FeeValue,
  playerName,
  StatusBadge,
  type TransferDealListItem,
  type TransferLeague,
  type TransferSort,
} from "@/entities/transfer";
import { ROUTES } from "@/shared/config";
import { cn, formatCount } from "@/shared/lib";
import { chipClassName, Icon } from "@/shared/ui";
import { boardHref } from "../lib/board-href";
import { LEAGUE_OPTIONS } from "../lib/league-options";
import type { ClubOption } from "../model/use-transfer-board";
import { BoardLink } from "./board-link";

/** 레일에 늘어놓는 그 밖의 구단 수 — `FilterRail`과 같은 판단(응원 구단·선택된 구단은 상한 밖) */
const MAX_OTHER_CHIPS = 14;

/** 레일 항목의 선택 표시 — 잉크 왼쪽 막대 + 옅은 배경(표의 고른 행과 같은 말). 그림자가 아니라 `after:`로 그린다 */
const RAIL_ON =
  "bg-canvas-soft after:absolute after:inset-y-0 after:left-0 after:w-[2px] after:bg-ink after:content-['']";

interface BoardRailProps {
  /** 보드 전체(필터 무관) — 리그 건수·관심 딜이 이 목록에서 나온다 */
  deals: readonly TransferDealListItem[];
  /** 리그 필터 안의 구단 — 응원 구단이 앞, 그 뒤는 딜 수 순(`useTransferBoard`) */
  clubOptions: readonly ClubOption[];
  league: TransferLeague | null;
  sort: TransferSort;
  club: string | null;
  watch: boolean;
  isGuest: boolean;
  /** 오른쪽 판에 열린 딜 — 관심 딜 목록에서 같은 딜을 표시한다 */
  selectedId: number | null;
  /** 비로그인이 관심 딜 자리를 눌렀다 — 안내는 뷰가 한 벌 렌더한다 */
  onWatchSignInRequired: () => void;
}

/**
 * `min-[90rem]` 왼쪽 레일 — 관심 딜 · 리그 · 구단. 그 폭에서 가운데의 `FilterRail`(리그 시트 버튼 + 칩 한 줄)을 대신한다.
 *
 * ⚠ **링크가 만드는 주소는 `FilterRail`·리그 시트와 같다**(`boardHref`) — 리그를 바꾸면 구단 필터를 푼다(다른 리그의 구단이다).
 *   전부 `BoardLink`라 서버를 부르지 않고 주소만 바꾼다. 선택 표시는 `aria-current="page"`.
 * ⚠ 관심 딜은 **상세 주소를 가진 링크**다(`data-deal-id`) — 이 폭에서는 보드가 일반 클릭을 가로채 오른쪽 판에 연다.
 *   목록은 필터와 무관하게 내가 담은 딜 전부다(필터로 가린 딜도 판에서 볼 수 있어야 한다).
 * ⚠ 비로그인에게는 관심 딜 자리가 로그인 안내 한 줄 + 버튼이다(누르면 `SignInDialog`). 이미 `?watch=1`로 들어온 비로그인도
 *   "관심만 보기"를 풀 수 있게 그 링크는 남기고, 그때는 버튼을 걷는다(같은 필터를 두 자리가 말하지 않는다 — `FilterRail`의
 *   관심 칩과 같은 판정).
 * ⚠ 구단 칩에 **건수를 적는다**(`FilterRail`과 다르다) — 세로 레일은 리그 목록이 건수를 함께 말하고 칩이 여러 줄로
 *   감겨 순서만으로는 많고 적음이 읽히지 않는다. 한 줄 가로 레일은 순서가 곧 건수라 숫자를 뺀다.
 * ⚠ 이 레일은 에메랄드를 새로 쓰지 않는다 — 관심 딜의 변동폭 화살표(`FeeDelta`)·상태 뱃지가 갖는 자리뿐이다.
 */
export function BoardRail({
  deals,
  clubOptions,
  league,
  sort,
  club,
  watch,
  isGuest,
  selectedId,
  onWatchSignInRequired,
}: BoardRailProps) {
  const watched = useMemo(() => deals.filter((d) => d.isWatched), [deals]);
  // 리그별 건수 — 행을 고를 때마다 레일도 다시 그려지므로 보드가 바뀔 때만 센다
  const leagueCounts = useMemo(
    () =>
      LEAGUE_OPTIONS.map(({ value }) =>
        value === null ? deals.length : deals.filter((d) => dealInLeague(d, value)).length,
      ),
    [deals],
  );
  const others = clubOptions.filter((o) => !o.followed);
  const shownClubs = [...clubOptions.filter((o) => o.followed), ...others.slice(0, MAX_OTHER_CHIPS)];
  const selectedClub = club === null ? null : clubOptions.find((o) => o.code === club);
  if (selectedClub && !shownClubs.includes(selectedClub)) shownClubs.push(selectedClub);

  return (
    <aside aria-label="관심 딜·필터" className="py-4">
      <section aria-labelledby="tm-rail-watch" className="pb-[18px]">
        <div className="flex items-baseline justify-between px-4 pb-2">
          <h2 id="tm-rail-watch" className="text-[12px] font-medium text-ink-mute">
            관심 딜
            {!isGuest && (
              <span className="ml-1.5 font-mono text-[11px] tabular-nums text-ink-mute-2">{watched.length}</span>
            )}
          </h2>
          {(!isGuest || watch) && (
            <BoardLink
              href={boardHref(league, sort, club, !watch)}
              aria-current={watch ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-0.5 text-[11.5px] transition-colors duration-150 ease-otb",
                watch ? "font-medium text-ink" : "text-ink-mute-2",
              )}
            >
              관심만 보기
              {watch && (
                <>
                  <Icon as={X} size={11} />
                  <span className="sr-only">필터 해제</span>
                </>
              )}
            </BoardLink>
          )}
        </div>
        {isGuest ? (
          <div className="px-4">
            <p className="text-[12px] leading-[1.5] text-ink-mute">
              {watch ? "로그인하고 관심 목록에 담은 딜이 여기 모여요." : "담아 둔 딜이 여기 모여요."}
            </p>
            {/* 관심만 보기가 이미 켜져 있으면 버튼을 두지 않는다 — 위의 "관심만 보기 ×"와 같은 필터를 두 번 말하게 된다 */}
            {!watch && (
              <button
                type="button"
                onClick={() => onWatchSignInRequired()}
                className="mt-2 h-8 w-full rounded-sm border border-hairline bg-canvas text-[12px] font-medium text-ink-secondary transition-colors duration-150 ease-otb active:bg-canvas-soft"
              >
                관심 딜 모아 보기
              </button>
            )}
          </div>
        ) : watched.length === 0 ? (
          <p className="px-4 text-[12px] leading-[1.5] text-ink-mute">
            딜 상세에서 ‘관심 목록에 담기’를 누르면 여기에 모여요.
          </p>
        ) : (
          <ul>
            {watched.map((deal) => {
              const on = deal.id === selectedId;
              return (
                <li key={deal.id} className={cn("relative", on && RAIL_ON)}>
                  <Link
                    href={ROUTES.transfer(deal.id)}
                    prefetch={false}
                    data-deal-id={deal.id}
                    aria-current={on ? "true" : undefined}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-4 py-[7px] transition-colors duration-150 ease-otb hover:bg-canvas-soft"
                  >
                    <span className="truncate text-[13.5px] font-medium text-ink">{playerName(deal)}</span>
                    <FeeValue
                      deal={deal}
                      caption={false}
                      labelClassName="text-[11.5px]"
                      className="justify-self-end text-[13px] text-ink"
                    />
                    <StatusBadge stage={deal.stage} className="justify-self-start" />
                    <FeeDelta deal={deal} className="justify-self-end" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="tm-rail-league" className="pb-[18px]">
        <h2 id="tm-rail-league" className="px-4 pb-2 text-[12px] font-medium text-ink-mute">
          리그
        </h2>
        <ul>
          {LEAGUE_OPTIONS.map(({ value, label }, i) => {
            const on = value === league;
            const count = leagueCounts[i];
            return (
              <li key={label} className={cn("relative", on && RAIL_ON)}>
                <BoardLink
                  href={boardHref(value, sort, null, watch)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between px-4 py-[7px] text-[13.5px] transition-colors duration-150 ease-otb hover:bg-canvas-soft",
                    on ? "font-medium text-ink" : "text-ink-secondary",
                  )}
                >
                  {label}
                  <span className="font-mono text-[12px] tabular-nums text-ink-mute-2">{formatCount(count)}</span>
                </BoardLink>
              </li>
            );
          })}
        </ul>
      </section>

      {(shownClubs.length >= 2 || selectedClub) && (
        <section aria-labelledby="tm-rail-club">
          <div className="flex items-baseline justify-between px-4 pb-2">
            <h2 id="tm-rail-club" className="text-[12px] font-medium text-ink-mute">
              구단
            </h2>
            {shownClubs.some((o) => o.followed) && (
              <span className="text-[11px] text-ink-mute-2">응원 구단이 앞</span>
            )}
          </div>
          <nav aria-label="구단 필터" className="flex flex-wrap gap-1.5 px-4">
            {shownClubs.map((o) => {
              const on = club === o.code;
              return (
                <BoardLink
                  key={o.code}
                  href={boardHref(league, sort, on ? null : o.code, watch)}
                  aria-current={on ? "page" : undefined}
                  className={chipClassName(on, "inline-flex items-center gap-1 whitespace-nowrap px-[9px] py-[7px] text-[12.5px]")}
                >
                  {o.followed && (
                    <>
                      <Icon as={Heart} size={11} className="fill-current" />
                      <span className="sr-only">응원 구단</span>
                    </>
                  )}
                  {o.label}
                  <span className={cn("font-mono text-[11px] tabular-nums", on ? "text-ink-faint" : "text-ink-mute-2")}>
                    {o.count}
                  </span>
                  {on && (
                    <>
                      <Icon as={X} size={12} className="-mr-0.5" />
                      <span className="sr-only">필터 해제</span>
                    </>
                  )}
                </BoardLink>
              );
            })}
          </nav>
        </section>
      )}
    </aside>
  );
}

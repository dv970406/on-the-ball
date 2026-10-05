"use client";

import { Bell, ChevronDown, Heart, X } from "lucide-react";
import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { chipClassName, Icon } from "@/shared/ui";
import { boardHref } from "../lib/board-href";
import { leagueLabel } from "../lib/league-options";
import type { ClubOption } from "../model/use-transfer-board";
import { BoardLink } from "./board-link";

/**
 * 레일에 늘어놓는 **그 밖의 구단** 수 — 그 뒤는 딜이 한두 건인 구단이라 칩으로 둘 가치가 작다. 선택된 구단은 순위와
 * 무관하게 남긴다. ⚠ 응원 구단은 이 상한에 들지 않는다 — 사용자가 고른 구단이 잘리면 "왜 내 구단이 없지"가 되고,
 * 응원 구단이 많다고 딜 수 상위 구단이 전부 밀려나도 안 된다.
 */
const MAX_OTHER_CHIPS = 14;

interface FilterRailProps {
  /** 보드(리그 필터 안)에 등장하는 구단 — 내 응원 구단이 앞, 그 뒤는 딜 수 많은 순 */
  options: readonly ClubOption[];
  /** 선택된 구단 코드 — URL이 소유한다(`?club=`). `null`은 전체 */
  club: string | null;
  league: TransferLeague | null;
  sort: TransferSort;
  /** 관심 딜만 보는가 — URL이 소유한다(`?watch=1`) */
  watch: boolean;
  /** 비로그인인가(복원 전에는 서버가 본 사용자로 판정한다 — `useTransferBoard`) — 관심 칩이 필터 대신 로그인 안내를 연다 */
  isGuest: boolean;
  onOpenLeague: () => void;
  /** 비로그인이 관심 칩을 눌렀다 — 안내는 뷰가 프레임 직속 자리에 한 벌 렌더한다(`SignInDialog` 주석) */
  onWatchSignInRequired: () => void;
}

const CHIP_LAYOUT = "inline-flex items-center gap-1 whitespace-nowrap";

/**
 * 필터 레일 — 왼쪽에 리그 버튼(시트를 연다)을 고정하고 그 뒤로 관심 칩과 구단 칩이 흐른다. 보드의 **필터는 이 한 줄이 전부**다
 * (구간 탭은 이동, 정렬은 순서 — 둘 다 필터가 아니라 다른 줄·다른 형태다).
 *
 * 팬이 이적 소식을 읽는 단위는 리그가 아니라 **구단**이다 — 리그 필터는 목록을 5분의 1로밖에 줄이지 못한다. 리그는
 * 구단 칩의 범위를 고르는 상위 선택으로 남는다(리그를 바꾸면 구단 필터는 풀린다 — 뷰의 `handleLeagueSelect`).
 *
 * ⚠ **칩은 이동이다(`BoardLink`)** — 상태를 URL이 소유하므로 정렬 링크와 같은 형태다(`nextjs.md` "필터는 색인
 *   대상인가": 같은 집합의 부분집합이라 색인 대상은 아니고 canonical에서 떨어진다). 누르면 서버를 부르지 않고 주소만
 *   바꾼다. 선택 표시는 `aria-current="page"`, 형태는 `chipClassName`(잉크, 에메랄드 아님).
 * ⚠ **관심 칩은 비로그인에게만 `button`이다.** 담은 딜이 없는 사람에게 필터를 걸어 빈 보드를 보여 주는 대신 로그인
 *   안내를 연다(이동이 아니라 동작이라 앵커가 아니다). 이미 `?watch=1`로 들어온 비로그인(공유 링크)에게는 링크로
 *   그려 필터를 풀 수 있게 한다. 서버 HTML도 같은 판정이다 — 익명에게 늘 빈 보드인 `?watch=1`을 크롤 가능한 앵커로
 *   내보내지 않는다.
 * ⚠ **`전체 구단` 칩이 없다.** 필터 없음이 기본 상태라 그 칩은 늘 켜져 있는 장식이었다 → 선택된 칩에 ×를 붙이고 그 칩의
 *   링크가 필터를 푼다(`href`가 구단 `null`). 칩 하나가 줄고 "무엇이 걸려 있는가"가 또렷해진다.
 * ⚠ **칩에 건수를 적지 않는다.** 순서가 이미 건수순이고, 누르면 구간 제목이 건수를 말한다 — 한 화면에 숫자 20개가
 *   붙어 있던 것이 정신없어 보인 원인 중 하나였다.
 * ⚠ 응원 구단 표시(하트)와 관심 칩의 종은 **잉크다(에메랄드 아님)** — 이 슬라이스는 에메랄드를 새로 쓰지 않는다. 아이콘이
 *   형태를 지고 sr-only 글자가 같은 뜻을 준다.
 * ⚠ 리그 버튼은 그냥 `button`이다 — `aria-haspopup`을 붙이지 않는다(과한 ARIA는 없느니만 못하다).
 * ⚠ 고를 구단이 둘 미만이면 구단 칩을 그리지 않는다(리그 버튼과 관심 칩만 남는다). 단 선택된 구단이 있으면 풀 길이
 *   있어야 하므로 그린다.
 * ⚠ 칩 레일은 화면 오른쪽 끝까지 흐른다(`-mr-5 pr-5`) — 오른쪽에 여백이 남으면 거기서 끝나는 것처럼 보인다.
 */
export function FilterRail({
  options,
  club,
  league,
  sort,
  watch,
  isGuest,
  onOpenLeague,
  onWatchSignInRequired,
}: FilterRailProps) {
  // `options`는 응원 구단이 앞이다(`useTransferBoard`) — 응원 구단 전부 + 그 밖의 구단 상위만 남긴다
  const others = options.filter((o) => !o.followed);
  const shown = [...options.filter((o) => o.followed), ...others.slice(0, MAX_OTHER_CHIPS)];
  const selected = club === null ? null : options.find((o) => o.code === club);
  if (selected && !shown.includes(selected)) shown.push(selected);
  const showClubChips = options.length >= 2 || selected !== null;

  const watchChip = (
    <>
      <Icon as={Bell} size={12} className={watch ? "fill-current" : undefined} />
      관심
      {watch && (
        <>
          <Icon as={X} size={12} className="-mr-0.5" />
          <span className="sr-only">필터 해제</span>
        </>
      )}
    </>
  );

  return (
    <div className="flex items-center gap-2 px-5 pb-2.5 pt-3">
      <button
        type="button"
        onClick={onOpenLeague}
        className="inline-flex h-[33px] flex-none items-center gap-1 whitespace-nowrap rounded-sm border border-hairline-strong bg-canvas pl-3 pr-2.5 text-[13px] font-medium text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        {leagueLabel(league)}
        <Icon as={ChevronDown} size={14} />
      </button>

      {/* 고정된 리그 버튼과 흐르는 칩의 경계 — 헤어라인 한 토막 */}
      <span aria-hidden className="h-5 w-px flex-none bg-hairline" />
      <nav aria-label="관심·구단 필터" className="no-scrollbar -mr-5 flex min-w-0 gap-1.5 overflow-x-auto pr-5">
        {isGuest && !watch ? (
          <button
            type="button"
            // ⚠ 인자 없이 감싼다 — `onClick`은 MouseEvent를 실어 부른다
            onClick={() => onWatchSignInRequired()}
            className={chipClassName(false, CHIP_LAYOUT)}
          >
            {watchChip}
            <span className="sr-only">(로그인 필요)</span>
          </button>
        ) : (
          <BoardLink
            href={boardHref(league, sort, club, !watch)}
            aria-current={watch ? "page" : undefined}
            className={chipClassName(watch, CHIP_LAYOUT)}
          >
            {watchChip}
          </BoardLink>
        )}

        {showClubChips &&
          shown.map((o) => {
            const isSelected = club === o.code;
            return (
              <BoardLink
                key={o.code}
                href={boardHref(league, sort, isSelected ? null : o.code, watch)}
                aria-current={isSelected ? "page" : undefined}
                className={chipClassName(isSelected, CHIP_LAYOUT)}
              >
                {o.followed && (
                  <>
                    <Icon as={Heart} size={11} className="fill-current" />
                    <span className="sr-only">응원 구단</span>
                  </>
                )}
                {o.label}
                {isSelected && (
                  <>
                    <Icon as={X} size={12} className="-mr-0.5" />
                    <span className="sr-only">필터 해제</span>
                  </>
                )}
              </BoardLink>
            );
          })}
      </nav>
    </div>
  );
}

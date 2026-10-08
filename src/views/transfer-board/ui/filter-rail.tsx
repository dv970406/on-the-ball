"use client";

import { Bell, ChevronDown, ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import type { MouseEvent } from "react";
import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { cn } from "@/shared/lib";
import { chipClassName, Icon } from "@/shared/ui";
import { boardHref } from "../lib/board-href";
import { leagueLabel } from "../lib/league-options";
import type { ClubOption } from "../model/use-transfer-board";
import { BoardLink } from "./board-link";
import { useRailOverflow } from "./use-rail-overflow";

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
 * md+에서 칩 줄의 넘친 쪽 끝을 흐린다 — 가로 스크롤바 대신 "더 있다"를 알리는 신호(아래 주석). 넘친 쪽에만 건다.
 * ⚠ 완성된 클래스 문자열로 둔다(Tailwind는 소스 텍스트에서 클래스를 훑는다 — 조립하면 생성되지 않는다). `-webkit-mask-image`는
 *   빌드(Lightning CSS)가 붙인다(빌드 산출물 확인) — 손으로 병기하지 않는다.
 */
const RAIL_FADE = {
  both: "md:[mask-image:linear-gradient(to_right,transparent,black_40px,black_calc(100%-40px),transparent)]",
  back: "md:[mask-image:linear-gradient(to_right,transparent,black_40px)]",
  forward:
    "md:[mask-image:linear-gradient(to_left,transparent,black_40px)]",
} as const;

/** 넘기기 버튼 — md+에서 넘친 쪽에만 선다. 칩 줄 끝에 겹쳐 놓는다(줄의 흐린 끝 위) */
const PAGER =
  "absolute inset-y-0 my-auto hidden size-7 place-items-center rounded-sm border border-hairline bg-canvas text-ink-secondary transition-colors duration-150 ease-otb hover:bg-canvas-soft md:grid";

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
 * ⚠ **`min-[90rem]`에서는 숨는다** — 그 폭에서는 왼쪽 레일(`BoardRail`)이 리그·관심·구단을 세로로 늘어놓는다(리그 시트도
 *   그 폭에서는 쓰지 않는다). 두 자리가 같은 링크(`boardHref`)를 만든다.
 * ⚠ 칩 레일은 화면 오른쪽 끝까지 흐른다(`-mr-5 pr-5`) — 오른쪽에 여백이 남으면 거기서 끝나는 것처럼 보인다.
 * ⚠ **md+에서도 가로 스크롤바를 그리지 않는다** — 칩 줄은 거의 늘 넘쳐서 막대가 상시 한 줄을 차지했다. 대신 넘친 쪽 끝을
 *   흐리고(`RAIL_FADE`) 그 끝에 넘기기 버튼(‹ ›)을 세운다 — 마우스로 숨은 칩에 닿는 수단이다(트랙패드·터치는 그대로 밀고,
 *   키보드는 Tab이 칩마다 멈추며 브라우저가 그 칩을 보이는 곳으로 끌어온다). 버튼은 그래서 포커스 순서에 넣지 않는다
 *   (`tabIndex={-1}` + `aria-hidden` — 같은 칩에 닿는 키보드 경로가 이미 있고, 스크린리더에 장식 버튼 둘을 더 읽히지 않는다).
 *   줄바꿈(`flex-wrap`)은 택하지 않았다 — 구단 칩을 다 펼치면 1024px의 가운데 열에서 여러 줄이 되어 목록이 그만큼 밀린다.
 *   모바일은 그대로다(막대가 원래 숨어 있고 손가락으로 민다 — 버튼·흐림은 md+에만 있다).
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
  const { ref: railRef, back, forward, page } = useRailOverflow<HTMLElement>();
  const fade = back && forward ? RAIL_FADE.both : back ? RAIL_FADE.back : forward ? RAIL_FADE.forward : null;

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

  /**
   * 넘기기 버튼은 누르는 순간 포커스를 가져가지 않는다 — `aria-hidden`인 요소가 포커스를 가지면 보조기술에 이름 없는 자리가
   * 생기고, 끝까지 넘겨 버튼이 사라지면 포커스가 `body`로 떨어진다. 키보드 경로는 칩마다 멈추는 Tab이 따로 있다.
   */
  const keepFocus = (event: MouseEvent) => event.preventDefault();

  return (
    <div className="flex items-center gap-2 px-5 pb-2.5 pt-3 min-[90rem]:hidden">
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
      {/* 칩 줄 + 넘기기 버튼(md+)의 자리 — 버튼이 줄 양 끝에 겹친다 */}
      <div className="relative -mr-5 flex min-w-0">
        {/* ⚠ `overflow-y-hidden` — `overflow-x-auto`만 주면 세로도 auto가 되어, 스크롤바가 보이는 폭에서 1px 넘침에 세로 스크롤바 토막이 선다 */}
        <nav
          ref={railRef}
          aria-label="관심·구단 필터"
          className={cn(
            // md+의 `scroll-px-10`: Tab으로 칩을 옮기면 브라우저가 그 칩을 보이는 끝까지만 끌어오는데, 그 자리가 양 끝의 흐림(40px)과
            // 넘기기 버튼 밑이라 포커스 링이 가려진다 — 끌어올 때 그만큼 안쪽에 세운다
            "no-scrollbar flex min-w-0 gap-1.5 overflow-x-auto overflow-y-hidden pr-5 md:scroll-px-10 md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden",
            fade,
          )}
        >
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
        {back && (
          <button type="button" tabIndex={-1} aria-hidden onMouseDown={keepFocus} onClick={() => page(-1)} className={cn(PAGER, "left-0")}>
            <Icon as={ChevronLeft} size={16} />
          </button>
        )}
        {forward && (
          <button type="button" tabIndex={-1} aria-hidden onMouseDown={keepFocus} onClick={() => page(1)} className={cn(PAGER, "right-2")}>
            <Icon as={ChevronRight} size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

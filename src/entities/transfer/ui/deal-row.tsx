// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러라 서버 렌더 여지를 남긴다(`architecture.md`).
//    그래서 순수 함수는 배럴이 아니라 직접 경로로 가져온다(`credibility-badge.tsx`와 같은 이유).
import Link from "next/link";
import { memo } from "react";
import { ROUTES } from "@/shared/config";
import { cn } from "@/shared/lib/cn";
import { formatRelativeTime } from "@/shared/lib/format";
import { reporterName } from "../lib/reporter";
import { isDeadStage } from "../lib/stage";
import type { TransferDealListItem } from "../model/types";
import { ClubRoute } from "./club-route";
import { FeeDelta } from "./fee-delta";
import { FeeValue } from "./fee-value";
import { StatusBadge } from "./status-badge";
import { CredibilityBadge } from "./credibility-badge";
import { WatchMark } from "./watch-mark";
import { playerName } from "../lib/player-name";

interface DealRowProps {
  deal: TransferDealListItem;
  /**
   * 기준 시각 — `serverNowMs ?? useNowMs()`는 **뷰가 한다**(순서 규약은 `data-and-state.md`).
   * `null`이면 상대시각 대신 절대시각이 그려진다(`formatRelativeTime` 계약).
   */
  nowMs: number | null;
  /**
   * 접힌 행 — HTML에는 남기고 화면에서만 가린다("더 보기" 전의 루머·긴 구간의 뒷장). 색인 화면의 본문 SSR·
   * 스크롤 복원을 지키려면 행을 빼는 것이 아니라 가려야 한다(`nextjs.md`의 탭 규약과 같다).
   */
  hidden?: boolean;
  /**
   * 보도 수 막대의 기준(이 목록 안의 최댓값) — 표 열(`min-[90rem]`)에서 막대 길이를 이 값에 대한 비율로 그린다.
   * 없으면 막대 없이 숫자만 그린다.
   */
  reportScale?: number;
  /**
   * 목록·상세 2분할(lg+)에서 오른쪽 판에 열린 딜인가 — 잉크 왼쪽 막대 + 옅은 배경.
   * ⚠ 판이 실제로 있을 때만 넘긴다(뷰가 판단한다) — 모바일에서는 "고른 딜"이라는 상태가 없다.
   */
  selected?: boolean;
}

/**
 * 목록 행(진행 중 · 루머 · 결렬·부인, md+에서는 모든 구간) — 링크로 감싼 리스트 행이라 `li` + `Link`다.
 *
 * 모바일 레이아웃: grid `minmax(0,1fr) auto` — 좌: 이름·경로 / 우: 이적료·변동폭 / 3행(meta)은 전폭.
 * 정렬선: `mx-2` + `px-3` = 콘텐츠 x=20 → 구간 제목·칩·카드와 같은 선.
 * md+ 레이아웃: 표의 한 줄 — 열·**칸 배치**·디바이더·md+ 행 상자·포커스 링·md+ 이름 줄바꿈은 전부 **표의 범위(`DealTable`)가**
 * 표지(`data-deal-row`·`data-deal-cols`·`data-col`·`data-g`·`data-name`·`data-dead`)를 보고 건다. 이 행은 md+ 전용 클래스를
 * 갖지 않고(백여 행에 같은 문자열을 싣지 않는다 — `styling.md`) `DealTable` 안에서만 그린다.
 * - md(768–1439): 상태 · 선수 · 경로 · 이적료 · 업데이트(5열) / `min-[90rem]`: 변동·보도를 더한 7열.
 *
 * ⚠ 모바일 묶음(이름·경로 / 이적료·변동 `data-g="money"` / 메타 줄 `data-g="meta"`)은 md+에서 `md:contents`로 풀려 자식이
 *   곧장 열에 놓인다 — 같은 요소를 두 벌 그리지 않으려는 배치다. 범위는 묶음 안의 **순서**로 이적료·변동폭·상태 뱃지를 찾는다
 *   (그 컴포넌트들에 표지 prop을 열지 않으려고) → 묶음 안 순서를 바꾸면 `DealTable`도 함께 고친다. 묶음에 건 `opacity`는
 *   md+에서 효과가 없어(상자가 없다) 범위가 칸마다 다시 건다(`data-dead`).
 * ⚠ 결렬 변형: 행 `bg-[#f3f3f3] grayscale`(`@theme` 동결이라 arbitrary hex),
 *   이름·경로·이적료 `opacity-60`, meta `opacity-85`, 변동폭 생략(상태는 뱃지가 말한다), 출처 대신 최신
 *   보도 요지 1줄. **이름에는 취소선이 없다** — 행선지 약칭·이적료에만(`ClubRoute`가 진다). 고른 결렬 행도 회색 배경을
 *   유지하고 막대만 더한다.
 * ⚠ 이 행의 에메랄드는 `WatchMark`(관심)와 변동폭의 상승 화살표뿐이다.
 * ⚠ 렌더 중에 시계를 읽지 않는다 — 상대시각은 `nowMs`를 받아 계산한다.
 * ⚠ 링크에 `data-deal-id`를 단다 — lg+에서 보드가 일반 클릭을 가로채 오른쪽 판에 연다(이벤트 위임이라 이 행은
 *   `"use client"`가 없다). 가로채지 않으면 그대로 상세로 이동한다.
 * ⚠ 선택 막대는 `after:`다 — `before:`는 디바이더가 쓴다. 그림자(`inset` shadow)로 그리지 않는다(그림자 예외 목록 밖).
 * ⚠ `memo`다 — 보드는 행을 고를 때마다(주소의 `?deal=`) 다시 그려지는데, 바뀌는 행은 `selected`가 달라진 둘뿐이다.
 *   그래서 넘기는 값은 원시값이거나 목록 캐시의 같은 참조여야 한다(뷰가 지킨다).
 * ⚠ 링크 프리페치를 끈다(`prefetch={false}`) — 상세는 loading 경계가 없는 동적 라우트라 뷰포트 프리페치가 받아 오는 것이
 *   거의 없고(빈 라우터 트리), 2분할 폭에서는 클릭이 선택으로 가로채져 그마저 쓰이지 않는다. 행이 백여 개라 스크롤만으로
 *   요청이 행 수만큼 나갔다. 값이 정적이라 서버·클라 출력이 같다.
 */
export const DealRow = memo(function DealRow({ deal, nowMs, hidden, reportScale, selected }: DealRowProps) {
  const dead = isDeadStage(deal.stage);
  const name = playerName(deal);
  const report = deal.latestReport;
  const updated = formatRelativeTime(deal.latestReportedAt, nowMs);
  const barPct =
    reportScale && reportScale > 0 ? Math.max(4, Math.round((deal.reportCount / reportScale) * 100)) : null;

  return (
    <li
      hidden={hidden === true ? true : undefined}
      data-deal-row=""
      data-dead={dead ? "" : undefined}
      className={cn(
        "relative mx-2 rounded-md",
        dead && "bg-[#f3f3f3] grayscale",
        // 고른 행 — 잉크 왼쪽 막대. 죽은 딜은 회색 배경을 그대로 두고 막대만 더한다(옅은 배경이 회색을 덮으면 결렬 행이 아니게 보인다)
        selected && "lg:after:absolute lg:after:inset-y-0 lg:after:left-0 lg:after:w-[3px] lg:after:bg-ink lg:after:content-['']",
        selected && !dead && "lg:bg-canvas-soft",
      )}
    >
      <Link
        href={ROUTES.transfer(deal.id)}
        prefetch={false}
        data-deal-id={deal.id}
        data-deal-cols=""
        aria-current={selected ? "true" : undefined}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[9px] rounded-md px-3 py-3 transition-colors duration-150 ease-otb active:bg-canvas-soft md:hover:bg-canvas-soft"
      >
        <div className={cn("min-w-0 md:contents", dead && "opacity-60")}>
          {/* 화면의 계층이 h1(`BoardHeader`의 이적시장) → h2(구간) → h3(선수) */}
          <h3
            data-col="name"
            className="flex items-center gap-[5px] text-[15px] font-medium leading-[1.3] tracking-[-0.3px] text-ink"
          >
            {deal.isWatched && <WatchMark />}
            <span data-name="" className="truncate">
              {name}
            </span>
            {deal.position && (
              <span className="hidden shrink-0 text-[11px] font-normal text-ink-mute-2 md:inline">
                {deal.position}
              </span>
            )}
          </h3>
          <ClubRoute deal={deal} size={16} data-col="route" className="mt-1.5" />
        </div>

        {/* ⚠ 묶음 안의 순서(이적료 → 변동폭)를 표의 범위(`DealTable`)가 칸 자리로 쓴다 */}
        <div
          data-g="money"
          className={cn("flex flex-col items-end gap-[3px] text-right md:contents", dead && "opacity-60")}
        >
          <FeeValue
            deal={deal}
            className={cn(
              "text-[16px] leading-none tracking-[-0.5px]",
              dead ? "text-ink-mute-2 line-through decoration-hairline-strong" : "text-ink",
            )}
          />
          {/* 죽은 딜은 변동폭을 그리지 않는다 — 결렬·부인은 같은 행의 상태 뱃지가 말한다 */}
          {!dead && <FeeDelta deal={deal} lead />}
        </div>

        {/* ⚠ 묶음의 첫째(상태 뱃지)를 표의 범위가 첫 칸으로 쓴다 */}
        <div
          data-g="meta"
          className={cn(
            "col-span-full flex min-w-0 items-center gap-2 text-[11px] text-ink-mute-2 md:contents",
            dead && "opacity-85",
          )}
        >
          <StatusBadge stage={deal.stage} inline />
          {dead ? (
            // 결렬 사유 — 최신 보도 요지 1줄(한국어 요약, 없으면 영문 발췌). 표에는 열이 없다(상세 판이 말한다)
            report?.gist && (
              <span lang={report.gist.lang} className="min-w-0 flex-1 truncate text-[12px] text-ink-mute md:hidden">
                {report.gist.text}
              </span>
            )
          ) : (
            <span className="ml-auto inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap text-ink-mute md:hidden">
              {report && (
                <>
                  <CredibilityBadge report={report} />
                  {reporterName(report)}
                </>
              )}
              <time dateTime={deal.latestReportedAt} className="font-mono text-[10px] tabular-nums text-ink-mute-2">
                · {updated}
              </time>
            </span>
          )}
        </div>

        {/* 표 전용 칸 — 보도 수(이 목록의 최댓값 대비 막대)와 업데이트 시각. 모바일은 메타 줄이 같은 정보를 갖는다 */}
        <span
          data-col="reports"
          className="hidden items-center justify-end gap-2 font-mono text-[12px] tabular-nums text-ink-secondary"
        >
          {barPct !== null && (
            <span aria-hidden className="h-1 w-8 overflow-hidden rounded-[2px] bg-hairline-cool">
              <span className="block h-full bg-ink-faint" style={{ width: `${barPct}%` }} />
            </span>
          )}
          {deal.reportCount}
          <span className="sr-only">건 보도</span>
        </span>
        <time
          data-col="updated"
          dateTime={deal.latestReportedAt}
          className="hidden justify-self-end whitespace-nowrap font-mono text-[11px] tabular-nums text-ink-mute-2"
        >
          {updated}
        </time>
      </Link>
    </li>
  );
});

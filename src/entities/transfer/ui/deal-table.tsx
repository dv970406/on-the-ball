// ⚠ `"use client"`가 없다 — 상호작용이 없는 렌더러다. 그래서 순수 함수는 배럴이 아니라 직접 경로로 가져온다
//    (`deal-row.tsx`와 같은 이유).
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import type { TransferSort } from "../model/types";

/**
 * 딜 표의 범위 — `DealRow`의 **행마다 같은 규칙**(표의 열 · 칸 배치 · 행 사이 디바이더 · md+ 행 상자 · 포커스 링)을 여기 한 번만
 * 적는다. 행은 표지만 단다:
 * - `li[data-deal-row]` — 행(디바이더·md+ 행 상자). 죽은 딜(결렬·부인)이면 `data-dead`도 단다.
 * - `[data-deal-cols]` — 열을 갖는 줄(행 링크 · 표 머리 `DealTableHead`).
 * - 칸: `[data-col=name|route|reports|updated]`(행이 직접 그리는 요소), 이적료·변동폭·상태 뱃지는 모바일 묶음의 자리
 *   (`[data-g=money]`의 첫째·둘째, `[data-g=meta]`의 첫째) — 다른 컴포넌트(`FeeValue`·`FeeDelta`·`StatusBadge`)에 표지 prop을
 *   새로 열지 않으려고 묶음 안의 순서로 찾는다. ⚠ 그래서 `DealRow`의 묶음 안 순서를 바꾸면 여기도 함께 바꾼다.
 * - `[data-name]` — 표에서 **잘리지 않고 줄바꿈하는** 이름 글자(선수명 · 경로의 출발·행선지 약칭).
 *
 * 열: md(768–1439) 상태 · 선수 · 경로 · 이적료 · 업데이트(5열) / `min-[90rem]` 상태 · 선수 · 경로 · 이적료 · 변동 · 보도 ·
 * 업데이트(7열). 표 머리와 행 링크가 **같은 표지**(`data-deal-cols`)라 열 폭의 리터럴이 여기 한 곳뿐이다.
 * 디바이더: 같은 구간의 행 사이에만(`[data-deal-row]+[data-deal-row]` — 형제 선택자). 모바일은 행 패딩 안에서 끝나고
 * (`inset-x-3`), 표에서는 전폭이다. 접힌 행(`hidden`)도 형제 자리에 남아 선이 끊기지 않는다.
 *
 * ⚠ **표의 이름은 자르지 않는다** — 좁은 칸에 두 구단을 놓는 자리라 약칭이지만, 약칭도 잘리면 어느 구단인지 알 수 없다
 *   (`api-and-db.md`). 1024px 2분할에서 경로 칸은 200px 안팎이라 출발·행선지·관심 구단 엠블럼이 한 줄에 들지 않는다 →
 *   md+에서 경로 칸은 **줄을 바꾼다**: 출발 덩어리(엠블럼 + 약칭)는 통째로 한 줄에 서고, 행선지 덩어리가 들지 않으면 다음
 *   줄로 내려간다(`flex-wrap`). 행선지가 여럿이면 그 덩어리를 풀어 "출발 → 엠블럼들" / "이름들"로 선다(이름 글자가 칸 폭을
 *   다 쓴다). 이름 글자는 낱말 단위로 꺾인다(`break-keep` — 한 낱말이 칸보다 길 때만 그 안에서 꺾는다). 열 폭도 경로에 더
 *   준다 — 이름 칸은 줄을 바꿀 수 있어 좁아도 되고, 상태·이적료 칸은 가장 긴 값(`합의 임박`·`FA(자유 계약)`)에 맞춘다.
 *   모바일은 그대로 한 줄 + 말줄임이다(행 폭이 화면 폭이라 약칭이 들어간다 — 모바일 결과를 바꾸지 않는다).
 * ⚠ 죽은 딜의 취소선은 md+에서 굵고 진하게 그린다(1.5px · `ink-mute-2`) — 행 전체가 흐린(`opacity`) 회색 배경이라 1px
 *   헤어라인 색이면 1배율 화면에서 거의 보이지 않는다(Firefox 실측). 모바일은 그대로다.
 * ⚠ 행 링크의 포커스 링은 잉크 `outline`이다(입력칸의 `focus:border-ink`와 같은 래더) — J/K로 옮긴 행이 어디인지 보여야 한다.
 *   그림자(`ring`)가 아니다(그림자 예외 목록 밖). 마우스 클릭에는 뜨지 않는다(`focus-visible`).
 *
 * ⚠ 왜 행에 적지 않는가: 보드는 한 화면에 행이 백여 개다. 같은 클래스 문자열을 행마다 실으면 그만큼 HTML이 부푼다
 *   (모바일이 받는 문서에 데스크톱 전용 규칙이 행 수만큼 실린다). 규칙은 범위에 한 번, 행에는 표지만 둔다(`styling.md`).
 * ⚠ 열 폭은 **고정 값**이다(`auto` 금지) — 행마다 자기 grid라 `auto`면 행마다 열이 어긋난다.
 * ⚠ 자손 선택자의 특이성(클래스 + 속성)이 행 요소의 클래스 하나보다 높아 md+에서 모바일 값을 이긴다 — 모바일에서는 이 규칙이
 *   아예 없다(디바이더·포커스 링만 모바일에도 걸린다).
 * ⚠ `DealRow`는 **이 범위 안에서만** 그린다 — 밖에 두면 디바이더가 없고 md+에서 표의 열로 펼쳐지지 않는다.
 */
const TABLE_SCOPE = [
  // 열
  "md:[&_[data-deal-cols]]:grid-cols-[72px_minmax(0,1fr)_minmax(0,1.8fr)_104px_64px]",
  "min-[90rem]:[&_[data-deal-cols]]:grid-cols-[72px_minmax(0,1fr)_minmax(0,1.7fr)_104px_56px_72px_64px]",
  // 디바이더
  "[&_[data-deal-row]+[data-deal-row]]:before:absolute [&_[data-deal-row]+[data-deal-row]]:before:inset-x-3 [&_[data-deal-row]+[data-deal-row]]:before:top-0 [&_[data-deal-row]+[data-deal-row]]:before:h-px [&_[data-deal-row]+[data-deal-row]]:before:bg-hairline-cool [&_[data-deal-row]+[data-deal-row]]:before:content-['']",
  "md:[&_[data-deal-row]+[data-deal-row]]:before:inset-x-0",
  // md+ 행 상자
  "md:[&_[data-deal-row]]:mx-0 md:[&_[data-deal-row]]:rounded-none md:[&_[data-deal-row]>a]:min-h-12 md:[&_[data-deal-row]>a]:gap-y-0 md:[&_[data-deal-row]>a]:rounded-none md:[&_[data-deal-row]>a]:px-5 md:[&_[data-deal-row]>a]:py-2",
  // 포커스 링
  "[&_[data-deal-row]>a]:focus-visible:outline-2 [&_[data-deal-row]>a]:focus-visible:-outline-offset-2 [&_[data-deal-row]>a]:focus-visible:outline-ink",
  // 칸 — 상태
  "md:[&_[data-g=meta]>:first-child]:col-start-1 md:[&_[data-g=meta]>:first-child]:row-start-1 md:[&_[data-g=meta]>:first-child]:justify-self-start",
  // 칸 — 선수
  "md:[&_[data-col=name]]:col-start-2 md:[&_[data-col=name]]:row-start-1 md:[&_[data-col=name]]:min-w-0 md:[&_[data-col=name]]:text-[14px]",
  // 칸 — 경로(줄바꿈 — 위 주석)
  "md:[&_[data-col=route]]:col-start-3 md:[&_[data-col=route]]:row-start-1 md:[&_[data-col=route]]:mt-0 md:[&_[data-col=route]]:flex-wrap md:[&_[data-col=route]]:items-center md:[&_[data-col=route]]:gap-y-0.5 md:[&_[data-col=route]]:whitespace-normal md:[&_[data-col=route]]:break-keep",
  // 행선지가 여럿이면 덩어리를 풀어(엠블럼 겹치기와 이름 글자가 따로 줄을 탄다) "출발 → 엠블럼들" / "이름들" 두 줄로 선다
  "md:[&_[data-route-to=stacked]]:contents",
  "md:[&_[data-col=route]_[data-name]]:decoration-ink-mute-2 md:[&_[data-col=route]_[data-name]]:decoration-[1.5px]",
  // 이름 글자 — 말줄임·줄 수 제한을 풀고 낱말 단위로 꺾는다
  "md:[&_[data-name]]:line-clamp-none md:[&_[data-name]]:whitespace-normal md:[&_[data-name]]:break-keep md:[&_[data-name]]:[overflow-wrap:anywhere]",
  // 칸 — 이적료
  "md:[&_[data-g=money]>:first-child]:col-start-4 md:[&_[data-g=money]>:first-child]:row-start-1 md:[&_[data-g=money]>:first-child]:justify-self-end md:[&_[data-g=money]>:first-child]:text-[14px] md:[&_[data-g=money]>:first-child]:decoration-ink-mute-2 md:[&_[data-g=money]>:first-child]:decoration-[1.5px]",
  // 칸 — 변동(`min-[90rem]`만 — 열 머리가 "변동"이라 "직전 보도 대비" 글자를 걷는다)
  "md:[&_[data-g=money]>:nth-child(2)]:hidden min-[90rem]:[&_[data-g=money]>:nth-child(2)]:col-start-5 min-[90rem]:[&_[data-g=money]>:nth-child(2)]:row-start-1 min-[90rem]:[&_[data-g=money]>:nth-child(2)]:inline-flex min-[90rem]:[&_[data-g=money]>:nth-child(2)]:justify-self-end min-[90rem]:[&_[data-g=money]>:nth-child(2)>:first-child]:hidden",
  // 칸 — 보도·업데이트(표 전용 — 행 요소는 모바일에서 `hidden`이다)
  "min-[90rem]:[&_[data-col=reports]]:col-start-6 min-[90rem]:[&_[data-col=reports]]:row-start-1 min-[90rem]:[&_[data-col=reports]]:flex",
  "md:[&_[data-col=updated]]:col-start-5 md:[&_[data-col=updated]]:row-start-1 md:[&_[data-col=updated]]:block min-[90rem]:[&_[data-col=updated]]:col-start-7",
  // 죽은 딜 — md+에서는 모바일 묶음이 상자가 없어(`md:contents`) 묶음의 흐림이 효과가 없다 → 칸이 직접 흐려진다
  "md:[&_[data-dead]_[data-col=name]]:opacity-60 md:[&_[data-dead]_[data-col=route]]:opacity-60 md:[&_[data-dead]_[data-col=updated]]:opacity-60 md:[&_[data-dead]_[data-g=money]>:first-child]:opacity-60 md:[&_[data-dead]_[data-g=meta]>:first-child]:opacity-85",
].join(" ");

interface DealTableProps {
  children: ReactNode;
  className?: string;
}

/** 딜 표의 범위(`TABLE_SCOPE`) — 머리(`DealTableHead`)와 행(`DealRow`)을 이 안에 둔다 */
export function DealTable({ children, className }: DealTableProps) {
  return <div className={cn(TABLE_SCOPE, className)}>{children}</div>;
}

/**
 * md+ 표의 열 머리 행 — 열 배치는 `DealTable`의 범위 규칙이 행과 함께 건다(`data-deal-cols`). 모바일에는 없다(행이 표가 아니다).
 * ⚠ 열 이름은 시각용 머리다 — 행이 `li` + 링크라 표 시맨틱(`table`·`columnheader`)을 약속하지 않으므로 `aria-hidden`이다.
 *   행 안의 값은 각자 뜻을 진다(sr-only 보충 포함).
 */
export function DealTableHead({ sort }: { sort: TransferSort }) {
  return (
    <div
      aria-hidden
      data-deal-cols=""
      className="hidden h-[34px] items-center gap-x-3 border-b border-hairline-cool px-5 text-[11.5px] text-ink-mute-2 md:grid"
    >
      <span>상태</span>
      <span>선수</span>
      <span>경로</span>
      <span className={cn("text-right", sort === "fee" && "font-medium text-ink")}>
        이적료{sort === "fee" && " ↓"}
      </span>
      <span className="hidden text-right min-[90rem]:block">변동</span>
      <span className="hidden text-right min-[90rem]:block">보도</span>
      <span className="text-right">업데이트</span>
    </div>
  );
}

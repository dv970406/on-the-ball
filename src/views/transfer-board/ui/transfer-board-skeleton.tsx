import { Skeleton } from "@/shared/ui";

/**
 * 보드 로딩 자리끼움 — **실제 화면과 같은 골격**(캐러셀 카드 2장 · 헤더 · 칩 · 도구줄 ·
 * 행 5개)을 그려 데이터 도착 시 레이아웃이 튀지 않게 한다.
 *
 * ⚠ 치수는 `RumorCard`·`BoardHeader`·`GroupChips`·`BoardTools`·`DealRow`를 따른다 —
 *   그쪽 줄이 늘거나 줄면 여기도 함께 고친다(갈리면 스켈레톤이 있으나 마나가 된다).
 */
export function TransferBoardSkeleton() {
  return (
    <div aria-hidden>
      {/* 캐러셀 — 캡션 + 300px 카드 2장 + 점 자리 */}
      <div className="px-5 pb-2.5 pt-4">
        <Skeleton className="h-[15px] w-20" />
      </div>
      <div className="flex gap-2.5 overflow-hidden px-5 pb-1">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-[281px] w-[300px] shrink-0 rounded-lg" />
        ))}
      </div>
      <div className="flex justify-center pb-1.5 pt-3">
        <Skeleton className="h-1 w-3.5" />
      </div>

      {/* 헤더 — 제목 26px + 부제 12px / 우측 라벨 + 카운트다운 */}
      <div className="flex items-end justify-between border-t border-hairline-cool px-5 pb-3.5 pt-[22px]">
        <div>
          <Skeleton className="h-[26px] w-24" />
          <Skeleton className="mt-[5px] h-[15px] w-40" />
        </div>
        <div className="flex flex-col items-end">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-1 h-[15px] w-28" />
        </div>
      </div>


      {/* 구간 점프 칩 — 13px 라벨 + 9px 상하 패딩 + 보더 */}
      <div className="flex gap-1.5 overflow-hidden px-5 py-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[33px] w-[76px] shrink-0" />
        ))}
      </div>

      {/* 도구줄 — 리그 버튼 34px */}
      <div className="flex items-center px-5 pb-2.5 pt-0.5">
        <Skeleton className="h-[34px] w-[88px]" />
        <Skeleton className="ml-auto h-4 w-20" />
      </div>

      {/* 구간 제목 + 목록 행 5개 — 행 구조는 `DealRow`(이름 · 경로 · meta) */}
      <div className="px-5 pb-1.5 pt-3.5">
        <Skeleton className="h-[19px] w-16" />
      </div>
      <ul>
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="mx-2 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-[19px] w-1/2" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="mt-1.5 h-4 w-2/3" />
            <Skeleton className="mt-[9px] h-[15px] w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

import { Skeleton } from "@/shared/ui";

/**
 * 목록 로딩 자리끼움 — **실제 화면과 같은 골격**을 그려 데이터 도착 시 레이아웃이 튀지 않게 한다.
 *
 * ⚠ 목록이 두 구역으로 갈린다: 진행 중은 **정사각 분할 카드**, 마감은 한 줄 행이다.
 *   한쪽만 그리면 카드가 도착할 때 세로로 수백 px이 밀린다(CLS) — 두 구역을 다 그린다.
 * ⚠ 카드 비율은 `SplitCard`와 같은 `aspect-square`여야 한다. 여기 값이 갈리면 스켈레톤이
 *   있으나 마나가 된다.
 */
export function SurveyListSkeleton() {
  return (
    <div aria-hidden>
      {/* 진행 중 — 제목 한 줄 + 1:1 카드 */}
      <div className="border-b border-hairline-cool px-5 pb-6 pt-4">
        <Skeleton className="h-[25px] w-3/4" />
        <Skeleton className="mt-5 aspect-square w-full rounded-[18px]" />
      </div>

      {/* 마감 — 라벨 / 제목 2행 / 시각 */}
      <ul>
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="border-b border-hairline-cool px-5 py-4">
            <Skeleton className="h-[13px] w-12" />
            <Skeleton className="mt-[7px] h-[21px] w-4/5" />
            <Skeleton className="mt-1 h-[21px] w-1/2" />
            <Skeleton className="mt-[11px] h-[15px] w-16" />
          </li>
        ))}
      </ul>
    </div>
  );
}

import { Skeleton } from "@/shared/ui";

/**
 * 랭킹 로딩 자리끼움 — **실제 화면과 같은 골격**을 그려 데이터 도착 시 레이아웃이 튀지 않게 한다.
 *
 * ⚠ 줄 구조가 뷰와 같아야 한다: 범위 칩 · 시즌·규칙 안내 · 내 순위 줄(최소 48px) ·
 *   행(아바타 28px). 뷰나 `LeaderboardBoard`의 줄이 늘거나 줄면 여기도 함께 고친다.
 * ⚠ h1은 여기 두지 않는다 — 뷰가 로딩 중에도 그린다(화면의 이름은 데이터와 무관하다).
 */
export function MatchRankingSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex gap-1.5 px-5 pt-4.5">
        <Skeleton className="h-[33px] w-[74px]" />
        <Skeleton className="h-[33px] w-[62px]" />
      </div>
      {/* 시즌·규칙 안내 — 좁은 폭에서 두 줄로 접히므로 두 줄 높이를 잡는다 */}
      <div className="px-5 pb-3 pt-3">
        <Skeleton className="h-[15px] w-full" />
        <Skeleton className="mt-[3px] h-[15px] w-40" />
      </div>
      <div className="min-h-12 border-b border-hairline-cool bg-canvas-soft" />
      <ul>
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 border-b border-hairline-cool px-5 py-3.5">
            <Skeleton className="h-5 w-8" />
            <Skeleton className="size-7" />
            <div className="flex-1">
              <Skeleton className="h-[17px] w-28" />
              <Skeleton className="mt-1 h-[15px] w-36" />
            </div>
            <Skeleton className="h-5 w-10" />
          </li>
        ))}
      </ul>
    </div>
  );
}

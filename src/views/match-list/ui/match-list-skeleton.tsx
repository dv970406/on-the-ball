import { Skeleton } from "@/shared/ui";

/**
 * 목록 로딩 자리끼움 — **실제 화면과 같은 골격**을 그려 데이터 도착 시 레이아웃이 튀지 않게 한다.
 * ⚠ 행 구조가 `MatchCard`와 같아야 한다(메타 한 줄 · 대진 한 줄). 갈리면 스켈레톤이
 *   있으나 마나가 된다.
 */
export function MatchListSkeleton() {
  return (
    <ul aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="border-b border-hairline-cool px-5 py-4">
          <Skeleton className="h-[15px] w-40" />
          <Skeleton className="mt-[7px] h-[21px] w-full" />
        </li>
      ))}
    </ul>
  );
}

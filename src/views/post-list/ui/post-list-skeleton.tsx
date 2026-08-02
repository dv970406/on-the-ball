import { Skeleton } from "@/shared/ui";

/** 목록 로딩 자리끼움 — 카드와 같은 높이를 유지해 데이터 도착 시 레이아웃이 튀지 않게 한다 */
export function PostListSkeleton() {
  return (
    <ul className="flex flex-col gap-2.5 px-5" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="card px-4 py-4">
          <Skeleton className="h-[23px] w-3/4" />
          <Skeleton className="mt-2.5 h-[18px] w-1/2" />
        </li>
      ))}
    </ul>
  );
}

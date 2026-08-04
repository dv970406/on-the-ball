import { Skeleton } from "@/shared/ui";

/**
 * 목록 로딩 자리끼움 — 실제 글 행(PostCard)과 같은 골격을 그려 데이터 도착 시 레이아웃이
 * 튀지 않게 한다. 말머리 / 제목 / 발췌 2행 / 메타 순서가 카드와 같다.
 */
export function PostListSkeleton() {
  return (
    <ul aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="border-b border-hairline-cool px-5 py-4">
          <Skeleton className="h-[13px] w-10" />
          <Skeleton className="mt-[7px] h-[21px] w-3/4" />
          <Skeleton className="mt-[7px] h-[19px] w-full" />
          <Skeleton className="mt-1 h-[19px] w-2/3" />
          <Skeleton className="mt-[11px] h-[15px] w-1/2" />
        </li>
      ))}
    </ul>
  );
}

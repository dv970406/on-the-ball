import { formatDday } from "@/shared/lib";

/**
 * 진행 중 폴의 마감 D-day 세그먼트 — "마감 D-8".
 * 마감 지남/null 처리(pill "마감" vs 텍스트 등)는 뷰마다 정당하게 달라 호출부 책임으로 둔다.
 */
export function Dday({ closesAt }: { closesAt: string }) {
  return (
    <>
      마감 <time dateTime={closesAt}>{formatDday(closesAt)}</time>
    </>
  );
}

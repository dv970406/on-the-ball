import { Skeleton } from "@/shared/ui";

/**
 * 목록 로딩 자리끼움 — **실제 화면과 같은 골격**을 그려 데이터 도착 시 레이아웃이 튀지 않게 한다.
 *
 * ⚠ 행 구조가 `MatchCard`와 같아야 한다: 메타 한 줄(라운드·상태) · 대진 한 줄(엠블럼 24px) ·
 *   예측 한 줄. 카드에 줄이 늘거나 줄면 여기도 함께 고친다 — 갈리면 스켈레톤이 있으나 마나가 된다.
 * ⚠ **날짜 헤딩도 그린다.** 목록이 날짜로 묶여 그려지므로(`groupMatchesByDay`) 헤딩을 빼면
 *   데이터가 도착하는 순간 그 높이만큼 목록이 통째로 밀린다.
 * ⚠ **구역 탭도 같은 이유로 그린다.** 목록 위에 탭바가 서므로(`MatchListTabs`) 빼면 데이터가
 *   도착할 때 그 높이(44px)만큼 밀린다. 치수를 바꾸면 두 파일을 함께 고친다.
 */
export function MatchListSkeleton() {
  return (
    <div aria-hidden>
      {/* 탭바 자리 — 실제 탭 버튼과 같은 패딩·테두리라 높이가 맞는다 */}
      <div className="flex gap-4 border-b border-hairline-cool px-5 pb-[12px] pt-3">
        <Skeleton className="h-5 flex-1" />
        <Skeleton className="h-5 flex-1" />
      </div>

      {Array.from({ length: 2 }, (_, day) => (
        <div key={day}>
          <div className="px-5 pb-2 pt-4">
            <Skeleton className="h-[15px] w-24" />
          </div>
          <ul>
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="border-b border-hairline-cool px-5 py-3.5">
                <Skeleton className="h-[13px] w-10" />
                {/* 대진 줄 — 엠블럼 24px이 들어가 카드에서 가장 높은 줄이다 */}
                <Skeleton className="mt-2 h-6 w-full" />
                <Skeleton className="mt-2 h-[15px] w-20" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

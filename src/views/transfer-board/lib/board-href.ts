import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { ROUTES } from "@/shared/config";

/**
 * 보드 URL — 리그·정렬·구단·관심을 쿼리(`?league=`·`?sort=`·`?club=`·`?watch=`)로 싣는다. 네 상태는 **URL이 소유한다**
 * (로컬 state면 뒤로가기·공유 링크가 필터를 잃는다).
 *
 * ⚠ **기본값에는 파라미터를 붙이지 않는다** — `?sort=latest`·빈 `?league=`라는 중복 URL을
 *   만들지 않는다(`nextjs.md` "필터는 색인 대상인가"). canonical은 서버 page가 쿼리 없이 적는다.
 * ⚠ 정렬 링크(`SortLinks`)·구단 칩(`FilterRail`)와 리그 시트(`LeagueSheet`)가 **같은 함수**로 URL을 만든다 —
 *   두 곳이 각자 짜면 한쪽이 상대 파라미터를 떨어뜨리는 순간 조용히 어긋난다
 *   (`parsePostId`·`safeNextPath`와 같은 이유로 함수 하나가 갖는다).
 * ⚠ 리그명은 한글이라 `encodeURIComponent`로 싣는다 — 공백이 든 `세리에 A`도 `%20`으로 간다.
 *   해석은 뷰가 주소에서 한다(`useBoardFilters` → `parseTransferLeague`). 모르는 값은 전체로 폴백한다.
 * ⚠ 구단(`?club=`)은 구단 코드(slug)다 — 해석은 `parseTransferClub`, 보드에 없는 구단은 뷰가 전체로 폴백한다.
 * ⚠ 관심(`?watch=1`)은 켜졌을 때만 붙는다 — 해석은 `parseTransferWatch`. 다른 필터와 함께 걸린다(AND).
 * ⚠ 고른 딜(`?deal=`)은 **오른쪽 판에 딜을 열 때만** 싣는다(행 선택). 필터·정렬 링크는 넘기지 않는다 — 필터가 바뀌면
 *   고른 딜이 목록에서 빠질 수 있어, 선택을 풀고 화면 순서상 첫 딜로 돌아가는 편이 예측 가능하다.
 */
export function boardHref(
  league: TransferLeague | null,
  sort: TransferSort,
  club: string | null = null,
  watch = false,
  deal: number | null = null,
): string {
  const params: string[] = [];
  if (league !== null) params.push(`league=${encodeURIComponent(league)}`);
  if (sort !== "latest") params.push(`sort=${sort}`);
  if (club !== null) params.push(`club=${encodeURIComponent(club)}`);
  if (watch) params.push("watch=1");
  if (deal !== null) params.push(`deal=${deal}`);
  return params.length === 0 ? ROUTES.transferList : `${ROUTES.transferList}?${params.join("&")}`;
}

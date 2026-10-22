import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { ROUTES } from "@/shared/config";
import { parsePostId } from "@/shared/lib";

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
 * ⚠ 고른 딜은 이 함수가 아니라 `boardDealHref`(상세 경로)가 싣는다. 여기의 `deal`(`?deal=`)은 **로그인 뒤 보드로 돌아올
 *   주소**(`next`)에만 쓴다 — 상세 경로를 `next`에 실으면 로그인 뒤 보드가 아니라 상세 화면이 뜬다. 보드는 그 값을 읽어 판에
 *   열고 주소를 상세 경로로 바꾼다(`useDealSelection`). 필터·정렬 링크는 넘기지 않는다 — 필터가 바뀌면 고른 딜이 목록에서
 *   빠질 수 있어, 선택을 풀고 화면 순서상 첫 딜로 돌아가는 편이 예측 가능하다.
 */
export function boardHref(
  league: TransferLeague | null,
  sort: TransferSort,
  club: string | null = null,
  watch = false,
  deal: number | null = null,
): string {
  return withFilters(ROUTES.transferList, league, sort, club, watch, deal);
}

/**
 * 2분할(lg+)에서 판에 딜을 연 보드의 주소 — **그 딜의 상세 경로**(`/transfers/<id>`) + 지금 필터.
 *
 * 주소창을 복사해 공유하면 받는 사람이 그 딜의 상세(본문·공유 카드)를 받는다 — 보드 주소(`?deal=`)는 모바일에서 판이 없어
 * 그 딜을 보여 줄 수 없었다. 화면은 보드 그대로다 — 서버를 부르지 않고 주소만 바꾼다(`navigateBoard`). 새로고침하면 상세가 뜬다.
 * ⚠ 필터를 함께 싣는다 — 같은 화면에서 보드가 필터를 주소에서 읽으므로(`useBoardFilters`) 빠지면 목록이 풀린다. 상세 page는
 *   이 쿼리를 읽지 않고 canonical이 떨어뜨린다.
 */
export function boardDealHref(
  dealId: number,
  league: TransferLeague | null,
  sort: TransferSort,
  club: string | null,
  watch: boolean,
): string {
  return withFilters(ROUTES.transfer(dealId), league, sort, club, watch, null);
}

/** 판에 딜을 연 보드 주소(`boardDealHref`)에서 딜 id — 보드 경로·다른 경로면 `null`. 해석은 상세 라우트와 같은 `parsePostId`다 */
export function dealIdOfBoardPath(pathname: string): number | null {
  const prefix = `${ROUTES.transferList}/`;
  return pathname.startsWith(prefix) ? parsePostId(pathname.slice(prefix.length)) : null;
}

function withFilters(
  path: string,
  league: TransferLeague | null,
  sort: TransferSort,
  club: string | null,
  watch: boolean,
  deal: number | null,
): string {
  const params: string[] = [];
  if (league !== null) params.push(`league=${encodeURIComponent(league)}`);
  if (sort !== "latest") params.push(`sort=${sort}`);
  if (club !== null) params.push(`club=${encodeURIComponent(club)}`);
  if (watch) params.push("watch=1");
  if (deal !== null) params.push(`deal=${deal}`);
  return params.length === 0 ? path : `${path}?${params.join("&")}`;
}

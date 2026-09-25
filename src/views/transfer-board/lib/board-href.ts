import type { TransferLeague, TransferSort } from "@/entities/transfer";
import { ROUTES } from "@/shared/config";

/**
 * 보드 URL — 리그·정렬을 쿼리(`?league=`·`?sort=`)로 싣는다. 두 상태는 **URL이 소유한다**
 * (로컬 state면 뒤로가기·공유 링크가 필터를 잃는다).
 *
 * ⚠ **기본값에는 파라미터를 붙이지 않는다** — `?sort=latest`·빈 `?league=`라는 중복 URL을
 *   만들지 않는다(`nextjs.md` "필터는 색인 대상인가"). canonical은 서버 page가 쿼리 없이 적는다.
 * ⚠ 정렬 링크(`BoardTools`)와 리그 시트(`LeagueSheet`)가 **같은 함수**로 URL을 만든다 —
 *   두 곳이 각자 짜면 한쪽이 상대 파라미터를 떨어뜨리는 순간 조용히 어긋난다
 *   (`parsePostId`·`safeNextPath`와 같은 이유로 함수 하나가 갖는다).
 * ⚠ 리그명은 한글이라 `encodeURIComponent`로 싣는다 — 공백이 든 `세리에 A`도 `%20`으로 간다.
 *   해석은 `parseTransferLeague`(서버 page)가 하고, 모르는 값은 전체로 폴백한다.
 */
export function boardHref(league: TransferLeague | null, sort: TransferSort): string {
  const params: string[] = [];
  if (league !== null) params.push(`league=${encodeURIComponent(league)}`);
  if (sort !== "latest") params.push(`sort=${sort}`);
  return params.length === 0 ? ROUTES.transferList : `${ROUTES.transferList}?${params.join("&")}`;
}

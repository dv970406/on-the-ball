import type { TransferClub, TransferDeal } from "../model/types";

/**
 * 이름을 적는 구단 수의 상한 — 그 뒤는 `외 N`으로 센다. `CrestStack`이 겹치는 엠블럼 수도 이 값이라
 * 엠블럼 세 개와 이름 세 개가 **같은 구단**을 가리키고 `+N`과 `외 N`이 같은 수다.
 */
export const ROUTE_CLUB_LIMIT = 3;

/** 행선지 자리에 놓을 구단들 — 확실한 행선지가 있으면 그것을 앞에, 그 밖의 관심 구단을 뒤에. 관심 구단만 있는 루머는 그 전부 */
export function destinationClubs(deal: Pick<TransferDeal, "toClub" | "suitors">): TransferClub[] {
  return deal.toClub ? [deal.toClub, ...deal.suitors] : deal.suitors;
}

/**
 * 경로의 두 칸에 쓸 글자 — 구단이 없을 때 **왜 없는지**를 가른다("틀린 칸보다 빈 칸"의 빈 칸에도 뜻이 있다).
 *
 * - 출발이 없다: 자유계약이면 `FA`(소속이 없는 것이 사실이다), 아니면 `미확인`.
 * - 행선지가 없다: `미정` — 떠날 예정만 보도된 딜(계약 만료·이탈 의사)이라 아직 정해지지 않은 것이다.
 * - 행선지 자리에 구단이 여럿이다(`destinationClubs`): 앞 `ROUTE_CLUB_LIMIT`개를 `·`로 잇고 나머지는 `외 N`으로 센다 —
 *   전부 이으면 관심 구단이 다섯만 돼도 목록 행이 세 줄로 부풀어 이적료 칸을 밀어냈다. 첫 구단이 행선지로 읽히는
 *   것은 호출부가 `CrestStack`으로 엠블럼을 겹쳐 그려 "여럿"임을 함께 보여 줌으로써 막는다.
 *   ⚠ 상세 경로 카드는 이 글자를 쓰지 않고 구단을 **한 줄에 하나씩 전부** 적는다(`DealRouteCard` — 딜 상세·보드의 오른쪽 판) —
 *   폭을 이름에 전부 내줄 수 있는 유일한 자리라 접을 이유가 없다.
 *
 * 목록 행·미니 카드·캐러셀·상세 경로 카드(출발·단일 행선지)가 **이 하나**를 쓴다 — 각자 문구를 들면 같은 딜이 화면마다 다른 말을 한다.
 * `full`이면 정식명(상세 경로 카드), 아니면 약칭이다.
 */
export function routeLabels(
  deal: Pick<TransferDeal, "fromClub" | "toClub" | "isFreeAgent" | "suitors">,
  { full = false }: { full?: boolean } = {},
): { from: string; to: string } {
  const name = (club: TransferClub) => (full ? club.name : club.shortName);
  const from = deal.fromClub ? name(deal.fromClub) : deal.isFreeAgent ? "FA" : "미확인";
  const clubs = destinationClubs(deal);
  const named = clubs.slice(0, ROUTE_CLUB_LIMIT).map(name).join(" · ");
  const rest = clubs.length - ROUTE_CLUB_LIMIT;
  const to = clubs.length === 0 ? "미정" : rest > 0 ? `${named} 외 ${rest}` : named;
  return { from, to };
}

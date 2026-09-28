import type { TransferClub, TransferDeal } from "../model/types";

/** 행선지 자리에 놓을 구단들 — 확실한 행선지가 있으면 그것을 앞에, 그 밖의 관심 구단을 뒤에. 관심 구단만 있는 루머는 그 전부 */
export function destinationClubs(deal: Pick<TransferDeal, "toClub" | "suitors">): TransferClub[] {
  return deal.toClub ? [deal.toClub, ...deal.suitors] : deal.suitors;
}

/**
 * 경로의 두 칸에 쓸 글자 — 구단이 없을 때 **왜 없는지**를 가른다("틀린 칸보다 빈 칸"의 빈 칸에도 뜻이 있다).
 *
 * - 출발이 없다: 자유계약이면 `FA`(소속이 없는 것이 사실이다), 아니면 `미확인`.
 * - 행선지가 없다: `미정` — 떠날 예정만 보도된 딜(계약 만료·이탈 의사)이라 아직 정해지지 않은 것이다.
 * - 행선지 자리에 구단이 여럿이다(`destinationClubs`): 이름을 `·`로 **전부** 잇는다 — "리버풀 외 3"처럼 세면 첫 구단이
 *   행선지인 것처럼 읽힌다. 엠블럼은 호출부가 `CrestStack`으로 겹쳐 그린다.
 *
 * 목록 행·미니 카드·캐러셀·상세 경로 카드가 **이 하나**를 쓴다 — 각자 문구를 들면 같은 딜이 화면마다 다른 말을 한다.
 * `full`이면 정식명(상세 경로 카드), 아니면 약칭이다.
 */
export function routeLabels(
  deal: Pick<TransferDeal, "fromClub" | "toClub" | "isFreeAgent" | "suitors">,
  { full = false }: { full?: boolean } = {},
): { from: string; to: string } {
  const name = (club: TransferClub) => (full ? club.name : club.shortName);
  const from = deal.fromClub ? name(deal.fromClub) : deal.isFreeAgent ? "FA" : "미확인";
  const clubs = destinationClubs(deal);
  const to = clubs.length > 0 ? clubs.map(name).join(" · ") : "미정";
  return { from, to };
}

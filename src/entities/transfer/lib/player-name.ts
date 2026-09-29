import type { TransferDeal } from "../model/types";

/**
 * 선수 표시명 — 한국어 표기가 운영 사전(`players-ko.json`)에 있으면 그것, 없으면 추출된 영문명.
 *
 * 목록 행·미니 카드·캐러셀·상세 제목·`<title>`이 **이 하나**를 쓴다 — 표기 규칙(영문 병기 등)이 바뀔 때
 * 다섯 곳을 찾지 않게. 순수 함수라 서버 안전하다 — 서버 page는 `@/entities/transfer/lib/player-name` 직접 경로로.
 */
export function playerName(deal: Pick<TransferDeal, "player" | "playerKo">): string {
  return deal.playerKo ?? deal.player;
}

// ⚠ "use client" 모듈 포함 — 서버에서는 model/types·api/mappers·api/keys·api/list-query와
//    lib/league·lib/stage·lib/route-label·lib/player-name을 직접 import한다(허용 목록은 `check-conventions.mjs`).
//
// ⚠ **다른 레이어가 소비하지 않는 것은 올리지 않는다.** `TransferClubRow`·`TransferNewsRow`·
//    `TransferDealWatchRow`·`TransferStatus`·`STAGE_GROUP`·`isDeadStage`·`feeDelta`·`ClubRoute`·
//    `WatchMark`는 이 슬라이스 안에서만 쓰여 배럴에서 뺐다. `STAGE_STATUS`·`STATUS_LABEL`도 배럴에는
//    없지만 서버 page가 `lib/stage` 직접 경로로 쓴다(og description). `check:conventions`가 이 유형을
//    **잡지 못하므로**(상대 경로 소비도 "현역"으로 센다) 손으로 지킨다.
export type {
  TransferDeal,
  TransferDealListItem,
  TransferGroupKey,
  TransferLeague,
  TransferReport,
  TransferSort,
  TransferStage,
} from "./model/types";
// ⚠ 리그 시트가 5개 리그를 이 순서로 그린다 — 손으로 다시 적지 않는다(망라성 가드가 여기 있다)
export { TRANSFER_LEAGUES } from "./model/types";
export { transferKeys } from "./api/keys";
// ⚠ 상한은 서버 안전한 api/mappers에 있다 — 목록 SSR이 같은 값을 써야 하고 화면이 잘림을 말한다
export { TRANSFER_DEAL_LIMIT } from "./api/mappers";
export {
  useTransferDealListQuery,
  useTransferDealQuery,
  useTransferReportsQuery,
} from "./api/queries";
// ⚠ 구간 순서·라벨은 구간 점프 칩(빈 구간도 0건으로 그린다)이 직접 돈다 — `groupDeals`는 빈 구간을 뺀다
export { GROUP_LABEL, GROUP_ORDER } from "./lib/stage";
// ⚠ 정렬 → 분류 순서다. 안정 정렬·빈 구간 제외 규칙을 이 둘이 단독으로 소유한다
export { groupDeals, sortDeals } from "./lib/sort";
// ⚠ 캐러셀 판정(T1 · 3일 이내)의 단일 소스 — 서버 프리페치와 뷰가 같은 함수를 부른다
export { pickRecentRumors } from "./lib/rumors";
// ⚠ URL 파라미터 해석과 리그·구단 필터 — 링크가 만드는 주소와 보드가 읽는 주소가 같은 판정을 써야 한다
export { dealHasClub, dealInLeague, parseTransferClub, parseTransferLeague, parseTransferSort } from "./lib/league";
// ⚠ 루머 구간의 접기 — 식은 루머·열기 상위 판정을 뷰가 다시 짜지 않는다
export { splitHotRumors } from "./lib/rumor-heat";
// ⚠ 진행 중 구간의 소구간(합의 임박·협상 중) — 뱃지 톤과 같은 갈림
export { splitProgress } from "./lib/stage";
// ⚠ 이적료 표기·범위 — 상세의 이적료 카드가 쓴다(목록 UI는 같은 슬라이스라 상대 경로)
export { formatFee, formatFeeRange } from "./lib/fee";
// ⚠ 경로 두 칸의 문구(FA·미확인·미정·외 N)의 단일 소스 — 상세 경로 카드와 목록 UI가 같은 말을 한다
export { destinationClubs, routeLabels } from "./lib/route-label";
// ⚠ 선수 표시명(`playerKo ?? player`)의 단일 소스 — 목록·카드·상세 제목·`<title>`이 같은 이름을 그린다
export { playerName } from "./lib/player-name";
// ⚠ 여러 구단이 노리는 루머의 행선지 자리 — 엠블럼 겹치기. 상세 경로 카드가 쓴다(목록 UI는 같은 슬라이스라 상대 경로)
// ⚠ 이적료 칸은 금액 · FA(확인된 자유계약) · 미공개 셋 중 하나다 — 빈 이적료를 FA로 추정하지 않는다
export { FeeValue } from "./ui/fee-value";
export { DealRow } from "./ui/deal-row";
export { DealMiniCard } from "./ui/deal-mini-card";
export { RumorCard } from "./ui/rumor-card";
// 상세 화면(`views/transfer-detail`)이 그리는 조각들 — 목록 UI는 같은 슬라이스라 상대 경로로 가져간다
// ⚠ 보도 주체의 한국어 표기("벤 제이콥스") — 캐러셀·목록·타임라인이 모두 이 하나를 쓴다
export { reporterName } from "./lib/reporter";
export { StatusBadge } from "./ui/status-badge";
// ⚠ 출처 공신력(🎖️ 매체 · 🌑~🌕 기자) — 등급의 단일 소스는 reporters.json의 credibility다
export { CredibilityBadge } from "./ui/credibility-badge";
export { FeeDelta } from "./ui/fee-delta";
export { TransferCrest } from "./ui/transfer-crest";

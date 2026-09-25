// ⚠ "use client" 모듈 포함 — 서버에서는 model/types·api/mappers·api/keys·api/list-query와
//    lib/stage·lib/rumors·lib/sort·lib/league를 직접 import한다(`entities/match`와 같은 형태).
//
// ⚠ **다른 레이어가 소비하지 않는 것은 올리지 않는다.** `TransferClubRow`·`TransferNewsRow`·
//    `TransferDealWatchRow`·`TransferStatus`·`STAGE_GROUP`·`STAGE_STATUS`·
//    `STATUS_LABEL`·`isDeadStage`·`feeDelta`·`ClubRoute`·`WatchMark`는 이 슬라이스 안에서만
//    쓰여 배럴에서 뺐다. `check:conventions`가 이 유형을 **잡지 못하므로**(상대 경로 소비도
//    "현역"으로 센다) 손으로 지킨다.
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
// ⚠ URL 파라미터 해석과 리그 필터 — 서버 page와 시트가 같은 판정을 써야 한다
export { dealInLeague, parseTransferLeague, parseTransferSort } from "./lib/league";
// ⚠ 이적료 표기·범위 — 상세의 이적료 카드가 쓴다(목록 UI는 같은 슬라이스라 상대 경로)
export { formatFee, formatFeeRange } from "./lib/fee";
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

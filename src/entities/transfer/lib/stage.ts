import type { TransferGroupKey, TransferStage, TransferStatus } from "../model/types";

/**
 * 단계 → 보드 구간. `Record`라 enum에 값이 늘면 누락이 컴파일 에러로 드러난다.
 * ⚠ `unknown`은 `null`이다 — 딜에는 애초에 들어오지 않는다(DB CHECK). `never`로 막지 않는
 *   이유는 `model/types.ts`의 `TransferStage` 주석에. 호출부(`groupDeals`)가 `null`을 거른다.
 */
export const STAGE_GROUP: Record<TransferStage, TransferGroupKey | null> = {
  official: "official",
  here_we_go: "hwg",
  medical: "prog",
  personal_terms: "prog",
  agreement: "prog",
  offer: "prog",
  talks: "prog",
  rumour: "rumor",
  collapsed: "dead",
  unknown: null,
};

/** 구간의 화면 순서 — 고정이다. 구간 점프 칩과 섹션이 같은 배열을 돈다 */
export const GROUP_ORDER = [
  "official",
  "hwg",
  "prog",
  "rumor",
  "dead",
] as const satisfies readonly TransferGroupKey[];

/** ⚠ **타입 별칭만 선언하면 아무것도 검사하지 못한다** — 실제 값에 할당해야 컴파일러가 대조한다 */
const _GROUPS_EXHAUSTIVE: Exclude<TransferGroupKey, (typeof GROUP_ORDER)[number]> extends never
  ? true
  : never = true;

export const GROUP_LABEL: Record<TransferGroupKey, string> = {
  official: "오피셜",
  hwg: "합의 완료",
  prog: "진행 중",
  rumor: "루머",
  dead: "결렬",
};

/**
 * 단계 → 상태 뱃지 톤. `합의 임박`(medical·personal_terms·agreement)과 `협상 중`(offer·talks)이
 * 여러 단계를 한 톤으로 접는다 — 화면이 단계 9개를 구분해 보여줄 이유가 없다(handoff §3).
 */
export const STAGE_STATUS: Record<TransferStage, TransferStatus | null> = {
  official: "official",
  here_we_go: "hwg",
  medical: "imminent",
  personal_terms: "imminent",
  agreement: "imminent",
  offer: "talks",
  talks: "talks",
  rumour: "rumor",
  collapsed: "dead",
  unknown: null,
};

/** 상태 뱃지 라벨 — 카피는 handoff 9장 그대로 */
export const STATUS_LABEL: Record<TransferStatus, string> = {
  official: "오피셜",
  hwg: "합의 완료",
  imminent: "합의 임박",
  talks: "협상 중",
  rumor: "루머",
  dead: "결렬",
};

/**
 * 결렬인가 — 목록 행의 회색 변형·경로의 X 원·취소선이 전부 이 판정을 본다.
 * ⚠ `STAGE_GROUP[stage] === "dead"`를 호출부가 각자 적지 않는다 — 판정이 갈리면 행은 회색인데
 *   뱃지는 협상 중인 조합이 생긴다.
 */
export function isDeadStage(stage: TransferStage): boolean {
  return STAGE_GROUP[stage] === "dead";
}

import type { TransferDeal, TransferGroupKey, TransferStage, TransferStatus } from "../model/types";

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
  denied: "dead",
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
  dead: "결렬·부인",
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
  denied: "denied",
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
  denied: "부인",
};

/**
 * 죽은 딜인가(결렬·부인) — 목록 행의 회색 변형·경로의 표시 원·취소선이 전부 이 판정을 본다.
 * ⚠ `STAGE_GROUP[stage] === "dead"`를 호출부가 각자 적지 않는다 — 판정이 갈리면 행은 회색인데
 *   뱃지는 협상 중인 조합이 생긴다. 결렬과 부인의 구분은 `stage === "denied"` 하나다(뱃지·경로 아이콘·sr 텍스트가 같은 판정을 쓴다).
 */
export function isDeadStage(stage: TransferStage): boolean {
  return STAGE_GROUP[stage] === "dead";
}

/** 진행 중 구간의 소구간 — 뱃지 톤과 같은 갈림(합의 임박 · 협상 중). 라벨은 `STATUS_LABEL`을 그대로 쓴다 */
export type ProgressSubgroupKey = Extract<TransferStatus, "imminent" | "talks">;
export const PROGRESS_SUBGROUPS = ["imminent", "talks"] as const satisfies readonly ProgressSubgroupKey[];

/**
 * 진행 중 구간을 합의 임박(메디컬·개인 조건·합의) / 협상 중(제안·협상)으로 가른다 — 입력 순서는 그대로다.
 * 빈 소구간은 뺀다. 한 소구간뿐이면 호출부가 소제목을 생략한다(뱃지가 이미 같은 말을 한다).
 */
export function splitProgress<T extends Pick<TransferDeal, "stage">>(
  deals: readonly T[],
): { key: ProgressSubgroupKey; label: string; deals: T[] }[] {
  return PROGRESS_SUBGROUPS.map((key) => ({
    key,
    label: STATUS_LABEL[key],
    deals: deals.filter((d) => STAGE_STATUS[d.stage] === key),
  })).filter((g) => g.deals.length > 0);
}

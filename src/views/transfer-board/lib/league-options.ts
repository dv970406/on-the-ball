import { TRANSFER_LEAGUES, type TransferLeague } from "@/entities/transfer";

/** 리그 필터가 없을 때의 표기 — 도구줄 버튼과 시트 첫 항목이 같은 글자를 써야 한다(handoff 9장) */
export const ALL_LEAGUES_LABEL = "전체 리그";

export interface LeagueOption {
  /** `null` = 전체 리그 */
  value: TransferLeague | null;
  label: string;
}

/**
 * 리그 시트의 항목 — `전체 리그` + 5대 리그(`TRANSFER_LEAGUES` 순서).
 * ⚠ 리그 목록을 여기서 다시 적지 않는다 — 망라성 가드는 `entities/transfer`가 갖는다.
 */
export const LEAGUE_OPTIONS: readonly LeagueOption[] = [
  { value: null, label: ALL_LEAGUES_LABEL },
  ...TRANSFER_LEAGUES.map((league) => ({ value: league, label: league })),
];

/** 도구줄의 리그 버튼 라벨 — 선택 리그명 또는 `전체 리그` */
export function leagueLabel(league: TransferLeague | null): string {
  return league ?? ALL_LEAGUES_LABEL;
}

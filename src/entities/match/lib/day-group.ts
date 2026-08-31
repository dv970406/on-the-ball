import { formatMatchDay, seoulDayKey } from "@/shared/lib/format";
import type { Match } from "../model/types";

export interface MatchDayGroup {
  /** KST 달력 하루 — `"2026-09-05"`. React `key`이자 그룹 경계의 판정 근거다 */
  key: string;
  /** 화면에 그리는 헤딩 — `"오늘 (금)"` · `"9월 5일 (토)"` */
  label: string;
  matches: Match[];
}

/**
 * 경기 목록을 **KST 달력 하루**로 묶는다.
 *
 * 카드마다 되풀이되던 날짜를 헤딩 하나로 접기 위한 것이다 — EPL은 주말에 경기가 몰려서
 * 같은 문자열("9월 5일 (토)")이 카드 수만큼 반복되고 있었다.
 *
 * ⚠ **라운드(matchday)로 묶지 않는다.** 라운드는 킥오프 순서와 어긋날 수 있어(연기·재배치)
 *   같은 라운드가 목록에서 여러 토막으로 갈린다. 날짜는 목록이 이미 킥오프 순으로 정렬돼
 *   오므로 **연속 구간을 접기만 하면 되고**, 순서가 어떻든 그룹이 파편화되지 않는다.
 *
 * ⚠ **정렬하지 않는다.** 정렬은 `buildMatchListQueries`가 소유한다(지난 경기는 내림차순,
 *   다가오는 경기는 오름차순) — 여기서 다시 정렬하면 두 구역 중 하나가 뒤집힌다.
 *
 * ⚠ `nowMs`를 인자로 받는 계약은 형제 판정 함수들과 같다(`isMatchOpen`·`isSurveyOpen`).
 *   `null`이면 "오늘/내일"을 판정할 수 없어 절대 날짜가 되지만, **묶음 자체는 그대로다** —
 *   그룹 경계가 시계에 의존하지 않는다.
 */
export function groupMatchesByDay(matches: Match[], nowMs: number | null): MatchDayGroup[] {
  const groups: MatchDayGroup[] = [];

  for (const match of matches) {
    const key = seoulDayKey(match.kickoffAt);
    const last = groups[groups.length - 1];
    // 연속 구간만 본다 — 떨어져 있는 같은 날짜를 합치면 목록의 정렬이 깨진다
    if (last && last.key === key) {
      last.matches.push(match);
      continue;
    }
    groups.push({ key, label: formatMatchDay(match.kickoffAt, nowMs), matches: [match] });
  }

  return groups;
}

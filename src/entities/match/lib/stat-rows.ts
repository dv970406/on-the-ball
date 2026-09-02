import type { MatchStat } from "../model/types";

/**
 * 스탯 표의 한 행 — 라벨과 양 팀 값.
 * ⚠ `unit`은 **막대 계산에 쓰지 않는다**(비율은 두 값의 상대치다) — 표시에만 쓴다.
 */
export interface StatRow {
  key: string;
  label: string;
  home: number;
  away: number;
  unit: "" | "%";
  /** 소수 자리 — xG처럼 정수가 아닌 항목이 있다 */
  decimals: number;
}

/**
 * 그릴 항목과 그 순서 — **우리 편집 결정이다.**
 *
 * ⚠ **DB에 두지 않는다.** 제공자가 항목을 하나 늘릴 때마다 화면이 모르는 행을 그리게 되고,
 *   순서도 제공자가 준 대로 흘러간다. 여기 없는 키는 저장돼 있어도 그리지 않는다.
 *
 * ⚠ **제공자가 주지 않는 항목이 있다.** 프리킥·골킥은 이 제공자에 없어 목록에서 빠졌고,
 *   기대도움(xA)도 없다 — 참고 화면과 대조하면 17행 중 14행이다. 없는 것을 자리만 잡아 두면
 *   화면이 영원히 "—"를 그린다.
 *
 * ⚠ **`key_passes`·`substitutions`는 제공자가 아니라 동기화가 센다**(선수별 합·사건 수).
 *   화면 입장에서는 출처가 같아 구분할 필요가 없다 — 그래서 `match_stat` 한 곳만 읽는다.
 */
const STAT_ROWS = [
  { key: "possession", label: "볼점유율", unit: "%", decimals: 0 },
  { key: "shots_total", label: "슈팅", unit: "", decimals: 0 },
  { key: "shots_on_goal", label: "유효슈팅", unit: "", decimals: 0 },
  { key: "passes_total", label: "패스 시도", unit: "", decimals: 0 },
  { key: "passes_accurate", label: "패스 성공", unit: "", decimals: 0 },
  { key: "key_passes", label: "키패스", unit: "", decimals: 0 },
  { key: "corners", label: "코너킥", unit: "", decimals: 0 },
  { key: "offsides", label: "오프사이드", unit: "", decimals: 0 },
  { key: "saves", label: "선방", unit: "", decimals: 0 },
  { key: "substitutions", label: "선수 교체", unit: "", decimals: 0 },
  { key: "fouls", label: "파울", unit: "", decimals: 0 },
  { key: "yellow_cards", label: "경고", unit: "", decimals: 0 },
  { key: "red_cards", label: "퇴장", unit: "", decimals: 0 },
  { key: "expected_goals", label: "기대득점", unit: "", decimals: 2 },
] as const satisfies readonly { key: string; label: string; unit: "" | "%"; decimals: number }[];

/**
 * 저장된 스탯 → 그릴 행들.
 *
 * ⚠ **양쪽 값이 다 있을 때만 행을 만든다.** 한쪽만 온 항목은 비교가 성립하지 않는데,
 *   없는 쪽을 0으로 접으면 "이 팀은 슈팅이 0회"라는 거짓이 된다 — `match_stat`에 행이
 *   없는 것과 값이 0인 것을 DB가 일부러 구분해 둔 이유를 화면이 이어받는다.
 */
export function buildStatRows(stats: MatchStat[]): StatRow[] {
  const byKey = new Map<string, { home?: number; away?: number }>();
  for (const s of stats) {
    const slot = byKey.get(s.statKey) ?? {};
    slot[s.side] = s.value;
    byKey.set(s.statKey, slot);
  }

  const rows: StatRow[] = [];
  for (const spec of STAT_ROWS) {
    const found = byKey.get(spec.key);
    if (found?.home === undefined || found.away === undefined) continue;
    rows.push({
      key: spec.key,
      label: spec.label,
      home: found.home,
      away: found.away,
      unit: spec.unit,
      decimals: spec.decimals,
    });
  }
  return rows;
}

/**
 * 막대 길이 — 두 값의 상대 비율(%).
 *
 * ⚠ **둘 다 0이면 반반이 아니라 둘 다 0이다.** 퇴장 0-0에 막대를 반씩 그리면 "둘 다 절반"으로
 *   읽힌다 — 아무 일도 없었다는 뜻이라 막대가 없어야 맞다.
 * ⚠ 절대값이 아니라 상대값인 이유: 항목마다 단위가 달라(패스 500 vs xG 0.31) 공통 최대치를
 *   잡을 수 없다.
 */
export function barPercent(value: number, other: number): number {
  /*
   * ⚠ **음수를 0으로 접는다 — 안 접으면 막대가 가득 찬다.** `width: "-50%"`는 CSS가 거부해
   *   `auto`가 되고, 그 요소가 블록이라 부모 폭을 **100% 채운다** → 음수가 "0"이 아니라
   *   "최대"로 그려진다. `match_stat.value`에 음수 금지 CHECK가 없고 제공자의
   *   `goals_prevented`는 실제로 음수가 되며 이미 저장되고 있다(표시 목록에 넣는 순간 터진다).
   */
  const a = Math.max(0, value);
  const b = Math.max(0, other);
  const total = a + b;
  // ⚠ 둘 다 0이면 반반이 아니라 **둘 다 0**이다(퇴장 0-0에 반쪽 막대를 그리면 거짓말이다)
  if (total <= 0) return 0;
  return (a / total) * 100;
}

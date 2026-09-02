import type { LineupPlayer, MatchSide } from "../model/types";

/**
 * 피치 위 한 자리 — 백분율이라 컨테이너 크기를 모른다.
 *
 * ⚠ px가 아니라 %인 이유가 규약이다. 화면 폭이 430px 프레임 안에서도 달라지는데, px로
 *   계산하면 컨테이너를 측정해야 하고(레이아웃 이펙트 한 겹) 그 값이 첫 렌더에 없다.
 */
export interface PitchSpot {
  player: LineupPlayer;
  /** 뷰어 기준 왼쪽에서(%) */
  leftPct: number;
  /** 뷰어 기준 위에서(%) — 피치 전체 높이 기준이라 양 팀이 한 좌표계를 공유한다 */
  topPct: number;
}

/**
 * 선발을 피치 좌표로 편다.
 *
 * ⚠⚠ **좌우 판정을 여기가 단독으로 소유한다.** 제공자는 **양 팀 모두 자기 왼쪽부터** 열
 *   번호를 매긴다(실측: 홈·원정 둘 다 col 1이 좌측 수비수). 그런데 화면은 두 팀을 한 피치에
 *   마주 보게 그리므로, 위쪽 팀은 아래로 공격해 **자기 왼쪽이 뷰어의 오른쪽**이 된다 →
 *   위쪽 팀만 좌우를 뒤집는다.
 *   뒤집기를 빠뜨리면 좌우 풀백이 반대편에 서는데, **화면은 멀쩡해 보이고** 경기를 아는
 *   사람만 알아챈다. 그래서 판정을 호출부에 흘리지 않고 함수가 갖는다.
 *
 * ⚠ **행·열 모두 값이 아니라 정렬 후 순서를 쓴다.** `grid_row`·`grid_col`이 1부터 빈틈없이
 *   온다는 보장이 없다 — 값을 그대로 쓰면 배치가 어긋나고, 열은 아예 피치 밖으로 나간다.
 *
 * ⚠ 좌표가 없는 선수는 **버리지 않고 제외만** 한다 — 벤치는 애초에 좌표가 없고(DB CHECK),
 *   선발도 제공자가 비울 수 있다(`formation`을 nullable로 둔 것과 같은 사정). 그 선수는
 *   피치에 안 그려질 뿐 명단에는 남는다.
 */
/** 좌표가 확정된 선발 — 아래 계산이 `as number` 없이 돌게 하는 좁힘 */
type PlacedPlayer = LineupPlayer & { gridRow: number; gridCol: number };

export function buildPitchSpots(starters: LineupPlayer[], side: MatchSide): PitchSpot[] {
  // ⚠ 술어로 좁힌다 — `as number` 캐스트를 두면 아래 계산을 고칠 때 보증이 가려진다
  //   (`api/mappers.ts`의 `(p): p is LineupPlayer =>`가 같은 형태의 선례다).
  const placed = starters.filter(
    (p): p is PlacedPlayer => p.gridRow !== null && p.gridCol !== null,
  );
  if (placed.length === 0) return [];

  const rows = [...new Set(placed.map((p) => p.gridRow))].sort((a, b) => a - b);
  const isTop = side === "home";

  return placed.map((player) => {
    const rowIndex = rows.indexOf(player.gridRow);
    /*
     * ⚠⚠ **열도 행과 **같은 방식**으로 다룬다 — 개수로 나누면 한 명이 빠질 때 나머지가
     *   피치 밖으로 밀려난다.** 전에는 분모가 "그 줄의 인원 수"였는데, 같은 줄에서 좌표가
     *   하나라도 비면(선발의 좌표 null을 DB CHECK가 허용한다 — 위 주석) 남은 선수의
     *   `gridCol`이 분모를 넘어 `across > 1`이 되고, 컨테이너가 `overflow-hidden`이라
     *   **그 선수가 통째로 사라졌다**(홈은 뒤집혀 음수라 왼쪽으로 사라진다).
     *   예: 2행이 col 1·2·4만 남으면 col 4가 `3.5/3 = 1.17` → 117%.
     *   → 열 **값의 집합**에서 순서를 뽑으면 비연속·1시작 아님·상한 초과가 전부 접힌다.
     *   행에 대해 이미 하고 있던 처리를 열에도 하는 것이라 파일의 원칙과 일관된다.
     */
    const colsInRow = [...new Set(placed.filter((p) => p.gridRow === player.gridRow).map((p) => p.gridCol))]
      .sort((a, b) => a - b);

    // 자기 골라인(0)에서 하프라인(1)까지의 깊이 — 줄 사이가 고르게 벌어지도록 반 칸씩 띄운다
    const depth = (rowIndex + 0.5) / rows.length;
    // 자기 기준 왼쪽(0)에서 오른쪽(1)까지
    const across = (colsInRow.indexOf(player.gridCol) + 0.5) / colsInRow.length;

    return {
      player,
      // 위쪽 팀만 좌우를 뒤집는다(위 주석)
      leftPct: (isTop ? 1 - across : across) * 100,
      // 위쪽 팀은 위 절반, 아래쪽 팀은 아래 절반. 각자 자기 골라인에서 하프라인 쪽으로 자란다.
      topPct: (isTop ? depth * 0.5 : 1 - depth * 0.5) * 100,
    };
  });
}

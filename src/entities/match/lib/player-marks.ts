import type { MatchEvent } from "../model/types";

/** 한 선수에게 붙는 표시 — 피치 마커와 후보 명단이 같은 값을 읽는다 */
export interface PlayerMarks {
  goals: number;
  /** 자책골 — 득점과 **같은 칸에 세지 않는다**(상대 팀 점수라 뜻이 반대다) */
  ownGoals: number;
  assists: number;
  card: "yellow" | "red" | null;
  /** 교체되어 나간 분 */
  outMinute: number | null;
  /** 교체로 들어오며 대신한 선수와 그 분 */
  inFor: { name: string | null; minute: number } | null;
}

const EMPTY: PlayerMarks = {
  goals: 0,
  ownGoals: 0,
  assists: 0,
  card: null,
  outMinute: null,
  inFor: null,
};

/**
 * 사건 목록 → 선수별 표시.
 *
 * ⚠⚠ **`kind === "goal"`이 곧 득점이 아니다.** 제공자는 골 타입에 실축 페널티도 담고,
 *   **VAR로 취소된 페널티에는 선수 없는 골 이벤트가 딸려 온다**(실측: 최종 0-1인 경기의
 *   골 이벤트가 2건이었고 그중 하나는 55분 `Penalty cancelled`와 짝이었다).
 *   → `detail`로 걸러내고, 선수를 특정할 수 없는 골은 애초에 붙일 자리가 없어 사라진다.
 *   ⚠ **이 함수가 그 판정을 단독으로 갖는다** — 호출부가 각자 세면 피치와 명단이 갈린다.
 *
 * ⚠ **경고 두 장은 퇴장이다.** 제공자가 두 번째를 `Red Card`로 줄 때도 있고 `Yellow`를
 *   두 번 줄 때도 있어(리그·시즌마다 다르다) 둘 다 받는다 — 그래서 판정이 **단조 승격**이다.
 */
export function buildPlayerMarks(events: MatchEvent[]): Map<number, PlayerMarks> {
  const marks = new Map<number, PlayerMarks>();
  const of = (id: number) => {
    const found = marks.get(id);
    if (found) return found;
    const created = { ...EMPTY };
    marks.set(id, created);
    return created;
  };

  for (const e of events) {
    const detail = e.detail ?? "";

    if (e.kind === "goal") {
      // ⚠ 실축은 골이 아니다 — 타입만 보면 실축한 선수에게 골 아이콘이 붙는다.
      if (detail.includes("Missed")) continue;
      if (e.playerId !== null) {
        if (detail.includes("Own Goal")) of(e.playerId).ownGoals += 1;
        else of(e.playerId).goals += 1;
      }
      // 도움 — 자책골에는 도움이 없다
      if (e.relatedPlayerId !== null && !detail.includes("Own Goal")) {
        of(e.relatedPlayerId).assists += 1;
      }
      continue;
    }

    if (e.kind === "card" && e.playerId !== null) {
      const mark = of(e.playerId);
      /*
       * ⚠ **단조 승격만 한다 — `else if`로 두면 퇴장이 경고로 강등된다.**
       *   전에는 `else if (detail.includes("Yellow"))`였는데, 이미 `red`인 선수에게
       *   `Yellow`가 담긴 이벤트가 뒤에 오면 첫 조건이 false라 else로 떨어져 **덮어썼다.**
       *   제공자가 2차 경고에 `Yellow`와 `Red`를 같은 분에 함께 주는 리그가 있고,
       *   같은 분 안의 순서는 보장되지 않는다 → 퇴장한 선수가 경고로 그려진다.
       *   `mark.card !== null`로 두면 "두 번째 카드는 퇴장"이라는 축구 규칙이 그대로
       *   코드가 되고 red→yellow 경로가 아예 사라진다.
       *
       * ⚠ **`detail`을 못 읽어도 카드는 남긴다.** `detail`은 nullable이고 동기화가 실제로
       *   null을 쓴다(`sync-match-detail.mjs`) — 전에는 `""`가 `Red`도 `Yellow`도 포함하지
       *   않아 **배지가 통째로 사라졌고**, 같은 화면의 `yellow_cards` 숫자와 어긋났다.
       *   "카드가 있었다"가 "무슨 카드였나"보다 먼저다.
       */
      mark.card = detail.includes("Red") || mark.card !== null ? "red" : "yellow";
      continue;
    }

    if (e.kind === "substitution") {
      // ⚠ **`playerId`가 나간 선수다**(제공자가 이름과 반대로 준다 — 동기화가 뒤집어 넣는다).
      if (e.playerId !== null) of(e.playerId).outMinute = e.minute;
      if (e.relatedPlayerId !== null) {
        of(e.relatedPlayerId).inFor = { name: e.playerName, minute: e.minute };
      }
    }
  }

  return marks;
}

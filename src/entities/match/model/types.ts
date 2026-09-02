import type { Database } from "@/types/database.types";

export type MatchRow = Database["public"]["Tables"]["match"]["Row"];
export type TeamRow = Database["public"]["Tables"]["team"]["Row"];

/** 'home' | 'draw' | 'away' — DB enum에서 생성된 타입이라 손으로 적지 않는다 */
export type MatchPick = Database["public"]["Enums"]["match_pick"];

/**
 * 화면에 노출하는 순서(1X2 관례: 홈 · 무 · 원정).
 *
 * ⚠ `as const satisfies`가 **없는 값**을 막고, 아래 망라성 가드가 **빠뜨린 값**을 막는다.
 *   enum에 값이 늘면 양방향으로 컴파일 에러가 된다(`POST_CATEGORIES`와 같은 형태).
 */
export const MATCH_PICKS = ["home", "draw", "away"] as const satisfies readonly MatchPick[];

/** ⚠ **타입 별칭만 선언하면 아무것도 검사하지 못한다** — 실제 값에 할당해야 컴파일러가 대조한다 */
const _PICKS_EXHAUSTIVE: Exclude<MatchPick, (typeof MATCH_PICKS)[number]> extends never
  ? true
  : never = true;

/**
 * 짧은 라벨.
 * ⚠ **화면은 팀 이름을 그린다** — 지금 이 맵이 실제로 쓰이는 곳은 이름이 없는 `draw`뿐이다
 *   (`prediction-block`·`match-card`). `home`·`away`는 팀을 모르는 자리가 생길 때를 위해 남긴다.
 *   `Record`라 enum에 값이 늘면 누락이 컴파일 에러로 드러난다.
 */
export const MATCH_PICK_LABEL: Record<MatchPick, string> = {
  home: "홈 승",
  draw: "무승부",
  away: "원정 승",
};

/** 'home' | 'away' — DB enum에서 생성된 타입이라 손으로 적지 않는다 */
export type MatchSide = Database["public"]["Enums"]["match_side"];

/** 'start' | 'bench' */
export type LineupRole = Database["public"]["Enums"]["lineup_role"];

export type PlayerRow = Database["public"]["Tables"]["player"]["Row"];
export type MatchLineupRow = Database["public"]["Tables"]["match_lineup"]["Row"];
export type MatchLineupPlayerRow = Database["public"]["Tables"]["match_lineup_player"]["Row"];

export interface LineupPlayer {
  playerId: PlayerRow["id"];
  /**
   * 제공자 선수 id — **사진 URL이 여기서 유도된다**(`playerPhotoUrl`).
   * ⚠ 사진 주소를 저장하지 않는 이유는 주소가 이 값에서 결정적으로 나오기 때문이다
   *   (엠블럼을 `team.code`에서 유도한 것과 같은 판단 — 다만 엠블럼은 사본을 커밋하고
   *   여기는 핫링크라 자산의 성격은 반대다. 사유는 `lib/player-photo`).
   */
  externalId: PlayerRow["external_id"];
  /**
   * ⚠ **한국어다**(`team.name`과 같은 규약) — 화면에서 옮기지 않는다.
   *   표기는 `scripts/player-names-ko.json`이 갖고, 없는 선수만 영문 풀네임으로 폴백한다.
   */
  name: PlayerRow["name"];
  shirtNumber: MatchLineupPlayerRow["shirt_number"];
  /** 'G' · 'D' · 'M' · 'F' — 제공자 표기라 **닫힌 집합이 아니다**(enum이 아닌 이유) */
  position: MatchLineupPlayerRow["position"];
  /**
   * 평점.
   * ⚠ **`null`이 "0점"이 아니라 "출전하지 않음"이다.** 미출전 후보에게 0.0을 그리면
   *   화면이 최악의 평점을 말하는 셈이 된다(동기화가 실제로 그렇게 저장한 적이 있다 —
   *   `Number(null)`이 0이고 범위 검사 0~10도 그걸 통과시켰다).
   * ⚠ 다른 사이트의 평점과 **값이 다르다**(같은 경기 같은 선수에서 최대 3.4점 차 실측).
   *   화면이 출처를 밝혀야 하고, 다른 곳 숫자와 맞추려 들면 안 된다.
   */
  rating: number | null;
  /**
   * 피치 좌표(행:열). **선발만 갖는다** — 벤치는 피치 위에 없어 DB CHECK가 null을 강제한다.
   * ⚠ 열은 **그 팀의 왼쪽부터** 1씩 는다(양 팀 모두 — 실측). 뷰어 기준 좌우는
   *   공격 방향에 따라 갈리므로 `lib/pitch-layout`이 단독으로 판정한다.
   */
  gridRow: MatchLineupPlayerRow["grid_row"];
  gridCol: MatchLineupPlayerRow["grid_col"];
}

/** 'goal' | 'card' | 'substitution' */
export type MatchEventKind = Database["public"]["Enums"]["match_event_kind"];

export type MatchEventRow = Database["public"]["Tables"]["match_event"]["Row"];

export interface MatchEvent {
  id: MatchEventRow["id"];
  side: MatchSide;
  kind: MatchEventKind;
  minute: MatchEventRow["minute"];
  /** 추가시간(45+2의 2). ⚠ 분과 합치지 않는다 — 전반 추가시간과 후반 2분이 구분되지 않는다 */
  extraMinute: MatchEventRow["extra_minute"];
  /**
   * 사건의 주체. 종류마다 뜻이 다르다 —
   *   goal → 득점자 · card → 카드를 받은 선수 · substitution → **나간 선수**
   * ⚠ **`null`일 수 있다.** 제공자가 선수를 특정하지 못하는 사건이 있고, 특히 **VAR로 취소된
   *   페널티에 선수 없는 골 이벤트가 딸려 온다**(실측: 최종 0-1인 경기에 골 이벤트가 2건).
   *   그래서 골 이벤트 수를 스코어로 삼으면 안 된다 — 화면은 **선수에 붙일 수 있는 것만** 그린다.
   */
  playerId: MatchEventRow["player_id"];
  playerName: string | null;
  /** goal → 도움 · substitution → **들어온 선수** · card → 없다 */
  relatedPlayerId: MatchEventRow["related_player_id"];
  relatedPlayerName: string | null;
  /** 'Normal Goal'·'Own Goal'·'Penalty'·'Missed Penalty'·'Yellow Card'·'Red Card' 등 제공자 원문 */
  detail: MatchEventRow["detail"];
}

export type MatchStatRow = Database["public"]["Tables"]["match_stat"]["Row"];

export interface MatchStat {
  side: MatchSide;
  /** 우리 슬러그(`possession`·`expected_goals`…) — 제공자 문자열이 아니다 */
  statKey: MatchStatRow["stat_key"];
  /**
   * ⚠ **행이 없는 것과 0은 다르다.** 없으면 "그 항목을 받지 못했다"이고 0은 실제로 0이다
   *   (제공자가 퇴장 0을 null로 주므로 동기화가 아는 카운터만 0으로 접는다).
   */
  value: number;
}

export interface MatchLineup {
  side: MatchSide;
  /** "4-2-3-1". ⚠ nullable — 제공자가 라인업은 주면서 포메이션을 비우는 경기가 있다 */
  formation: MatchLineupRow["formation"];
  coachName: MatchLineupRow["coach_name"];
  starters: LineupPlayer[];
  bench: LineupPlayer[];
}

export interface Team {
  code: TeamRow["code"];
  name: TeamRow["name"];
  /**
   * 팬들이 실제로 쓰는 **한국어 약칭**("맨유"·"울브스") — 예측 버튼 라벨이 이 값을 쓴다.
   * ⚠ 정식명을 버튼에 쓰면 좁은 화면에서 잘리는데 **잘린 팀 이름은 고를 수가 없다.**
   * ⚠ 표기는 `scripts/team-names-ko.json`이 갖고, 매핑이 없는 팀만 API의 tla(3글자 영문)로
   *   폴백한다 — 폴백이 주 정의가 아니다.
   */
  shortName: TeamRow["short_name"];
}

export interface Match {
  id: MatchRow["id"];
  season: MatchRow["season"];
  matchday: MatchRow["matchday"];
  homeTeam: Team;
  awayTeam: Team;
  /** **예측 마감이 곧 이 값이다** */
  kickoffAt: MatchRow["kickoff_at"];
  homeScore: MatchRow["home_score"];
  awayScore: MatchRow["away_score"];
  /**
   * 정답. ⚠ **컬럼이지만 스코어에서 파생된 값**이라 우리가 채우지 않는다.
   *   `null`이면 "아직 결과가 없다" **또는** "무효 경기다" — 둘을 가르는 술어를 따로 두지
   *   않으려고 DB가 무효일 때도 null로 만든다(`result is not null` = 채점 가능).
   */
  result: MatchRow["result"];
  /**
   * 취소·기권으로 무효가 됐는가.
   * ⚠ 화면 문구만이 아니라 **`lib/open.ts` 세 술어의 판정 입력**이고 `og:description`도 가른다
   *   — `result`가 null인 두 사유(미종료·무효) 중 하나를 이 값만이 구분한다.
   */
  isVoided: boolean;
  /**
   * 내가 고른 값.
   * ⚠ `match_prediction`의 SELECT 정책이 "내 행만"이라 **임베딩 배열 길이가 곧 이 값**이다
   *   (`post_like`·`post_poll_vote`와 같은 트릭 — 남의 예측이 새는 사고가 구조적으로 불가능하다).
   */
  myPick: MatchPick | null;
}

/** `match_prediction_results` RPC의 행 */
export interface MatchPredictionResult {
  pick: MatchPick;
  voteCount: number;
}

/**
 * 내 적중률.
 * ⚠ **컬럼이 아니다.** 카운터를 두면 흔들 경로가 다섯이라(예측 생성·변경·채점·**스코어 정정**·
 *   무효화, 그리고 탈퇴 cascade) `like_count`가 겪은 어긋남을 그대로 되풀이한다 —
 *   원본과 `match.result`를 대조해 그때그때 센다. 정말 느려지면 그때 집계 함수나
 *   머티리얼라이즈드 뷰를 붙인다. **이 판단의 단일 소유자가 여기다.**
 */
export interface PredictionAccuracy {
  hits: number;
  total: number;
  /** 응답이 `max_rows`에 잘려 셈을 믿을 수 없는가 — 참이면 화면이 비율을 그리지 않는다 */
  truncated: boolean;
}

/**
 * 경기 목록 한 페이지.
 *
 * ⚠ **구역이 데이터 구조에 들어 있다.** 화면이 클라이언트 시계로 다시 나누지 않게 하려는
 *   것이다 — 조회 조건이 이미 가른 것을 화면이 다른 시계로 재분류하면 두 판정이 갈린다.
 *
 * ⚠ **`api/queries.ts`가 아니라 여기 있다.** 그 파일은 `"use client"`라 서버 페이지가
 *   import할 수 없는데, SSR 프리페치가 이 타입으로 값을 조립해 넘긴다
 *   (상한 상수를 `api/mappers.ts`에 둔 것과 같은 이유).
 */
export interface MatchListPage {
  past: Match[];
  upcoming: Match[];
}

import type {
  AdminMatch,
  LineupPlayer,
  LineupRole,
  Match,
  MatchLineup,
  MatchEvent,
  MatchEventRow,
  MatchLineupPlayerRow,
  MatchPick,
  MatchPredictionResult,
  MatchRow,
  MatchSide,
  MatchStat,
  MatchStatRow,
  Team,
  TeamRow,
} from "../model/types";

/**
 * 구역별 상한.
 *
 * ⚠ **하나의 상한으로 합치지 않는다.** 처음엔 `limit 30` 하나에 킥오프 오름차순이었는데,
 *   킥오프 오름차순이라 **지난 경기가 상한을 채우면 다가오는 경기가 0건이 된다**(실측).
 *   주중 라운드가 겹치면 창 안의 지난 경기만으로 30건이 찬다. 예측할 수 있는 경기가
 *   화면에서 통째로 사라지는데, 잘림 안내는 "30경기까지만"이라고만 말해 무엇을 잃었는지
 *   알려주지도 못한다. 구역마다 상한을 따로 걸면 한쪽이 다른 쪽을 굶길 수 없다.
 *
 * ⚠ **`api/queries.ts`가 아니라 여기 있다** — 그 파일은 `"use client"`라 서버가 import할 수
 *   없는데, 목록 SSR 프리페치가 같은 값을 써야 한다.
 */
export const MATCH_PAST_LIMIT = 10;
export const MATCH_UPCOMING_LIMIT = 20;

/**
 * 지난 경기 구역이 거슬러 올라가는 창.
 *
 * 지난 경기를 함께 싣는 이유가 UX다 — 예측 게임의 보상은 "내가 맞췄나"이고, 그걸 먼저
 * 보여준 뒤 다음 예측을 권하는 순서가 맞다.
 *
 * ⚠ **7일보다 짧게 두지 않는다.** EPL은 라운드가 주 단위라 3일로 뒀더니 **주중에 접속하면
 *   지난 라운드의 결과가 통째로 창 밖으로 밀려났다**(실측: 종료 경기 3건이 -4·-5·-6일이라
 *   목록에 하나도 안 남고, 취소·연기된 경기만 "지난 경기"에 떴다).
 */
export const MATCH_LIST_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const TEAM_COLUMNS = "code, name, short_name";

/**
 * PostgREST select 문자열의 단일 소스 — 스키마가 바뀌면 여기 한 곳만 고친다.
 *
 * ⚠ **`team!컬럼명` 형태로 경로를 못박는다.** `match → team` 임베딩 경로가 홈·원정 둘이라
 *   그냥 `team(...)`은 PGRST201로 실패한다. 컬럼명만 쓴 `home:home_team(...)`은 런타임엔
 *   통하지만 **생성 타입의 추론이 모호성을 풀지 못한다**(`BLOCKED_SELECT`가 같은 이유로
 *   `blocked:profiles!blocked_id(...)` 형태를 쓴다 — 캐스트로 덮으면 스키마 어긋남을
 *   컴파일러가 못 잡는다).
 *
 * ⚠ **`result`를 그대로 받는다.** 스코어에서 파생된 컬럼이라 클라이언트가 다시 계산하면
 *   판정이 두 곳으로 갈린다 — 무효 경기에서 null이 되는 규칙까지 DB가 단독으로 소유한다.
 *
 * ⚠ `match_prediction` 임베딩은 SELECT 정책이 "내 행만"이라 **배열 길이가 곧 "내가 골랐는가"** 다.
 *   목록에도 실려야 카드가 내 예측을 그릴 수 있다.
 */
/**
 * ⚠ **문자열을 `+`로 잇지 않는다.** supabase-js는 select 문자열의 **리터럴 타입**을 파싱해
 *   결과 형태를 만드는데, 조각을 이어 붙이면 타입이 `string`으로 넓어져 추론이 통째로
 *   `GenericStringError`가 된다(실측). 한 템플릿 리터럴로 둔다.
 */
export const MATCH_SELECT =
  `id, season, matchday, kickoff_at, home_score, away_score, result, voided_at, home:team!home_team(${TEAM_COLUMNS}), away:team!away_team(${TEAM_COLUMNS}), match_prediction(pick)` as const;

/**
 * 어드민 목록·수정용 select.
 *
 * ⚠ `match_prediction` 임베딩을 **일부러 뺐다** — 어드민 화면은 "내 예측"을 그리지 않는데
 *   그 임베딩은 행마다 정책 평가를 태운다. 대신 `deleted_at`·`admin_locked_at`·`external_id`가
 *   들어온다(어드민 조회 경로에만 오는 값들이다).
 * ⚠ 조각을 `+`로 잇지 않는다 — 리터럴 타입이 `string`으로 넓어지면 추론이 통째로 깨진다.
 */
export const ADMIN_MATCH_SELECT =
  `id, season, matchday, kickoff_at, home_score, away_score, result, voided_at, deleted_at, admin_locked_at, external_id, home:team!home_team(${TEAM_COLUMNS}), away:team!away_team(${TEAM_COLUMNS})` as const;

type TeamSelectRow = Pick<TeamRow, "code" | "name" | "short_name">;

/** MATCH_SELECT가 돌려주는 행 — 컬럼 타입은 생성 타입에서 뽑는다 */
export interface MatchSelectRow {
  id: MatchRow["id"];
  season: MatchRow["season"];
  matchday: MatchRow["matchday"];
  kickoff_at: MatchRow["kickoff_at"];
  home_score: MatchRow["home_score"];
  away_score: MatchRow["away_score"];
  result: MatchRow["result"];
  voided_at: MatchRow["voided_at"];
  home: TeamSelectRow | null;
  away: TeamSelectRow | null;
  /** SELECT 정책이 "내 행만"이라 길이가 0 또는 1이다 */
  match_prediction: { pick: MatchPick }[] | null;
}

/**
 * ⚠ FK가 `not null`이라 팀은 항상 온다. 그래도 `null` 폴백을 두는 이유는 **타입이 그렇게
 *   생성되기 때문**이고, 여기서 throw하면 팀 하나가 이상할 때 목록 전체가 죽는다.
 */
const UNKNOWN_TEAM: Team = { code: "", name: "미정", shortName: "—" };

function buildTeam(row: TeamSelectRow | null): Team {
  if (!row) return UNKNOWN_TEAM;
  return { code: row.code, name: row.name, shortName: row.short_name };
}

export function buildMatch(row: MatchSelectRow): Match {
  return {
    id: row.id,
    season: row.season,
    matchday: row.matchday,
    homeTeam: buildTeam(row.home),
    awayTeam: buildTeam(row.away),
    kickoffAt: row.kickoff_at,
    homeScore: row.home_score,
    awayScore: row.away_score,
    result: row.result,
    isVoided: row.voided_at !== null,
    myPick: row.match_prediction?.[0]?.pick ?? null,
  };
}

/** ADMIN_MATCH_SELECT가 돌려주는 행 */
export interface AdminMatchSelectRow {
  id: MatchRow["id"];
  season: MatchRow["season"];
  matchday: MatchRow["matchday"];
  kickoff_at: MatchRow["kickoff_at"];
  home_score: MatchRow["home_score"];
  away_score: MatchRow["away_score"];
  result: MatchRow["result"];
  voided_at: MatchRow["voided_at"];
  deleted_at: MatchRow["deleted_at"];
  admin_locked_at: MatchRow["admin_locked_at"];
  external_id: MatchRow["external_id"];
  home: TeamSelectRow | null;
  away: TeamSelectRow | null;
}

export function buildAdminMatch(row: AdminMatchSelectRow): AdminMatch {
  return {
    id: row.id,
    season: row.season,
    matchday: row.matchday,
    homeTeam: buildTeam(row.home),
    awayTeam: buildTeam(row.away),
    kickoffAt: row.kickoff_at,
    homeScore: row.home_score,
    awayScore: row.away_score,
    result: row.result,
    isVoided: row.voided_at !== null,
    deletedAt: row.deleted_at,
    adminLockedAt: row.admin_locked_at,
    externalId: row.external_id,
  };
}

/** `match_prediction_results` RPC의 행 → 도메인 */
export function buildMatchPredictionResult(row: {
  pick: MatchPick;
  vote_count: number;
}): MatchPredictionResult {
  return { pick: row.pick, voteCount: row.vote_count };
}

/**
 * 라인업 select — **`MATCH_SELECT`에 임베딩하지 않는다.**
 *
 * ⚠ 양 팀 40행에 선수 조인까지 붙어서, 임베딩하면 **예측만 하러 온 사람도 그걸 전부 받는다.**
 *   게다가 라인업은 킥오프 20~40분 전에야 생겨 대부분의 시간에는 없는 데이터다
 *   (`entities/poll`을 `entities/post`에서 뗀 것과 같은 판단 — 대가로 요청이 하나 는다).
 *
 * ⚠ **`match_lineup_player`가 부모를 복합 FK(`match_id, side`)로 참조하는데도 임베딩이 된다**
 *   (실측). 경로가 하나뿐이라 `player(...)`도 모호하지 않다.
 *
 * ⚠ **문자열을 `+`로 잇지 않는다** — `MATCH_SELECT`와 같은 이유다(리터럴 타입이 넓어지면
 *   추론이 통째로 `GenericStringError`가 된다).
 */
export const LINEUP_SELECT =
  `side, formation, coach_name, match_lineup_player(role, grid_row, grid_col, position, shirt_number, rating, sort_order, player(id, name, external_id))` as const;

type LineupPlayerSelectRow = Pick<
  MatchLineupPlayerRow,
  "role" | "grid_row" | "grid_col" | "position" | "shirt_number" | "rating" | "sort_order"
> & { player: { id: number; name: string; external_id: string } | null };

/** `LINEUP_SELECT`가 돌려주는 행 */
export interface MatchLineupSelectRow {
  side: MatchSide;
  formation: string | null;
  coach_name: string | null;
  match_lineup_player: LineupPlayerSelectRow[] | null;
}

function buildLineupPlayer(row: LineupPlayerSelectRow): LineupPlayer | null {
  // ⚠ FK가 not null이라 선수는 항상 온다. 그래도 버리는 쪽을 택하는 것은, 이름 없는 점을
  //   피치에 찍어 두면 **누군지 알 수 없는 선수**가 되기 때문이다(팀은 "미정"으로 폴백해도
  //   대진이 읽히지만, 여기서는 그 자리가 통째로 뜻을 잃는다).
  if (!row.player) return null;
  return {
    playerId: row.player.id,
    externalId: row.player.external_id,
    name: row.player.name,
    shirtNumber: row.shirt_number,
    position: row.position,
    // ⚠ `?? null`로 접지 않는다 — numeric은 숫자로 오고 미출전은 null이다. 0과 null을
    //   섞으면 미출전 선수가 0.0점으로 그려진다.
    rating: row.rating,
    gridRow: row.grid_row,
    gridCol: row.grid_col,
  };
}

/**
 * 라인업 행들 → 편별 도메인 객체.
 *
 * ⚠ **정렬을 화면이 다시 짜지 않는다.** `sort_order`가 제공자가 준 순서(GK→수비→미드→공격)를
 *   담고 있고, 벤치는 피치 좌표가 없어 이 값이 유일한 기준이다.
 */
export function buildMatchLineups(rows: MatchLineupSelectRow[]): MatchLineup[] {
  return rows.map((row) => {
    const players = (row.match_lineup_player ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    // ⚠ 생 `string`이 아니라 enum 파생 타입 — 오타가 컴파일에 잡힌다
    const pick = (role: LineupRole) =>
      players
        .filter((p) => p.role === role)
        .map(buildLineupPlayer)
        .filter((p): p is LineupPlayer => p !== null);
    return {
      side: row.side,
      formation: row.formation,
      coachName: row.coach_name,
      starters: pick("start"),
      bench: pick("bench"),
    };
  });
}

/**
 * 사건 select.
 *
 * ⚠ **라인업과 별도 쿼리다.** 두 값의 수명이 다르다 — 라인업은 킥오프에 고정되지만 사건은
 *   경기 내내 쌓인다. 한 쿼리로 묶으면 사건이 갱신될 때마다 라인업 40행까지 다시 받는다.
 * ⚠ **`player!컬럼명` 형태로 경로를 못박는다.** `match_event → player` 경로가 둘
 *   (`player_id`·`related_player_id`)이라 그냥 `player(...)`는 PGRST201이고, 별칭에 컬럼명만
 *   쓴 `actor:player_id(name)`은 **런타임엔 통하지만 생성 타입이 모호성을 풀지 못한다**
 *   (실측: `SelectQueryError<"...you need to hint the column with player!<columnName>">`).
 *   `MATCH_SELECT`의 홈/원정 팀이 같은 이유로 같은 형태를 쓴다.
 */
export const EVENT_SELECT =
  `id, side, kind, minute, extra_minute, player_id, related_player_id, detail, actor:player!player_id(name), related:player!related_player_id(name)` as const;

/** `EVENT_SELECT`가 돌려주는 행 */
export interface MatchEventSelectRow {
  id: MatchEventRow["id"];
  side: MatchEvent["side"];
  kind: MatchEvent["kind"];
  minute: MatchEventRow["minute"];
  extra_minute: MatchEventRow["extra_minute"];
  player_id: MatchEventRow["player_id"];
  related_player_id: MatchEventRow["related_player_id"];
  detail: MatchEventRow["detail"];
  actor: { name: string } | null;
  related: { name: string } | null;
}

export function buildMatchEvent(row: MatchEventSelectRow): MatchEvent {
  return {
    id: row.id,
    side: row.side,
    kind: row.kind,
    minute: row.minute,
    extraMinute: row.extra_minute,
    playerId: row.player_id,
    playerName: row.actor?.name ?? null,
    relatedPlayerId: row.related_player_id,
    relatedPlayerName: row.related?.name ?? null,
    detail: row.detail,
  };
}

/**
 * 팀 스탯 select.
 * ⚠ 임베딩이 없어 별칭도 필요 없다 — `match_stat`은 `match`만 참조한다.
 */
export const STAT_SELECT = `side, stat_key, value` as const;

export interface MatchStatSelectRow {
  side: MatchStat["side"];
  stat_key: MatchStatRow["stat_key"];
  value: MatchStatRow["value"];
}

export function buildMatchStat(row: MatchStatSelectRow): MatchStat {
  return { side: row.side, statKey: row.stat_key, value: row.value };
}

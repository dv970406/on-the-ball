import type { Match, MatchPick, MatchPredictionResult, MatchRow, Team, TeamRow } from "../model/types";

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

/** `match_prediction_results` RPC의 행 → 도메인 */
export function buildMatchPredictionResult(row: {
  pick: MatchPick;
  vote_count: number;
}): MatchPredictionResult {
  return { pick: row.pick, voteCount: row.vote_count };
}

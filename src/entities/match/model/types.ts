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

import { fromKstInputValue } from "@/shared/lib";
import type { AdminMatchInput } from "../model/use-admin-match-mutations";


/**
 * 폼 초안 — 입력창이 다루는 값은 전부 문자열이다.
 *
 * ⚠ **zod를 쓰지 않는다.** 실측 70KB(gzip)가 작성 라우트에 실렸다는 이유가 그대로 적용된다
 *   (`validatePost`·`validatePoll`·`validateNickname`이 전부 같은 형태의 손수 함수다).
 */
export interface MatchDraft {
  season: string;
  matchday: string;
  homeTeam: string;
  awayTeam: string;
  /** `datetime-local` 값(KST 기준) */
  kickoffAt: string;
  homeScore: string;
  awayScore: string;
  voided: boolean;
}

export type MatchFieldErrors = Partial<Record<keyof MatchDraft | "form", string>>;

/** DB CHECK와 **같은 형태**를 본다 — 어긋나면 사용자가 영어 23514를 본다 */
const SEASON_RE = /^[0-9]{4}-[0-9]{2}$/;

export function validateMatch(
  draft: MatchDraft,
): { ok: true; value: AdminMatchInput } | { ok: false; errors: MatchFieldErrors } {
  const errors: MatchFieldErrors = {};

  const season = draft.season.trim();
  if (!SEASON_RE.test(season)) errors.season = "시즌은 2025-26 형태로 적어 주세요.";

  const matchday = Number(draft.matchday);
  if (!Number.isInteger(matchday) || matchday < 1 || matchday > 38) {
    errors.matchday = "라운드는 1에서 38 사이의 정수예요.";
  }

  if (!draft.homeTeam) errors.homeTeam = "홈 팀을 골라 주세요.";
  if (!draft.awayTeam) errors.awayTeam = "원정 팀을 골라 주세요.";
  /*
   * ⚠ **양쪽 필드에 함께 건다.** 한쪽에만 달면 방금 만진 필드가 아닌 곳에 문구가 떠서
   *   무엇을 고쳐야 하는지 읽히지 않는다(홈을 원정과 같게 바꿨는데 원정 아래에 떴다 — 실측).
   *   둘 중 어느 쪽을 바꿔도 풀리는 조건이라 "이 쌍이 문제다"가 뜻에도 맞는다.
   */
  if (draft.homeTeam && draft.homeTeam === draft.awayTeam) {
    errors.homeTeam = "같은 팀끼리 맞붙을 수 없어요.";
    errors.awayTeam = "같은 팀끼리 맞붙을 수 없어요.";
  }

  const kickoffAt = fromKstInputValue(draft.kickoffAt);
  if (kickoffAt === null) errors.kickoffAt = "킥오프 시각을 넣어 주세요.";

  const homeScore = parseScore(draft.homeScore);
  const awayScore = parseScore(draft.awayScore);
  if (homeScore === "invalid") errors.homeScore = "0 이상의 정수만 넣을 수 있어요.";
  if (awayScore === "invalid") errors.awayScore = "0 이상의 정수만 넣을 수 있어요.";
  // ⚠ DB의 `(home_score is null) = (away_score is null)` CHECK와 한 쌍이다
  if (homeScore !== "invalid" && awayScore !== "invalid" && (homeScore === null) !== (awayScore === null)) {
    errors.form = "스코어는 양쪽을 함께 넣거나 함께 비워 주세요.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      season,
      matchday,
      homeTeam: draft.homeTeam,
      awayTeam: draft.awayTeam,
      kickoffAt: kickoffAt as string,
      homeScore: homeScore as number | null,
      awayScore: awayScore as number | null,
      voided: draft.voided,
    },
  };
}

function parseScore(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) return "invalid";
  return parsed;
}

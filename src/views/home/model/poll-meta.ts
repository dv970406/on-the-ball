/**
 * PollListItem의 meta jsonb에서 홈 전용 표현값을 안전하게 읽는 헬퍼.
 * 계약 밖 값(문자열이 아닌 필드 등)은 무시하고 undefined로 둔다.
 */
import type { HeroMeta, HomeCardMeta } from "./types";

// A/B 면 판별·meta 리더는 계약 소유자인 entities/poll의 단일 구현을 사용
export { pickSides } from "@/entities/poll";

/** jsonb 하위 객체에서 문자열 필드만 골라 읽는다 */
function pickStrings<K extends string>(
  value: unknown,
  keys: readonly K[],
): Partial<Record<K, string>> {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) {
    if (typeof record[key] === "string") result[key] = record[key] as string;
  }
  return result;
}

/** polls.meta.hero — featured 폴의 홈 히어로 전용 문구 */
export function readHeroMeta(meta: Record<string, unknown>): HeroMeta {
  return pickStrings(meta.hero, ["title", "sub", "aSub", "bSub"]);
}

/** polls.meta.card — 홈 카드 전용 라벨 (없으면 빈 객체) */
export function readHomeCardMeta(meta: Record<string, unknown>): HomeCardMeta {
  return pickStrings(meta.card, ["tag", "a", "b", "title"]);
}

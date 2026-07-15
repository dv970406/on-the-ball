import type {
  KitMeta,
  PollOption,
  RankingCandidateMeta,
  TmiOptionMeta,
  TmiPollMeta,
} from "../model/types";

/**
 * kit/ranking/tmi 옵션·폴 meta jsonb의 단일 해석 지점.
 * balance의 readSideMeta(balance-side.ts)와 대칭 — 계약 밖 값(누락·타입 불일치)은
 * 기본값으로 방어해 raw 캐스팅(`as unknown as X`)의 런타임 undefined 유입을 막는다.
 */

/** 유니폼 옵션 meta */
export function readKitMeta(option: PollOption): KitMeta {
  const meta = option.meta as Partial<KitMeta>;
  const stripe = meta.stripe;
  return {
    tone: typeof meta.tone === "string" ? meta.tone : "#dfdfdf",
    stripe:
      stripe === "sash" || stripe === "h" || stripe === "v" ? stripe : null,
    dark: meta.dark === true,
  };
}

/** 랭킹 후보 옵션 meta */
export function readRankingMeta(option: PollOption): RankingCandidateMeta {
  const meta = option.meta as Partial<RankingCandidateMeta>;
  return {
    flag: typeof meta.flag === "string" ? meta.flag : "",
    hue: typeof meta.hue === "number" ? meta.hue : 0,
  };
}

/** TMI 선택지 옵션 meta — verdict가 "true"가 아니면 "false"로 정규화 */
export function readTmiOptionMeta(option: PollOption): TmiOptionMeta {
  const meta = option.meta as Partial<TmiOptionMeta>;
  return { verdict: meta.verdict === "true" ? "true" : "false" };
}

/** TMI 폴 meta (카드 본문) */
export function readTmiPollMeta(source: { meta: Record<string, unknown> }): TmiPollMeta {
  const meta = source.meta as Partial<TmiPollMeta>;
  return {
    player: typeof meta.player === "string" ? meta.player : "",
    club: typeof meta.club === "string" ? meta.club : "",
    flag: typeof meta.flag === "string" ? meta.flag : "",
    detail: typeof meta.detail === "string" ? meta.detail : "",
  };
}

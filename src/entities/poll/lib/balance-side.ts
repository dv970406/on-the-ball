import { COLOR } from "@/shared/config";
import type { BalanceSideMeta, PollOption } from "../model/types";

/**
 * 밸런스 옵션 meta(BalanceSideMeta 계약)의 단일 해석 지점.
 * 홈 히어로·캐러셀, 밸런스 리스트/디테일, SplitCard가 모두 이 구현을 공유한다 —
 * side 판별 규칙이나 기본색을 바꿀 땐 여기 한 곳만 수정하면 된다.
 */

/** meta jsonb를 BalanceSideMeta 계약으로 안전하게 읽는다 — 계약 밖 값은 기본값으로 */
export function readSideMeta(option: PollOption): BalanceSideMeta {
  const meta = option.meta as Partial<BalanceSideMeta>;
  return {
    side: meta.side === "b" ? "b" : "a",
    metaLine: typeof meta.metaLine === "string" ? meta.metaLine : "",
    tone: typeof meta.tone === "string" ? meta.tone : COLOR.ink,
    text: typeof meta.text === "string" ? meta.text : "#fff",
    accent: typeof meta.accent === "string" ? meta.accent : null,
    stats: Array.isArray(meta.stats) ? meta.stats : [],
    blurb: typeof meta.blurb === "string" ? meta.blurb : "",
  };
}

/** options에서 meta.side 기준으로 A/B 옵션을 찾는다 (없으면 position 순 폴백) */
export function pickSides(
  options: PollOption[],
): { a: PollOption; b: PollOption } | null {
  if (options.length < 2) return null;
  const bySide = (side: "a" | "b") =>
    options.find((o) => (o.meta as Partial<BalanceSideMeta>).side === side);
  return {
    a: bySide("a") ?? options[0],
    b: bySide("b") ?? options[1],
  };
}

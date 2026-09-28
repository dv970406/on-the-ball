import { credibilityOf } from "./credibility";
import type { TransferDealListItem, TransferSort } from "../model/types";

/** 최신 보도가 이보다 오래된 루머는 "식은 루머"다 — 기본으로 접는다 */
export const RUMOR_STALE_MS = 7 * 24 * 60 * 60 * 1000;
/** 루머 구간에서 기본으로 펼쳐 보이는 건수 — 나머지는 "더 보기" 뒤에 있다 */
export const HOT_RUMORS_DEFAULT = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 최신 보도가 `RUMOR_STALE_MS`보다 오래됐는가. `nowMs`가 없으면(서버 시각 없는 첫 프레임) 식었다고 보지 않는다 */
export function isStaleRumor(deal: Pick<TransferDealListItem, "latestReportedAt">, nowMs: number | null): boolean {
  return nowMs !== null && nowMs - new Date(deal.latestReportedAt).getTime() > RUMOR_STALE_MS;
}

/**
 * 루머의 열기 — 보도 수 · 최신 보도 출처의 공신력 · 최근성을 더한 점수. 클수록 위에 펼친다.
 * 가십 칼럼의 한 줄에서 나온 보도 1건짜리(대부분)는 낮고, 여러 매체가 이어 쓰거나 🎖️·🌕 출처가 쓴 루머가 높다.
 * ⚠ `nowMs`를 인자로 받는다(`pickRecentRumors`와 같은 이유) — 렌더 중 시계를 읽지 않는다.
 */
export function rumorHeat(
  deal: Pick<TransferDealListItem, "reportCount" | "latestReport" | "latestReportedAt">,
  nowMs: number | null,
): number {
  let heat = Math.min(deal.reportCount, 5) * 2;
  const c = deal.latestReport === null ? null : credibilityOf(deal.latestReport);
  if (c !== null) heat += c.kind === "medal" ? 3 : c.level >= 4 ? 2 : c.level === 3 ? 1 : 0;
  if (nowMs !== null) {
    const age = nowMs - new Date(deal.latestReportedAt).getTime();
    heat += age <= DAY_MS ? 3 : age <= 3 * DAY_MS ? 2 : age <= RUMOR_STALE_MS ? 1 : 0;
  }
  return heat;
}

/**
 * 루머 구간을 **펼칠 것**과 **접을 것**으로 가른다.
 *
 * - 식은 루머(`isStaleRumor`)는 점수와 무관하게 접는다 — 창이 석 달이라 이 규칙 하나가 목록의 절반 이상을 걷어낸다.
 * - 나머지 중 열기 상위 `top`건을 펼친다. 정렬이 최신순이면 펼친 것은 열기 순으로 놓고, 이적료순이면 사용자가 고른
 *   순서를 그대로 둔다(정렬은 사용자의 뜻이고 열기는 선별 기준이다).
 * - 접힌 것은 들어온 순서(사용자 정렬) 그대로다.
 *
 * 접힌 행도 HTML에는 남긴다(`hidden`) — 색인 화면의 본문 SSR·구간 점프·스크롤 복원이 그대로다(`nextjs.md`의 탭 규약과 같다).
 */
export function splitHotRumors<T extends Pick<TransferDealListItem, "reportCount" | "latestReport" | "latestReportedAt">>(
  deals: readonly T[],
  nowMs: number | null,
  sort: TransferSort,
  top: number = HOT_RUMORS_DEFAULT,
): { hot: T[]; rest: T[] } {
  const fresh = deals.filter((d) => !isStaleRumor(d, nowMs));
  const ranked = fresh
    .map((deal, index) => ({ deal, index, heat: rumorHeat(deal, nowMs) }))
    .sort((a, b) => b.heat - a.heat || a.index - b.index);
  const chosen = ranked.slice(0, top);
  const hotSet = new Set(chosen.map((x) => x.deal));
  const hot = sort === "latest" ? chosen.map((x) => x.deal) : deals.filter((d) => hotSet.has(d));
  const rest = deals.filter((d) => !hotSet.has(d));
  return { hot, rest };
}

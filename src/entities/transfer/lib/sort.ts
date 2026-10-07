import type { ReportSort, TransferDeal, TransferGroupKey, TransferReport, TransferSort } from "../model/types";
import { credibilityOf, credibilityRank } from "./credibility";
import { GROUP_LABEL, GROUP_ORDER, STAGE_GROUP } from "./stage";

/**
 * 보드 정렬 — **안정 정렬**이다(`Array.prototype.sort`는 ES2019부터 안정). 같은 값끼리는
 * 서버가 준 순서(최신 보도순)를 유지한다.
 * - `latest`: `latestReportedAt` 내림차순
 * - `fee`: `feeAmount` 내림차순, 이적료 없는 딜은 **뒤**(값이 없는 것을 0으로 세지 않는다)
 * ⚠ 통화가 섞여도 금액만 비교한다 — 환율을 하드코딩하지 않는다("틀린 칸보다 빈 칸").
 *   같은 창의 딜은 대부분 €라 실사용에서 어긋나는 일이 드물고, 어긋나도 순서일 뿐이다.
 * ⚠ 원본 배열을 바꾸지 않는다 — 쿼리 캐시의 배열이 그대로 들어온다.
 */
export function sortDeals<T extends Pick<TransferDeal, "latestReportedAt" | "feeAmount">>(
  deals: readonly T[],
  sort: TransferSort,
): T[] {
  const sorted = deals.slice();
  if (sort === "fee") {
    sorted.sort((a, b) => {
      if (a.feeAmount === null) return b.feeAmount === null ? 0 : 1;
      if (b.feeAmount === null) return -1;
      return b.feeAmount - a.feeAmount;
    });
  } else {
    sorted.sort((a, b) => b.latestReportedAt.localeCompare(a.latestReportedAt));
  }
  return sorted;
}

export interface TransferGroup<T> {
  key: TransferGroupKey;
  label: string;
  deals: T[];
}

/**
 * 정렬된 딜을 구간으로 나눈다 — 구간 순서는 `GROUP_ORDER`로 고정, **빈 구간은 뺀다**
 * (빈 구간은 렌더하지 않는다). 구간 안의 순서는 입력 순서 그대로다 →
 * `sortDeals` **뒤에** 부른다.
 * ⚠ 구간 점프 칩은 빈 구간도 그린다(0건 disabled) — 그쪽은 `GROUP_ORDER`·`GROUP_LABEL`을 직접 돈다.
 */
export function groupDeals<T extends Pick<TransferDeal, "stage">>(
  deals: readonly T[],
): TransferGroup<T>[] {
  const buckets = new Map<TransferGroupKey, T[]>(GROUP_ORDER.map((key) => [key, []]));
  for (const deal of deals) {
    const key = STAGE_GROUP[deal.stage];
    // `unknown`은 딜에 들어오지 않지만(DB CHECK) 타입상 null이라 여기서 거른다
    if (key !== null) buckets.get(key)?.push(deal);
  }
  return GROUP_ORDER.filter((key) => (buckets.get(key)?.length ?? 0) > 0).map((key) => ({
    key,
    label: GROUP_LABEL[key],
    deals: buckets.get(key) ?? [],
  }));
}

/**
 * 보도 타임라인 정렬 — `credibility`는 공신력 높은 순(🎖️ > 🌕 … 🌑 > 등재되지 않은 출처), 같은 등급끼리는 최신순.
 * `latest`는 게시 시각 최신순이다.
 * ⚠ 시계를 읽지 않는 순수 계산이라 서버 HTML과 하이드레이션의 순서가 같다 — 등급도 같은 JSON(`reporters.json`)에서 온다.
 * ⚠ 원본 배열을 바꾸지 않는다 — 쿼리 캐시의 배열이 그대로 들어온다.
 */
export function sortReports<
  T extends Pick<TransferReport, "sourceId" | "attribution" | "attributedTo" | "publishedAt">,
>(reports: readonly T[], sort: ReportSort): T[] {
  // 시각으로 비교한다 — 문자열 비교는 같은 초 안의 "06+00:00"·"06.45+00:00"(소수 초를 생략한 표기)를 로케일 정렬 규칙에 따라 뒤집는다
  const latestFirst = (a: T, b: T) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  if (sort === "latest") return reports.slice().sort(latestFirst);
  const rank = new Map(reports.map((r) => [r, credibilityRank(credibilityOf(r))]));
  return reports.slice().sort((a, b) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0) || latestFirst(a, b));
}

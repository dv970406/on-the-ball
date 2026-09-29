import { RUMOR_CAROUSEL_WINDOW_MS } from "../api/mappers";
import { credibilityOf, isTopCredibility } from "./credibility";
import type { TransferDealListItem } from "../model/types";

/**
 * "최근 3일 소식" 캐러셀에 실을 딜 — 최신 보도가 **믿을 만한 출처**(🎖️ 매체 · 🌕🌖 기자 — `isTopCredibility`)이고
 * **3일 이내**인 것,
 * 보도 시각 내림차순.
 *
 * ⚠ 딜당 1건은 목록 select의 `latest` 임베딩(`limit 1`)이 이미 보장한다 — 여기서 다시 중복
 *   제거하지 않는다. 다만 최신 보도의 출처 등급이 낮으면 그 딜은 빠진다(그 앞의 믿을 만한 보도는 목록에
 *   실리지 않으므로). "3일 안의 믿을 만한 보도가 하나라도 있으면"으로 넓히려면 딜마다 보도
 *   전체를 실어야 한다 — 목록 응답을 그만큼 부풀릴 가치가 없다(의도한 트레이드오프).
 * ⚠ 결렬 딜도 포함한다 — 결렬도 3일 내 믿을 만한 소식이다.
 * ⚠ 화면의 출처 뱃지(`CredibilityBadge`)와 **같은 등급**으로 고른다 — 표시와 채택 기준이 둘로 갈리지 않는다.
 * ⚠ **`nowMs`를 인자로 받는다**(`formatRelativeTime`·`openTransferWindow`와 같은 형태·같은 이유). 서버 시각이 있으면 그 값을
 *   넘긴다 — 렌더 중 시계를 읽으면 서버·클라 출력이 갈린다.
 */
export function pickRecentRumors(
  deals: readonly TransferDealListItem[],
  nowMs: number,
): TransferDealListItem[] {
  const since = nowMs - RUMOR_CAROUSEL_WINDOW_MS;
  return deals
    .filter((deal) => {
      const report = deal.latestReport;
      return (
        report !== null &&
        isTopCredibility(credibilityOf(report)) &&
        new Date(report.publishedAt).getTime() >= since
      );
    })
    .sort((a, b) =>
      // 위 filter가 `latestReport !== null`을 보장한다 — 타입이 좁혀지지 않아 `?.`로 받는다
      (b.latestReport?.publishedAt ?? "").localeCompare(a.latestReport?.publishedAt ?? ""),
    );
}

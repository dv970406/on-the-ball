import type { ReactNode } from "react";
import { ContractTerms, SuitorList, type TransferDeal } from "@/entities/transfer";
import { WIDE_CARD } from "./detail-card";

interface DetailAsideProps {
  deal: TransferDeal;
  watchToggle: ReactNode;
  /** 알림 안내·공유 담기 안내 — 뜨는 동안 기본 문구를 대신한다(같은 약속을 두 번 하지 않는다). 없으면 `null` */
  note: ReactNode;
  predictionCard: ReactNode;
}

/**
 * 곁 칸 — 넓은 화면의 오른쪽 360px. 좁은 화면에서는 통째로 걷힌다(`hidden` — 랜드마크도 접근성 트리에서 빠진다).
 *
 * ⚠ sticky에 **높이 상한과 내부 스크롤**을 함께 건다(`max-h-[100cqh]` + `overflow-y-auto`). 곁 칸의 높이는 관심 구단 수에 따라 1,000px를 넘기도 해서,
 *   상한 없이 고정하면 화면보다 긴 아래 카드(성사 예측)가 화면 밖에 붙은 채 본문을 끝까지 내려야 보인다. "세로가 넉넉할 때만 고정" 같은 고정 높이 판정은
 *   곁 칸 높이를 모르므로 반드시 어긋난다. 관심 담기 카드만 고정하는 형태도 따져 봤지만, sticky는 부모(곁 칸) 안에서만 붙어 곁 칸이 본문보다 짧으면
 *   곧 풀린다 — 곁 칸 전체를 고정해 두고 넘치는 만큼만 그 안에서 스크롤하는 편이 어떤 세로 높이에서도 모든 카드에 닿는다.
 * ⚠ 상한은 **스크롤 영역(`<main>`)의 높이**다(`100cqh` — `<main>`이 넓은 화면에서 크기 컨테이너다). 상단 바 높이를 calc로 옮겨 적지 않는다 — 바 높이가
 *   바뀌어도 따라온다. `cqh`는 `<main>`의 아래 여백(`pb-12`, 48px)을 뺀 내용 상자를 재므로 위 `top-6`(24px)과 합쳐 아래에도 24px이 남는다.
 * ⚠ **스크롤바는 칸 밖(오른쪽 여백)에 둔다** — 자리를 차지하는 스크롤바(Windows·"스크롤 막대 항상 보기")가 그 폭만큼 카드를 좁혀 카드 오른쪽 끝이 히어로와
 *   어긋났다. 곁 칸 상자를 내용 폭(`w-max` = 안쪽 360px + 막대 자리)으로 두고 막대 자리를 늘 비워 두면(`scrollbar-gutter: stable`) 카드는 360px 열에 그대로
 *   서고 막대만 열 오른쪽으로 비어져 나간다. 막대 폭은 브라우저·설정마다 달라(0·11·15px) 음수 여백으로 옮겨 적지 않는다. 비어져 나가는 자리는 `<main>`의
 *   좌우 여백(`lg:px-8`) 안이다 — 그 여백을 막대 폭보다 좁히지 않는다.
 * ⚠ 안내 문구는 지금 상태의 말이어야 한다. "담으면 알려 드려요"라고 단정하지 않는다 — 알림은 그 기기에서 알림을 켜 둔 사람에게만 간다(`nextjs.md` 웹 푸시 절).
 *   알림 상태를 이 문구 하나 때문에 조회하지 않는다 — 조회는 안내를 낼 때만 연다(`usePushNudge`).
 */
export function DetailAside({ deal, watchToggle, note, predictionCard }: DetailAsideProps) {
  return (
    <aside
      aria-label="관심·계약·예측"
      className="hidden lg:sticky lg:top-6 lg:col-start-2 lg:row-start-2 lg:block lg:max-h-[100cqh] lg:w-max lg:overflow-y-auto lg:[scrollbar-gutter:stable]"
    >
      <div className="flex w-[360px] flex-col gap-4">
        <section aria-label="관심 목록" className={WIDE_CARD}>
          {watchToggle}
          {note ?? (
            <p className="mt-2.5 text-center text-[12px] text-ink-mute">
              {deal.isWatched
                ? "알림을 켜 둔 기기로 상태가 바뀔 때 알려 드려요"
                : "담아 두고 알림을 켜면 상태가 바뀔 때 알려 드려요"}
            </p>
          )}
        </section>
        <section aria-labelledby="detail-terms-heading" className={WIDE_CARD}>
          <h2 id="detail-terms-heading" className="section-title">
            계약 조건
          </h2>
          <ContractTerms deal={deal} className="mt-1.5" />
        </section>
        <section aria-labelledby="detail-suitors-heading" className={WIDE_CARD}>
          <div className="flex items-baseline justify-between">
            <h2 id="detail-suitors-heading" className="section-title">
              관심 구단
            </h2>
            <span className="text-[11px] text-ink-mute-2">유력한 순</span>
          </div>
          <SuitorList deal={deal} className="mt-1.5" />
        </section>
        {predictionCard}
      </div>
    </aside>
  );
}

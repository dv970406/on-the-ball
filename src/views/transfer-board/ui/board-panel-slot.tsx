"use client";

import type { TransferDealListItem } from "@/entities/transfer";
import { RETURN_PATH_ATTR } from "@/shared/lib";
import { EmptyState } from "@/shared/ui";
import { DealPanel } from "@/widgets/deal-panel";
import { keepBoardEntryOnSameUrlLink } from "../model/use-board-filters";

interface BoardPanelSlotProps {
  deal: TransferDealListItem | null;
  /** 상단 바 "로그인"이 돌아올 주소(`useBoardSignIn`) — 판에 딜이 열려 있는 동안만 값이 있다 */
  returnPath: string | undefined;
  userId: string | undefined;
  nowMs: number | null;
  /** 2분할이 실제로 섰는가 — 판 안의 조회를 여는 조건이다 */
  active: boolean;
  onSignInRequired: (action: string) => void;
}

/**
 * 오른쪽 판의 자리 — **늘 그린다**(lg 미만은 CSS로 상자째 가린다). 판의 머리(뱃지·이름·경로·이적료)는 목록 데이터만으로
 * 서버 HTML에 실린다 — 넓은 화면의 LCP가 판 제목이라, 하이드레이션 뒤에 마운트하면 첫 페인트가 그만큼 늦다.
 * 판 안의 조회(보도·예측)는 2분할이 실제로 섰을 때만 연다(`active`) — 모바일에서 가려진 판이 조회를 내지 않게.
 *
 * ⚠ 판 안의 스크롤바를 숨기지 않는다 — 판 본문은 화면보다 길어(1440×900에서 본문 1203px · 보이는 높이 767px) 막대가 없으면 마우스 사용자가 더 내려갈
 *   내용이 있다는 신호를 받지 못한다. 페이지(`main`) 막대와 오른쪽 끝에 나란히 서지만 판의 왼쪽 경계선이 두 스크롤 영역을 가른다.
 * ⚠ 판의 상세 링크가 지금 주소와 같을 때 보드 기록을 남긴다(`keepBoardEntryOnSameUrlLink`) — 링크의 이동보다 먼저(캡처).
 */
export function BoardPanelSlot({ deal, returnPath, userId, nowMs, active, onSignInRequired }: BoardPanelSlotProps) {
  return (
    <div
      {...{ [RETURN_PATH_ATTR]: returnPath }}
      onClickCapture={keepBoardEntryOnSameUrlLink}
      className="hidden border-l border-hairline-cool lg:sticky lg:top-0 lg:block lg:h-[calc(100dvh-56px-env(safe-area-inset-top))] lg:self-start"
    >
      {deal ? (
        <DealPanel key={deal.id} deal={deal} userId={userId} nowMs={nowMs} active={active} onSignInRequired={onSignInRequired} />
      ) : (
        // 고를 딜이 없다(필터 결과 0건) — 빈 판 대신 이유를 한 줄로
        <EmptyState title="열어 볼 딜이 없어요" description="조건을 바꾸면 목록의 딜이 여기에 열려요." className="h-full" />
      )}
    </div>
  );
}

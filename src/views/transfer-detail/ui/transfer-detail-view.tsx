"use client";

import { type ReactNode, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  StatusBadge,
  type TransferDeal,
  type TransferReport,
  TransferCrest,
} from "@/entities/transfer";
import { WatchToggle } from "@/features/watch-transfer";
import { ROUTES } from "@/shared/config";
import { cn, formatRelativeTime, useNowMs } from "@/shared/lib";
import { EmptyState, Icon, SignInDialog, Skeleton, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { flagEmoji } from "../lib/flag";
import { useTransferDetail } from "../model/use-transfer-detail";
import { FeeCard } from "./fee-card";
import { ReportTimeline } from "./report-timeline";

interface TransferDetailViewProps {
  dealId: number;
  /**
   * 서버가 미리 조회한 딜. **색인 대상이라 초기 HTML에 선수·경로·이적료가 담기게 하는 장치다.**
   * ⚠ 서버 조회가 실패하면 `undefined`가 오고 화면은 클라이언트 쿼리로 폴백한다.
   * ⚠ `null`은 "없는 딜"이다 — 서버가 이미 404를 내므로 실제로는 오지 않지만 훅의 계약을 그대로 둔다.
   */
  initialDeal?: TransferDeal | null;
  /** 서버가 미리 조회한 보도 타임라인(최신순) */
  initialReports?: TransferReport[];
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ **이게 없으면 프리페치가 무의미해진다** — `transferKeys.detail`이 userId로 스코프돼 있어
   *   복원 전 `undefined` 키로 찾으면 서버가 채운 캐시에 닿지 못한다(`MatchDetailView`와 같은 함정).
   */
  initialUserId?: string;
  /**
   * 서버가 렌더한 시점의 시각.
   * ⚠ 없으면 "업데이트 2시간 전"이 첫 렌더에 절대시각으로 나왔다가 마운트 직후 바뀌어 글자 폭이
   *   달라진다(시프트). 서버 시각으로 첫 렌더부터 상대시각을 그린다.
   */
  serverNowMs?: number;
}

/** 방향을 못 읽은 구단의 표기 — 경로 카드에서는 이름 자리를 `—`로 비운다 */
const UNKNOWN_CLUB = "—";

/** 경로 카드의 한 칸 — `FROM`/`TO` 라벨 · 엠블럼 24 + 정식명 · 리그 */
function RouteCell({
  label,
  club,
  className,
}: {
  label: string;
  // ⚠ `TransferClub`은 배럴에 없다(슬라이스 밖 소비자가 없어 올리지 않았다) — 딜의 필드 타입으로 받는다
  club: TransferDeal["fromClub"];
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 p-[12px_14px]", className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2">
        {label}
      </span>
      <div className="mt-2 flex items-center gap-2 text-[14px] font-medium leading-[1.3] tracking-[-0.3px] text-ink">
        <TransferCrest club={club} size={24} className="shrink-0" />
        {/* 경로 카드만 정식명이다 — 목록 행·칩은 약칭(`TransferClub` 주석) */}
        <span className="truncate">{club?.name ?? UNKNOWN_CLUB}</span>
      </div>
      {/* 5대 리그 밖은 `null`이라 줄을 비운다 — 모르는 리그명을 지어내지 않는다 */}
      {club?.league && <div className="mt-1 text-[11px] text-ink-mute">{club.league}</div>}
    </div>
  );
}

/**
 * 정보줄(handoff §5-3) — `DAVID ALABA · CB/LB · 1992년생 · 🇦🇹 AUT`.
 *
 * **있는 항목만** ` · `로 잇는다("틀린 칸보다 빈 칸"). 영문 대문자 이름은 **h1이 한국어일 때만**
 * 싣는다 — 한국어 표기가 없어 h1이 이미 영문이면 같은 이름을 두 번 적게 된다. 그래서 이름 외에
 * 아무것도 없고 h1도 영문이면 이 줄 자체를 그리지 않는다.
 */
function InfoLine({ deal }: { deal: TransferDeal }) {
  const flag = deal.nationality === null ? null : flagEmoji(deal.nationality);
  const items: ReactNode[] = [];
  if (deal.playerKo !== null) items.push(deal.player.toUpperCase());
  if (deal.position !== null) items.push(deal.position);
  if (deal.birthYear !== null) items.push(`${deal.birthYear}년생`);
  if (deal.nationality !== null) {
    items.push(
      <>
        {flag !== null && (
          // 이모지 폰트 스택을 명시한다 — mono 폰트가 국기 코드포인트를 갖지 않아 폴백이 기기마다 갈린다
          <span
            aria-hidden
            className="mr-1 align-[-1px] font-['Apple_Color_Emoji','Segoe_UI_Emoji','Noto_Color_Emoji',sans-serif] text-[13px] tracking-normal"
          >
            {flag}
          </span>
        )}
        {deal.nationality}
      </>,
    );
  }
  if (items.length === 0) return null;

  return (
    <p className="mt-1.5 font-mono text-[11px] tracking-[0.2px] tabular-nums text-ink-mute">
      {items.map((item, i) => (
        // 항목 수가 넷 이하의 고정 순서라 인덱스 키가 안정적이다
        <span key={i}>
          {i > 0 && " · "}
          {item}
        </span>
      ))}
    </p>
  );
}

/**
 * 이적 상세 — 선수 · 경로 · 이적료 · 보도 타임라인 + 관심 토글.
 *
 * 하단 탭바를 렌더하지 않는다(글·경기 상세와 같은 서브헤더 화면이다). 공유는 `SubHeader`가 갖는다.
 * 확률 카드·알림 CTA·원화 환산은 두지 않는다(계획서 §0·§0-1).
 */
export function TransferDetailView({
  dealId,
  initialDeal,
  initialReports,
  initialUserId,
  serverNowMs,
}: TransferDetailViewProps) {
  // 조회·대기 판정은 `model/use-transfer-detail`이 소유한다
  const { deal, reports, reportsError, isLoading, error, refetch } = useTransferDetail({
    dealId,
    initialDeal,
    initialReports,
    initialUserId,
  });
  /**
   * 비로그인이 관심 토글을 눌렀을 때의 안내 — **뷰가 소유한다**(`Dialog`가 `absolute`라
   * 하단 바 안에 두면 그 바를 기준으로 뜬다 — `SignInDialog` 주석).
   */
  const [askSignIn, setAskSignIn] = useState(false);
  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 세션당 한 번 고정된다(`data-and-state.md`).
  //   ⚠ `??`는 단축평가라 훅을 뒤에 두면 조건부 호출이 된다 → 먼저 무조건 부른다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs;

  return (
    <>
      <SubHeader title="이적 상세" fallbackHref={ROUTES.transferList} />

      {/*
        ⚠ **스크롤 영역이 여기 있어야 한다** — 루트 프레임이 `h-dvh … overflow-hidden`이라 `<main>`이
          스스로 스크롤하지 않으면 넘친 내용에 닿을 방법이 없다(경기 상세와 같은 주석).
        ⚠ `pt-*`를 두지 않는다 — 위쪽 여백은 각 분기의 첫 요소가 진다(`views/match-detail` 주석).
        ⚠ 아래 `pb`는 하단 고정 바(관심 토글) 높이 + safe-area다 — 본문이 바에 가려지지 않게.
      */}
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {isLoading && (
          <div aria-hidden className="pt-4">
            {/* 골격은 실제 화면과 같다 — 뱃지 줄 · 이름 · 정보줄 · 경로 카드 · 이적료 카드 · 타임라인 */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="mt-3 h-8 w-3/5" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-3 h-[88px] w-full rounded-lg" />
            <Skeleton className="mt-3 h-[196px] w-full rounded-lg" />
            <Skeleton className="mt-[22px] h-4 w-24" />
            <Skeleton className="mt-3 h-16 w-full" />
          </div>
        )}

        {/* ⚠ 에러 화면은 **보여줄 데이터가 없을 때만** 띄운다(`data-and-state.md`) */}
        {error && !deal && (
          <EmptyState
            className="pt-4"
            title="이적 소식을 불러오지 못했어요"
            description={error.message}
            onRetry={() => refetch()}
          />
        )}
        {error && deal && (
          <div className="pt-4">
            <StaleBanner noun="이적 소식" onRetry={() => refetch()} />
          </div>
        )}

        {deal === null && (
          <EmptyState
            className="pt-4"
            title="이적 건을 찾을 수 없어요"
            description="삭제되었거나 없는 이적 건이에요."
          />
        )}

        {deal && (
          <article className={error ? undefined : "pt-4"}>
            <header>
              <div className="flex items-center gap-2">
                <StatusBadge stage={deal.stage} />
                {/* nowrap + flex-none — 뱃지가 길어져도 시각이 줄 바꿈되지 않는다(handoff §5-1) */}
                <span className="ml-auto flex-none whitespace-nowrap font-mono text-[11px] tabular-nums text-ink-mute-2">
                  업데이트{" "}
                  <time dateTime={deal.latestReportedAt}>
                    {formatRelativeTime(deal.latestReportedAt, nowMs)}
                  </time>
                </span>
              </div>

              {/* 한국어 표기는 운영 사전에 있을 때만 — 없으면 영문명이 곧 제목이다 */}
              <h1 className="mt-3 text-pretty text-[28px] font-medium leading-[1.15] tracking-[-1px] text-ink">
                {deal.playerKo ?? deal.player}
              </h1>
              <InfoLine deal={deal} />
            </header>

            {/* 경로 카드(handoff §5-4) — 3열 `1fr 32px 1fr`, To 칸만 canvas-soft, 가운데 칸 좌우 헤어라인 */}
            <section
              aria-label="이적 경로"
              className="mt-3 grid grid-cols-[1fr_32px_1fr] overflow-hidden rounded-lg border border-hairline"
            >
              <RouteCell label="FROM" club={deal.fromClub} />
              <div
                aria-hidden
                className="flex items-center justify-center border-x border-hairline text-ink"
              >
                <Icon as={ArrowRight} size={16} />
              </div>
              <RouteCell label="TO" club={deal.toClub} className="bg-canvas-soft" />
            </section>

            <FeeCard deal={deal} />

            <ReportTimeline
              reports={reports}
              error={reportsError}
              onRetry={() => refetch()}
              nowMs={nowMs}
            />
          </article>
        )}
      </main>

      {/*
        하단 고정 바 — `<main>`의 형제(글 상세의 댓글 바 자리와 같은 형태). z-60은 핸드오프의 스케일
        (서브헤더 20 < 하단바 60~70 < 오버레이 80). 이 화면의 CTA는 관심 토글 하나뿐이고 에메랄드
        (활성 시 `primary`)는 `buttonClassName`이 갖는다 — 이 슬라이스에서 새로 칠하지 않는다.
        ⚠ 딜이 그려졌을 때만 둔다 — 로딩·에러·없음 화면에 눌러도 대상이 없는 버튼을 남기지 않는다.
      */}
      {deal && (
        <footer className="absolute inset-x-0 bottom-0 z-[60] border-t border-hairline-cool bg-canvas px-4 pb-[max(30px,env(safe-area-inset-bottom))] pt-2.5">
          <WatchToggle
            dealId={deal.id}
            watched={deal.isWatched}
            onSignInRequired={() => setAskSignIn(true)}
          />
        </footer>
      )}

      {/*
        로그인 안내 — 프레임 직속 자리에 한 벌. `<main>`·하단 바 밖이라야 `absolute` 기준이
        프레임이 된다(`SignInDialog` 주석). 로그인 뒤 이 상세로 돌아온다.
      */}
      <SignInDialog
        open={askSignIn}
        onClose={() => setAskSignIn(false)}
        action="관심 목록에 담으려면"
        next={ROUTES.transfer(dealId)}
      />
    </>
  );
}

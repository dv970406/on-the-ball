"use client";

import { type ReactNode, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  StatusBadge,
  type TransferDeal,
  type TransferReport,
  TransferCrest,
  routeLabels,
  destinationClubs,
  playerName,
} from "@/entities/transfer";
import { WatchToggle } from "@/features/watch-transfer";
import { ROUTES } from "@/shared/config";
import type { CommentList } from "@/entities/comment";
import { cn, formatCount, formatRelativeTime, useNowMs } from "@/shared/lib";
import { Dialog, EmptyState, Icon, SignInDialog, Skeleton, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { flagEmoji } from "../lib/flag";
import { useCommentDeletion } from "../model/use-comment-deletion";
import { useTransferDetail } from "../model/use-transfer-detail";
import { CommentSection } from "./comment-section";
import { DetailTabs, detailPanelId, detailTabId, type DetailTabKey } from "./detail-tabs";
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
   * 서버가 미리 조회한 댓글. ⚠ 키가 userId로 스코프된다(내 표 임베딩) — `initialUserId`와 한 쌍이다.
   *   `undefined`면 클라이언트가 조회한다.
   */
  initialComments?: CommentList;
  /**
   * 서버가 본 로그인 사용자.
   * ⚠ **이게 없으면 프리페치가 무의미해진다** — `transferKeys.detail`이 userId로 스코프돼 있어
   *   복원 전 `undefined` 키로 찾으면 서버가 채운 캐시에 닿지 못한다(`transferKeys.list`도 같다).
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

/** 경로 카드의 한 칸 — `FROM`/`TO` 라벨 · 엠블럼 24 + 정식명 · 리그 */
function RouteCell({
  label,
  club,
  text,
  clubs,
  className,
}: {
  label: string;
  // ⚠ `TransferClub`은 배럴에 없다(슬라이스 밖 소비자가 없어 올리지 않았다) — 딜의 필드 타입으로 받는다
  club: TransferDeal["fromClub"];
  /** 칸에 쓸 글자 — 구단이 없을 때의 문구(`FA`·`미확인`·`미정`)까지 `routeLabels`가 정한다. 구단이 여럿이면 쓰지 않는다(아래) */
  text: string;
  /** 행선지 칸의 구단들 — 둘 이상이면 한 줄에 하나씩 전부 적는다(여러 구단이 노리는 루머) */
  clubs?: TransferDeal["suitors"];
  className?: string;
}) {
  const listed = clubs && clubs.length > 1 ? clubs : null;
  return (
    <div className={cn("min-w-0 p-[12px_14px]", className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.5px] text-ink-mute-2">
        {label}
      </span>
      {listed ? (
        // 여러 구단이 노리는 루머 — 목록·카드는 `routeLabels`가 `외 N`으로 접지만 이 카드는 폭을 이름에 전부 내줄 수 있는
        // 유일한 자리라 **전부** 적는다. 다만 `·`로 이어 흘리면 어디서 한 구단이 끝나는지 읽기 어렵고 겹친 엠블럼이 그 덩어리
        // 가운데 떠 FROM 칸과 줄이 어긋났다 → 한 줄에 엠블럼 하나 + 이름 하나. 첫 줄이 FROM 칸의 구단 줄과 같은 높이에 놓인다.
        // ⚠ 리그 줄을 두지 않는다 — 구단마다 리그가 다를 수 있어 첫 구단의 리그만 적으면 나머지도 그 리그인 것처럼 읽힌다.
        <ul className="mt-2 flex flex-col gap-1.5">
          {listed.map((c) => (
            <li
              key={c.code}
              className="flex min-w-0 items-center gap-2 text-[14px] font-medium leading-[1.3] tracking-[-0.3px] text-ink"
            >
              <TransferCrest club={c} size={24} priority className="shrink-0" />
              {/* 정식명이 좁은 칸에서 한 줄을 넘으면 자르지 않고 두 줄로 흘린다 — 잘린 구단 이름은 어느 구단인지 알 수 없다 */}
              <span className="line-clamp-2">{c.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2 text-[14px] font-medium leading-[1.3] tracking-[-0.3px] text-ink">
            <TransferCrest club={club} size={24} priority className="shrink-0" />
            {/* 경로 카드만 정식명이다 — 목록 행·칩은 약칭(`TransferClub` 주석) */}
            <span className="truncate">{text}</span>
          </div>
          {/* 5대 리그 밖은 `null`이라 줄을 비운다 — 모르는 리그명을 지어내지 않는다 */}
          {club?.league && <div className="mt-1 text-[11px] text-ink-mute">{club.league}</div>}
        </>
      )}
    </div>
  );
}

/**
 * 정보줄 — `DAVID ALABA · CB/LB · 1992년생 · 🇦🇹 AUT`.
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
 * 이적 상세 — 선수 · 경로 · 이적료 · `댓글 | 보도 타임라인` 탭 + 관심 토글.
 *
 * 하단 탭바를 렌더하지 않는다(서브헤더 화면이다). 공유는 `SubHeader`가 갖는다.
 * 확률 카드·알림 CTA·원화 환산은 두지 않는다(확률은 보류이고, 하드코딩 환율은 거짓 숫자다).
 *
 * ⚠ **두 탭 패널을 모두 렌더하고 `hidden`으로만 가린다** — 색인 대상 화면이라 비활성 탭을 조건부
 *   렌더로 빼면 크롤러가 그 패널을 보지 못한다(`nextjs.md` "탭으로 갈라도 HTML에는 전부 남긴다").
 *   가린 패널에는 `flex`·`grid` 같은 display 유틸을 얹지 않는다(UA의 `[hidden]`을 이긴다).
 * ⚠ 오버레이(로그인 안내·삭제 확인)는 **프레임 직속 자리에 한 벌씩**이다 — `Dialog`가 `absolute`라
 *   스크롤 영역(`<main>`) 안에 두면 스크롤한 만큼 화면 밖에 뜬다.
 */
export function TransferDetailView({
  dealId,
  initialDeal,
  initialReports,
  initialComments,
  initialUserId,
  serverNowMs,
}: TransferDetailViewProps) {
  // 조회·대기 판정은 `model/use-transfer-detail`이 소유한다
  const {
    deal: { data: deal, isLoading, error },
    reports,
    comments,
    session,
    refetch,
  } = useTransferDetail({
    dealId,
    initialDeal,
    initialReports,
    initialComments,
    initialUserId,
    serverNowMs,
  });
  /** 댓글 탭 패널 — 삭제 확정·답글 대상 소실 뒤 포커스를 받는 자리(프로그램으로만) */
  const commentsPanelRef = useRef<HTMLDivElement>(null);
  /**
   * 삭제 흐름(확인 다이얼로그·답글 수 재확인·대상 소실·포커스)과 **화면에 그릴 목록**(지운 댓글을 뺀 것)은
   * 훅이 갖는다. 탭 건수·댓글 섹션이 모두 `deletion.visibleList`를 본다(같은 값에서 만든다).
   */
  const deletion = useCommentDeletion({
    dealId,
    list: comments.list,
    isPlaceholder: comments.isPlaceholder,
    userId: session.userId,
    refetch: comments.refetch,
    focusFallbackRef: commentsPanelRef,
  });
  const commentList = deletion.visibleList;
  /**
   * 비로그인이 누른 동작(`~하려면`) — 관심 토글·댓글 입력·답글·표가 **문구만 다른 한 벌**을 쓴다.
   * `null`이면 닫혀 있다. 뷰가 소유한다(`Dialog`가 `absolute`라 — `SignInDialog` 주석).
   */
  const [signInAction, setSignInAction] = useState<string | null>(null);
  /** 댓글이 기본 선택이다 */
  const [tab, setTab] = useState<DetailTabKey>("comments");
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
        ⚠ `pt-*`를 두지 않는다 — 위쪽 여백은 각 분기의 첫 요소가 진다.
        ⚠ 아래 `pb`는 하단 고정 바(관심 토글) 높이 + safe-area다 — 본문이 바에 가려지지 않게.
      */}
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {isLoading && (
          <div aria-hidden className="pt-4">
            {/* 골격은 실제 화면과 같다 — 뱃지 줄 · 이름 · 정보줄 · 경로 카드 · 이적료 카드 · 탭 · 입력칸 */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="mt-3 h-8 w-3/5" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-3 h-[88px] w-full rounded-lg" />
            <Skeleton className="mt-3 h-[196px] w-full rounded-lg" />
            <Skeleton className="mt-7 h-11 w-48" />
            <Skeleton className="mt-3.5 h-11 w-full rounded-md" />
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
                {/* nowrap + flex-none — 뱃지가 길어져도 시각이 줄 바꿈되지 않는다 */}
                <span className="ml-auto flex-none whitespace-nowrap font-mono text-[11px] tabular-nums text-ink-mute-2">
                  업데이트{" "}
                  <time dateTime={deal.latestReportedAt}>
                    {formatRelativeTime(deal.latestReportedAt, nowMs)}
                  </time>
                </span>
              </div>

              {/* 한국어 표기는 운영 사전에 있을 때만 — 없으면 영문명이 곧 제목이다 */}
              <h1 className="mt-3 text-pretty text-[28px] font-medium leading-[1.15] tracking-[-1px] text-ink">
                {playerName(deal)}
              </h1>
              <InfoLine deal={deal} />
            </header>

            {/* 경로 카드 — 3열 `1fr 32px 1fr`, To 칸만 canvas-soft, 가운데 칸 좌우 헤어라인 */}
            <section
              aria-label="이적 경로"
              className="mt-3 grid grid-cols-[1fr_32px_1fr] overflow-hidden rounded-lg border border-hairline"
            >
              <RouteCell label="FROM" club={deal.fromClub} text={routeLabels(deal, { full: true }).from} />
              <div
                aria-hidden
                className="flex items-center justify-center border-x border-hairline text-ink"
              >
                <Icon as={ArrowRight} size={16} />
              </div>
              <RouteCell label="TO" club={destinationClubs(deal)[0] ?? null} clubs={destinationClubs(deal)} text={routeLabels(deal, { full: true }).to} className="bg-canvas-soft" />
            </section>

            <FeeCard deal={deal} />

            <DetailTabs
              selected={tab}
              onSelect={setTab}
              tabs={[
                {
                  key: "comments",
                  label: "댓글",
                  // 댓글 + 답글 합계. 상한에 잘렸으면 `+`를 붙인다 — 받은 것만 센 숫자다
                  count: commentList
                    ? `${formatCount(commentList.comments.length)}${commentList.truncated ? "+" : ""}`
                    : null,
                },
                {
                  key: "reports",
                  label: "보도 타임라인",
                  count: reports.list ? formatCount(reports.list.length) : null,
                },
              ]}
            />

            <div
              ref={commentsPanelRef}
              role="tabpanel"
              id={detailPanelId("comments")}
              aria-labelledby={detailTabId("comments")}
              hidden={tab !== "comments"}
              // 삭제 확정·답글 대상 소실 뒤 포커스를 받는 자리다(프로그램으로만 — Tab 순서에는 넣지 않는다)
              tabIndex={-1}
              className="outline-none"
            >
              <CommentSection
                dealId={dealId}
                list={commentList}
                isPlaceholder={comments.isPlaceholder}
                error={comments.error}
                onRetry={() => comments.refetch()}
                status={session.status}
                userId={session.userId}
                nowMs={nowMs}
                onSignInRequired={setSignInAction}
                deletion={deletion.item}
                confirmedDeletes={deletion.confirmedIds}
                focusFallbackRef={commentsPanelRef}
              />
            </div>

            <div
              role="tabpanel"
              id={detailPanelId("reports")}
              aria-labelledby={detailTabId("reports")}
              hidden={tab !== "reports"}
            >
              <ReportTimeline
                reports={reports.list}
                error={reports.error}
                onRetry={() => refetch()}
                nowMs={nowMs}
              />
            </div>
          </article>
        )}
      </main>

      {/*
        하단 고정 바 — `<main>`의 형제. z-60은 앱의 z 스케일
        (서브헤더 20 < 하단바 60~70 < 오버레이 80). 이 화면의 CTA는 관심 토글 하나뿐이고 에메랄드
        (활성 시 `primary`)는 `buttonClassName`이 갖는다 — 이 슬라이스에서 새로 칠하지 않는다.
        ⚠ 딜이 그려졌을 때만 둔다 — 로딩·에러·없음 화면에 눌러도 대상이 없는 버튼을 남기지 않는다.
      */}
      {deal && (
        <footer className="absolute inset-x-0 bottom-0 z-[60] border-t border-hairline-cool bg-canvas px-4 pb-[max(30px,env(safe-area-inset-bottom))] pt-2.5">
          <WatchToggle
            dealId={deal.id}
            watched={deal.isWatched}
            onSignInRequired={() => setSignInAction("관심 목록에 담으려면")}
          />
        </footer>
      )}

      {/*
        로그인 안내 — 프레임 직속 자리에 한 벌. `<main>`·하단 바 밖이라야 `absolute` 기준이
        프레임이 된다(`SignInDialog` 주석). 로그인 뒤 이 상세로 돌아온다.
      */}
      <SignInDialog
        open={signInAction !== null}
        onClose={() => setSignInAction(null)}
        action={signInAction ?? ""}
        // `next`를 주지 않는다 — 기본값(지금 화면)이라 문구가 "이 화면으로 돌아와요"가 된다.
        // 주면 "이어서 진행할 수 있어요"가 나오는데, 로그인하고 돌아와도 누른 동작은 이어지지 않는다
      />

      {/*
        댓글 삭제 확인 — 늘 묻는다(`use-comment-deletion` 주석). 답글이 달린 루트는 **남의 답글까지**
        함께 사라진다는 것을 알린다 — cascade는 RLS가 막지 못하는 경로라 화면이 계약으로 갚는다.
      */}
      <Dialog
        open={deletion.dialog.open}
        onCancel={deletion.dialog.cancel}
        onConfirm={deletion.dialog.confirm}
        title="이 댓글을 삭제할까요?"
        description={
          deletion.dialog.checking
            ? "달린 답글을 확인하고 있어요."
            : deletion.dialog.replyCount > 0
              ? `답글 ${formatCount(deletion.dialog.replyCount)}개도 함께 삭제돼요. 되돌릴 수 없어요.`
              : "삭제한 댓글은 되돌릴 수 없어요."
        }
        confirmDisabled={deletion.dialog.checking}
        cancelLabel="취소"
        confirmLabel="삭제"
        confirmTone="danger"
      />
    </>
  );
}

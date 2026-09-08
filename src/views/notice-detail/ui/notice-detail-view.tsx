"use client";

import Link from "next/link";
import { type Notice, useNoticeQuery } from "@/entities/notice";
import { ROUTES } from "@/shared/config";
import { formatRelativeTime, useNowMs } from "@/shared/lib";
import { EmptyState, Markdown, Pill, Skeleton, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";

interface NoticeDetailViewProps {
  noticeId: number;
  /**
   * 서버가 미리 조회한 공지. **초기 HTML에 제목·본문이 담기게 하는 장치다**(색인 대상 화면).
   * ⚠ 서버 조회가 실패하면 `undefined`가 오고 화면은 클라이언트 쿼리로 폴백한다.
   */
  initialNotice?: Notice;
  /** 서버가 렌더한 시점의 시각 — 상대시각이 첫 프레임부터 그려지게 한다 */
  serverNowMs?: number;
}

export function NoticeDetailView({ noticeId, initialNotice, serverNowMs }: NoticeDetailViewProps) {
  const { data, isPending, error, refetch } = useNoticeQuery(noticeId, initialNotice);
  // ⚠ 순서를 뒤집지 말 것 — 세션당 한 번 고정되는 클라 시계가 서버 시각을 이기면 안 된다
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs;

  /**
   * ⚠ **네 분기가 같은 값을 쓴다.** 루트 프레임이 `h-dvh … overflow-hidden`이라 `<main>`이
   *   스스로 스크롤하지 않으면 넘친 내용에 닿을 방법이 없다 — 특히 에러 분기가 위험하다
   *   (DB 에러 원문이 길면 "다시 시도" 버튼이 잘려 복구 수단을 잃는다).
   */
  const mainClassName = "no-scrollbar min-h-0 flex-1 overflow-y-auto px-5";

  /**
   * 목록으로 가는 링크.
   * ⚠ 뒤로가기와 **다른 일을 한다** — 배너를 눌러 들어온 사용자의 history 이전 화면은
   *   피드이지 공지 목록이 아니다. 다른 공지를 마저 읽을 길이 여기 말고는 없다.
   * ⚠ 아이콘 버튼 두 개(뒤로·공유) 옆이라 글자로 둔다 — 아이콘을 하나 더 얹으면
   *   무엇이 무엇인지 구분되지 않는다.
   * ⚠ 그래서 라운드도 **6px이다.** 옆의 원형 버튼들은 "원형 히트 영역"이라 알약 규칙의
   *   대상이 아니지만(`styling.md`), 이건 라벨을 담은 컨트롤이라 그 대상이다.
   */
  const listLink = (
    <Link
      href={ROUTES.noticeList}
      className="flex h-11 items-center rounded-sm px-2.5 text-[13px] font-medium text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft"
    >
      목록
    </Link>
  );
  const header = <SubHeader title="공지사항" fallbackHref={ROUTES.noticeList} actions={listLink} />;

  if (isPending) {
    return (
      <>
        {header}
        <main className={mainClassName}>
          <Skeleton className="mt-5 h-6 w-3/4" />
          <Skeleton className="mt-3 h-4 w-1/3" />
          <Skeleton className="mt-6 h-40 w-full" />
        </main>
      </>
    );
  }

  if (error && !data) {
    return (
      <>
        {header}
        <main className={mainClassName}>
          <EmptyState
            title="공지를 불러오지 못했어요"
            description={error.message}
            onRetry={() => refetch()}
          />
        </main>
      </>
    );
  }

  // 노출 기간이 끝났거나 삭제된 공지는 정책이 감춘다 → 여기서는 "없음"으로 보인다
  if (!data) {
    return (
      <>
        {header}
        <main className={mainClassName}>
          <EmptyState
            title="공지를 찾을 수 없어요"
            description="삭제되었거나 노출 기간이 끝난 공지예요."
          />
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className={mainClassName}>
        {error && <StaleBanner noun="공지" onRetry={() => refetch()} />}

        <div className="flex items-center gap-1.5 pt-5">
          {/* ⚠ variant는 리터럴이어야 한다 — 동적 값은 검사가 금지한다 */}
          {data.type === "필독" ? <Pill variant="green">필독</Pill> : <Pill variant="soft">공지</Pill>}
          <time dateTime={data.opensAt} className="text-[12px] text-ink-mute-2">
            {formatRelativeTime(data.opensAt, nowMs)}
          </time>
        </div>

        <h1 className="mt-2 text-[20px] font-bold leading-[1.35] tracking-[-0.4px] text-ink">
          {data.title}
        </h1>

        <div className="mt-5 pb-10">
          <Markdown>{data.body}</Markdown>
        </div>
      </main>
    </>
  );
}

"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { type NoticeListItem, useNoticeListQuery } from "@/entities/notice";
import { ROUTES } from "@/shared/config";
import { formatDate } from "@/shared/lib";
import { EmptyState, Pill, Skeleton, StaleBanner } from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";

interface NoticeListViewProps {
  /** 서버 프리페치 결과. 실패하면 undefined가 오고 클라이언트가 조회한다 */
  initialNotices?: NoticeListItem[];
}

/**
 * 공지사항 목록 — 필독이 먼저, 그다음 최신순.
 *
 * 하단 탭바를 그리지 않는다(탭에 공지가 없는 서브헤더 화면이다 — 상세들과 같다).
 * ⚠ 노출 기간 밖·삭제된 공지는 `notice_select_live` 정책이 거른다 — 화면이 다시 거르지 않는다.
 */
export function NoticeListView({ initialNotices }: NoticeListViewProps) {
  const { data, isPending, error, refetch } = useNoticeListQuery(initialNotices);

  return (
    <>
      <SubHeader title="공지사항" fallbackHref={ROUTES.postList} />

      {/*
        ⚠ 루트 프레임이 `h-dvh … overflow-hidden`이라 `<main>`이 스스로 스크롤하지 않으면
          넘친 내용에 닿을 방법이 없다(상세 화면들과 같은 값).
      */}
      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <h1 className="sr-only">공지사항</h1>

        {isPending && (
          <div className="flex flex-col gap-2 px-5 pt-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {/* 보여줄 데이터가 없을 때만 화면을 대체한다 — 있으면 배너로만 알린다 */}
        {error && !data && (
          <EmptyState
            title="공지를 불러오지 못했어요"
            description={error.message}
            onRetry={() => refetch()}
          />
        )}
        {error && data && <StaleBanner noun="공지" onRetry={() => refetch()} />}

        {data && data.length === 0 && (
          <EmptyState icon={ClipboardList} title="아직 공지가 없어요" />
        )}

        {data && data.length > 0 && (
          <ul>
            {data.map((notice) => (
              <li key={notice.id}>
                <Link
                  href={ROUTES.notice(notice.id)}
                  className="flex flex-col gap-1.5 border-b border-hairline-cool px-5 py-3.5 transition-colors duration-150 ease-otb active:bg-canvas-soft"
                >
                  <span className="flex items-center gap-1.5">
                    {/* ⚠ variant는 리터럴이어야 한다 — 동적 값은 검사가 금지한다 */}
                    {notice.type === "필독" ? (
                      <Pill variant="green">필독</Pill>
                    ) : (
                      <Pill variant="soft">공지</Pill>
                    )}
                    {/* 다른 목록 카드(PostCard·SurveyCard)와 같은 마크업 — 날짜는 <time>, 제목은 h1 아래 h2 */}
                    {/* 연도까지 항상 붙인다 — 상세와 같은 표기라야 한 종류로 읽힌다 */}
                    <time dateTime={notice.opensAt} className="text-[12px] text-ink-mute-2">
                      {formatDate(notice.opensAt)}
                    </time>
                  </span>
                  <h2 className="line-clamp-2 text-[15px] font-medium leading-[1.45] text-ink">
                    {notice.title}
                  </h2>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

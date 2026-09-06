"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { formatKickoff, useQueryNowMs } from "@/shared/lib";
import { Button, EmptyState, Pill, Skeleton, StaleBanner, buttonClassName } from "@/shared/ui";
import { noticeVisibility, useAdminNoticeListQuery } from "@/entities/notice";
import { AdminFilterRail, AdminShell } from "@/widgets/admin-shell";
import { useNoticeRowActions } from "../model/use-notice-row-actions";

export function AdminNoticeListView({ deleted }: { deleted: boolean }) {
  const { data, dataUpdatedAt, isPending, error, refetch } = useAdminNoticeListQuery(deleted);
  // ⚠ 세션 고정 시계가 아니라 **이 목록을 받은 시각**으로 판정한다(등록 직후 상태가 어긋난다)
  const nowMs = useQueryNowMs(dataUpdatedAt);
  const rows = useNoticeRowActions();

  return (
    <AdminShell>
      <h1 className="sr-only">공지사항 관리</h1>

      <section className="border-b border-hairline-cool px-5 py-4">
        <Link href={ROUTES.adminNoticeNew} className={buttonClassName({ variant: "dark", block: true })}>
          새 공지 등록
        </Link>
        <p className="mt-2 text-[12px] leading-[1.6] text-ink-mute">
          읽는 화면은 아직 없어요. 노출 기간 밖 공지는 사용자에게 보이지 않습니다.
        </p>
      </section>

      <AdminFilterRail basePath={ROUTES.adminNoticeList} deleted={deleted} />

      {isPending && (
        <div className="flex flex-col gap-2 px-5 pt-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {error && !data && (
        <EmptyState
          title="공지를 불러오지 못했어요"
          description={error.message}
          onRetry={() => refetch()}
        />
      )}
      {error && data && <StaleBanner noun="공지" onRetry={() => refetch()} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={deleted ? "삭제된 공지가 없어요" : "등록된 공지가 없어요"}
        />
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col">
          {data.map((notice) => {
            const visibility = noticeVisibility(notice, nowMs);
            return (
              <li
                key={notice.id}
                className="flex items-center gap-3 border-b border-hairline-cool px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-mute-2">
                    {/* ⚠ variant는 리터럴이어야 한다 — 동적 값은 검사가 금지한다 */}
                    {notice.type === "필독" ? (
                      <Pill variant="dark">필독</Pill>
                    ) : (
                      <Pill variant="soft">공지</Pill>
                    )}
                    {visibility === "live" && <Pill variant="outline">노출 중</Pill>}
                    {visibility === "scheduled" && <Pill variant="yellow">예정</Pill>}
                    {visibility === "closed" && <Pill variant="outline">종료</Pill>}
                    {notice.deletedAt !== null && <Pill variant="crimson">삭제됨</Pill>}
                  </p>
                  <p className="mt-1 truncate text-[14px] font-medium text-ink">{notice.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-mute">
                    {formatKickoff(notice.opensAt, nowMs)} ~{" "}
                    {notice.closesAt === null ? "무기한" : formatKickoff(notice.closesAt, nowMs)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  {notice.deletedAt === null ? (
                    <>
                      <Link
                        href={ROUTES.adminNotice(notice.id)}
                        className={buttonClassName({ variant: "secondary", size: "sm" })}
                      >
                        수정
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={rows.isBusy(notice.id)}
                        onClick={() => rows.remove(notice.id)}
                      >
                        {rows.isBusy(notice.id) ? "삭제 중…" : "삭제"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={rows.isBusy(notice.id)}
                      onClick={() => rows.restore(notice.id)}
                    >
                      {rows.isBusy(notice.id) ? "되돌리는 중…" : "되돌리기"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}

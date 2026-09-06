"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { formatKickoff, useQueryNowMs } from "@/shared/lib";
import { Button, EmptyState, Pill, Skeleton, StaleBanner, buttonClassName } from "@/shared/ui";
import { isSurveyOpen, useAdminSurveyListQuery } from "@/entities/survey";
import { AdminFilterRail, AdminShell } from "@/widgets/admin-shell";
import { useSurveyRowActions } from "../model/use-survey-row-actions";

export function AdminSurveyListView({ deleted }: { deleted: boolean }) {
  const { data, dataUpdatedAt, isPending, error, refetch } = useAdminSurveyListQuery(deleted);
  // ⚠ 세션 고정 시계가 아니라 **이 목록을 받은 시각**으로 판정한다(등록 직후 상태가 어긋난다)
  const nowMs = useQueryNowMs(dataUpdatedAt);
  const rows = useSurveyRowActions();

  return (
    <AdminShell>
      <h1 className="sr-only">입축구 관리</h1>

      <section className="border-b border-hairline-cool px-5 py-4">
        <Link href={ROUTES.adminSurveyNew} className={buttonClassName({ variant: "dark", block: true })}>
          새 입축구 등록
        </Link>
      </section>

      <AdminFilterRail basePath={ROUTES.adminSurveyList} deleted={deleted} />

      {isPending && (
        <div className="flex flex-col gap-2 px-5 pt-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {error && !data && (
        <EmptyState
          title="입축구를 불러오지 못했어요"
          description={error.message}
          onRetry={() => refetch()}
        />
      )}
      {error && data && <StaleBanner noun="입축구" onRetry={() => refetch()} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={deleted ? "숨긴 입축구가 없어요" : "등록된 입축구가 없어요"}
        />
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col">
          {data.map((survey) => {
            /*
             * ⚠ 판정을 인라인으로 다시 짜지 않는다 — 마감 판정은 `isSurveyOpen` 하나가
             *   소유한다(목록·상세·features가 같은 답을 내야 한다).
             * ⚠ `nowMs`가 null인 첫 프레임에는 아무 배지도 그리지 않는다.
             */
            const open = nowMs === null ? null : isSurveyOpen(survey, nowMs);
            return (
              <li
                key={survey.id}
                className="flex items-center gap-3 border-b border-hairline-cool px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-mute-2">
                    <span className="font-mono tabular-nums">#{survey.id}</span>
                    {open === true && <Pill variant="soft">진행 중</Pill>}
                    {open === false && <Pill variant="outline">마감</Pill>}
                    {survey.deletedAt !== null && <Pill variant="outline">숨김</Pill>}
                  </p>
                  <p className="mt-1 truncate text-[14px] font-medium text-ink">{survey.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-mute">
                    마감 {formatKickoff(survey.closesAt, nowMs)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  {survey.deletedAt === null ? (
                    <>
                      <Link
                        href={ROUTES.adminSurvey(survey.id)}
                        className={buttonClassName({ variant: "secondary", size: "sm" })}
                      >
                        수정
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={rows.isBusy(survey.id)}
                        onClick={() => rows.remove(survey.id)}
                      >
                        {rows.isBusy(survey.id) ? "숨기는 중…" : "숨기기"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={rows.isBusy(survey.id)}
                      onClick={() => rows.restore(survey.id)}
                    >
                      {rows.isBusy(survey.id) ? "되돌리는 중…" : "되돌리기"}
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

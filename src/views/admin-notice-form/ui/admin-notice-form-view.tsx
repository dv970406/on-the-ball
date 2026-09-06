"use client";

import type { ReactNode } from "react";
import { ROUTES } from "@/shared/config";
import { fromKstInputValue, toKstInputValue } from "@/shared/lib";
import { EmptyState, Skeleton, StaleBanner } from "@/shared/ui";
import { useAdminNoticeQuery } from "@/entities/notice";
import { NoticeForm } from "@/features/admin-notice";
import { SubHeader } from "@/widgets/sub-header";
import { useNoticeCreate, useNoticeUpdate } from "../model/use-notice-submit";

/** ⚠ 등록·수정이 한 슬라이스다 — views끼리는 import할 수 없어 폼을 공유하려면 이 형태다 */
export function AdminNoticeFormView({ noticeId }: { noticeId?: number }) {
  return noticeId === undefined ? <CreateView /> : <EditView noticeId={noticeId} />;
}

function shell(title: string, body: ReactNode) {
  return (
    <>
      <SubHeader title={title} fallbackHref={ROUTES.adminNoticeList} />
      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto">
        <h1 className="sr-only">{title}</h1>
        {body}
      </main>
    </>
  );
}

function CreateView() {
  const create = useNoticeCreate();
  return shell(
    "공지 등록",
    <NoticeForm
      mode="create"
      initial={{ type: "공지", title: "", body: "", opensAt: "", closesAt: "" }}
      toIso={fromKstInputValue}
      isPending={create.isPending}
      error={create.error}
      onSubmit={create.submit}
    />,
  );
}

function EditView({ noticeId }: { noticeId: number }) {
  const query = useAdminNoticeQuery(noticeId);
  const update = useNoticeUpdate(noticeId);
  const notice = query.data;

  if (query.isPending) {
    return shell(
      "공지 수정",
      <div className="flex flex-col gap-3 px-5 pt-5">
        <Skeleton className="h-[50px] w-full" />
        <Skeleton className="h-40 w-full" />
      </div>,
    );
  }
  if (query.error && !notice) {
    return shell(
      "공지 수정",
      <EmptyState
        title="공지를 불러오지 못했어요"
        description={query.error.message}
        onRetry={() => query.refetch()}
      />,
    );
  }
  if (!notice) return shell("공지 수정", <EmptyState title="공지를 찾을 수 없어요" />);

  return shell(
    "공지 수정",
    <>
      {query.error && <StaleBanner noun="공지" onRetry={() => query.refetch()} />}
      <NoticeForm
        mode="edit"
        // 서버 값이 바뀌면 폼을 다시 세운다(저장 후 옛 초안이 남지 않게)
        key={notice.updatedAt}
        initial={{
          type: notice.type,
          title: notice.title,
          body: notice.body,
          opensAt: toKstInputValue(notice.opensAt),
          closesAt: toKstInputValue(notice.closesAt),
        }}
        toIso={fromKstInputValue}
        isPending={update.isPending}
        error={update.error}
        onSubmit={update.submit}
      />
    </>,
  );
}

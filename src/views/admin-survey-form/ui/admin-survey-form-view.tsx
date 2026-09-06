"use client";

import type { ReactNode } from "react";
import { ROUTES } from "@/shared/config";
import { toKstInputValue } from "@/shared/lib";
import { EmptyState, Skeleton, StaleBanner } from "@/shared/ui";
import { useAdminSurveyQuery } from "@/entities/survey";
import { SurveyForm, emptyOptionDraft, useSurveyImageUpload } from "@/features/admin-survey";
import { SubHeader } from "@/widgets/sub-header";
import { useSurveyCreate, useSurveyUpdate } from "../model/use-survey-submit";

/**
 * 입축구 등록·수정.
 *
 * ⚠ **등록과 수정이 한 슬라이스다** — `views`끼리는 import할 수 없어 폼을 공유하려면 이
 *   형태여야 한다(`PostForm`의 `mode` prop과 같은 판단).
 */
export function AdminSurveyFormView({ surveyId }: { surveyId?: number }) {
  return surveyId === undefined ? <CreateView /> : <EditView surveyId={surveyId} />;
}

function shell(title: string, body: ReactNode) {
  return (
    <>
      <SubHeader title={title} fallbackHref={ROUTES.adminSurveyList} />
      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto">
        <h1 className="sr-only">{title}</h1>
        {body}
      </main>
    </>
  );
}

function CreateView() {
  const create = useSurveyCreate();

  return shell(
    "입축구 등록",
    <SurveyForm
      mode="create"
      initial={{ title: "", closesAt: "", options: [emptyOptionDraft(), emptyOptionDraft()] }}
      optionsLocked={false}
      isPending={create.isPending}
      error={create.error}
      onSubmit={create.submit}
    />,
  );
}

function EditView({ surveyId }: { surveyId: number }) {
  const query = useAdminSurveyQuery(surveyId);
  const detail = query.data;
  // ⚠ 훅은 조건 없이 부른다 — 데이터가 오기 전에도 순서가 같아야 한다
  const update = useSurveyUpdate(
    surveyId,
    detail?.hasVotes ?? false,
    // 서버가 들고 있던 배경 경로 — 저장 후 여기서 사라진 것이 버려진 파일이다
    detail?.options.flatMap((option) => (option.imagePath === null ? [] : [option.imagePath])) ?? [],
  );
  const imageUpload = useSurveyImageUpload(surveyId);

  if (query.isPending) {
    return shell(
      "입축구 수정",
      <div className="flex flex-col gap-3 px-5 pt-5">
        <Skeleton className="h-[50px] w-full" />
        <Skeleton className="h-[50px] w-full" />
        <Skeleton className="h-40 w-full" />
      </div>,
    );
  }
  if (query.error && !detail) {
    return shell(
      "입축구 수정",
      <EmptyState
        title="입축구를 불러오지 못했어요"
        description={query.error.message}
        onRetry={() => query.refetch()}
      />,
    );
  }
  if (!detail) {
    return shell("입축구 수정", <EmptyState title="입축구를 찾을 수 없어요" />);
  }

  return shell(
    "입축구 수정",
    <>
      {query.error && <StaleBanner noun="입축구" onRetry={() => query.refetch()} />}
      <SurveyForm
        mode="edit"
        // ⚠ 서버 값이 바뀌면 폼을 다시 세운다 — key가 없으면 저장 후에도 옛 초안이 남는다
        key={detail.survey.updatedAt}
        initial={{
          title: detail.survey.title,
          closesAt: toKstInputValue(detail.survey.closesAt),
          options: detail.options.map((option) => ({
            id: option.id,
            label: option.label,
            subtitle: option.subtitle ?? "",
            bgColor: option.bgColor ?? "",
            textColor: option.textColor ?? "",
            imagePath: option.imagePath ?? "",
          })),
        }}
        optionsLocked={detail.hasVotes}
        imageUpload={imageUpload}
        isPending={update.isPending}
        error={update.error}
        onSubmit={update.submit}
      />
    </>,
  );
}

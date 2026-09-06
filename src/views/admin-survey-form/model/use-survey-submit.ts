"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/shared/config";
import { fromKstInputValue, useDuplicateGuard, useToast } from "@/shared/lib";
import {
  type SurveyInput,
  useCreateSurvey,
  useEditSurveyOption,
  useSetSurveyOptions,
  useSurveyImageCleanup,
  useUpdateSurvey,
} from "@/features/admin-survey";

/** 등록 — 성공하면 수정 화면으로 옮긴다(배경 사진은 저장 후에만 올릴 수 있다) */
export function useSurveyCreate() {
  const create = useCreateSurvey();
  const guard = useDuplicateGuard(create);
  const toast = useToast();
  const router = useRouter();

  return {
    submit: (value: SurveyInput, closesAt: string | null) => {
      if (guard.isLocked()) return;
      guard.lock();
      create.mutate(
        { input: value, closesAt: closesAt === null ? null : fromKstInputValue(closesAt) },
        {
          onSuccess: (id) => {
            router.replace(ROUTES.adminSurvey(id));
            toast("입축구를 등록했어요");
          },
        },
      );
    },
    isPending: create.isPending,
    error: create.error,
  };
}

/**
 * 수정.
 *
 * ⚠ **선택지를 어떻게 저장할지가 표 유무로 갈린다.**
 *   표가 없으면 묶음 교체(개수까지 바꿀 수 있다), 있으면 칸별 수정(개수를 못 바꾼다).
 *   판정을 화면이 아니라 이 훅이 갖는 이유는 두 뮤테이션의 조립이 곧 그 규칙이기 때문이다.
 * ⚠ 최종 판정은 여전히 DB다 — 표가 방금 들어왔다면 묶음 교체가 P0001로 거부되고 그 문구가
 *   그대로 화면에 뜬다.
 * ⚠ 제목·마감을 **먼저** 저장한다. 선택지에서 실패해도 제목 수정은 남는 편이 낫다
 *   (반대 순서면 선택지만 바뀌고 제목이 옛것으로 남아 더 헷갈린다).
 */
export function useSurveyUpdate(surveyId: number, optionsLocked: boolean, serverImagePaths: readonly string[]) {
  const update = useUpdateSurvey(surveyId);
  const cleanupImages = useSurveyImageCleanup();
  const setOptions = useSetSurveyOptions(surveyId);
  const editOption = useEditSurveyOption(surveyId);
  const guard = useDuplicateGuard(update);
  const toast = useToast();

  return {
    submit: (value: SurveyInput, closesAt: string | null) => {
      if (guard.isLocked()) return;
      guard.lock();

      update.mutate(
        { title: value.title, closesAt: closesAt === null ? null : fromKstInputValue(closesAt) },
        {
          onSuccess: async () => {
            try {
              if (optionsLocked) {
                // ⚠ 순차로 돈다 — 라벨을 서로 맞바꾸면 unique 제약에 걸리는데, 병렬이면
                //   어느 것이 먼저 닿는지가 갈려 실패가 재현되지 않는다.
                for (const option of value.options) {
                  if (option.id === undefined) continue;
                  await editOption.mutateAsync({ ...option, id: option.id });
                }
              } else {
                await setOptions.mutateAsync(value.options);
              }
              /*
               * ⚠ **저장이 끝난 뒤에 정리한다.** "빼기"·교체로 참조가 끊긴 파일은 이 시점에야
               *   DB가 실제로 버린 상태다 — 버튼을 누른 순간 지우면 저장 없이 떠났을 때
               *   경로만 남고 파일이 없어진다.
               */
              const kept = new Set(value.options.map((option) => option.imagePath));
              await cleanupImages(serverImagePaths.filter((path) => !kept.has(path)));
              toast("입축구를 저장했어요");
            } catch {
              // 문구는 각 훅의 onError가 이미 보냈다
            }
          },
        },
      );
    },
    isPending: update.isPending || setOptions.isPending || editOption.isPending,
    error: update.error ?? setOptions.error ?? editOption.error,
  };
}

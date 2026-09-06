"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/types/database.types";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { useToast } from "@/shared/lib";
import { surveyKeys } from "@/entities/survey";
import type { SurveyInput } from "../lib/survey-schema";

/**
 * ⚠ **jsonb 인자는 생성 타입이 `Json`이라 컴파일러가 키 오타를 잡아주지 못한다.**
 *   (`bgColor` vs `bg_color` 하나가 빌드를 통과하고 런타임에 null로 저장된다 —
 *   `database.types.ts`의 컴파일 타임 보증이 여기서만 사라진다.)
 *   그래서 **직렬화를 이 함수 하나가 소유한다.** 호출부가 객체를 직접 만들지 않는다.
 */
function toOptionsJson(options: SurveyInput["options"]): Json {
  return options.map((option) => ({
    label: option.label,
    subtitle: option.subtitle,
    bgColor: option.bgColor,
    textColor: option.textColor,
    imagePath: option.imagePath,
  })) as Json;
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  // 어드민 캐시와 일반 캐시(목록·상세·결과)가 같은 prefix 아래 있어 한 번에 정리된다
  return queryClient.invalidateQueries({ queryKey: surveyKeys.all });
}

export function useCreateSurvey() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (vars: { input: SurveyInput; closesAt: string | null }): Promise<number> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase.rpc("admin_create_survey", {
        p_title: vars.input.title,
        p_options: toOptionsJson(vars.input.options),
        // ⚠ 비우면 키를 빼서 DB 기본값(생성 + 7일)을 쓴다 — null을 명시로 보내는 것과 같지만
        //   "정하지 않았다"가 시그니처로 드러난다.
        ...(vars.closesAt === null ? {} : { p_closes_at: vars.closesAt }),
      });
      if (error) {
        console.error("[admin-survey] 입축구 등록 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data;
    },
    // ⚠ 성공하면 수정 화면으로 떠나므로 Promise를 **반환하지 않는다**(이동 자체가 성공 표시다)
    onSuccess: () => {
      invalidate(queryClient);
    },
    onError: (error) => toast(error.message),
  });
}

export function useUpdateSurvey(surveyId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (vars: { title: string; closesAt: string | null }) => {
      const supabase = requireBrowserSupabase();
      /*
       * ⚠ 비우면 키를 빼고 **RPC가 기존 마감을 유지한다.** `survey.closes_at`은 `not null`이라
       *   "비움"이 표현할 수 있는 상태가 아니다 — 공지의 `closes_at`(null = 무기한)과 갈리는
       *   지점이고, 한때 여기서 null이 그대로 나가 23502로 저장이 통째로 실패했다.
       */
      const { error } = await supabase.rpc("admin_update_survey", {
        p_id: surveyId,
        p_title: vars.title,
        ...(vars.closesAt === null ? {} : { p_closes_at: vars.closesAt }),
      });
      if (error) {
        console.error("[admin-survey] 입축구 수정 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

/**
 * 선택지 **묶음 교체** — 표가 0건일 때만 통과한다.
 *
 * ⚠ 화면이 버튼을 잠그는 것은 안내일 뿐이고, 실제 판정은 RPC가 지우고 넣은 뒤 다시 세는
 *   검사가 한다(정책은 스냅샷이라 "지금 0건"을 본 뒤에도 표가 들어올 창이 남는다).
 */
export function useSetSurveyOptions(surveyId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (options: SurveyInput["options"]) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_set_survey_options", {
        p_survey_id: surveyId,
        p_options: toOptionsJson(options),
      });
      if (error) {
        console.error("[admin-survey] 선택지 교체 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

/**
 * 선택지 **한 칸**의 문구·색·이미지 — 표가 있어도 언제나 가능하다.
 *
 * ⚠ **문항 id를 함께 보낸다.** RPC가 그것으로 대조하지 않으면 화면이 들고 있던 stale한
 *   선택지 id가 에러가 아니라 **다른 문항의 선택지를 조용히 고친다**(실측).
 */
export function useEditSurveyOption(surveyId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (option: SurveyInput["options"][number] & { id: number }) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_edit_survey_option", {
        p_option_id: option.id,
        p_survey_id: surveyId,
        p_label: option.label,
        ...(option.subtitle === null ? {} : { p_subtitle: option.subtitle }),
        ...(option.bgColor === null ? {} : { p_bg_color: option.bgColor }),
        ...(option.textColor === null ? {} : { p_text_color: option.textColor }),
        ...(option.imagePath === null ? {} : { p_image_path: option.imagePath }),
      });
      if (error) {
        console.error("[admin-survey] 선택지 수정 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

export function useDeleteSurvey() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (surveyId: number) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_soft_delete_survey", { p_id: surveyId });
      if (error) {
        console.error("[admin-survey] 입축구 삭제 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

export function useRestoreSurvey() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (surveyId: number) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.rpc("admin_restore_survey", { p_id: surveyId });
      if (error) {
        console.error("[admin-survey] 입축구 복구 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
    },
    onSuccess: () => invalidate(queryClient),
    onError: (error) => toast(error.message),
  });
}

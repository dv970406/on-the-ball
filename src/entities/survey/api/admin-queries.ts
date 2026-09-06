"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { surveyKeys } from "./keys";
import {
  ADMIN_OPTION_SELECT,
  ADMIN_SURVEY_LIMIT,
  ADMIN_SURVEY_SELECT,
  buildAdminSurvey,
} from "./mappers";
import type { AdminSurvey, SurveyOption } from "../model/types";

/**
 * 어드민 입축구 목록.
 *
 * ⚠ 선택지를 임베딩하지 않는다 — `survey_option_select_alive`가 삭제된 문항의 선택지를
 *   감춰 **삭제된 것만 0개로 보인다**(화면이 거짓말을 한다). 선택지는 수정 화면이
 *   `admin_survey_option_list`로 따로 받는다.
 */
export function useAdminSurveyListQuery(deleted: boolean | null) {
  return useQuery({
    queryKey: surveyKeys.adminList(deleted),
    queryFn: async (): Promise<AdminSurvey[]> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .rpc("admin_survey_list", deleted === null ? {} : { p_deleted: deleted })
        .select(ADMIN_SURVEY_SELECT)
        .order("id", { ascending: false })
        .limit(ADMIN_SURVEY_LIMIT);

      if (error) {
        console.error("[survey] 어드민 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildAdminSurvey);
    },
  });
}

export interface AdminSurveyDetail {
  survey: AdminSurvey;
  options: SurveyOption[];
  /** 표가 하나라도 있으면 선택지 **개수**를 바꿀 수 없다(실제 차단은 RPC의 P0001) */
  hasVotes: boolean;
}

/**
 * 어드민 입축구 단건 + 선택지 + 표 유무.
 *
 * ⚠ 표 유무를 함께 받는 이유는 화면이 "추가·삭제 버튼을 잠글지"를 그것으로 정하기 때문이다.
 *   ⚠ 그건 **안내일 뿐이다** — 실제 차단은 `admin_set_survey_options` 안에서
 *   지우고 넣은 뒤 다시 세는 검사가 한다(정책은 스냅샷 판정이라 창이 남는다).
 */
export function useAdminSurveyQuery(surveyId: number) {
  return useQuery({
    queryKey: surveyKeys.adminDetail(surveyId),
    queryFn: async (): Promise<AdminSurveyDetail | null> => {
      const supabase = requireBrowserSupabase();

      const [surveyRes, optionRes, voteRes] = await Promise.all([
        supabase.rpc("admin_survey_list").select(ADMIN_SURVEY_SELECT).eq("id", surveyId).maybeSingle(),
        supabase
          .rpc("admin_survey_option_list", { p_survey_id: surveyId })
          .select(ADMIN_OPTION_SELECT)
          .order("sort_order"),
        supabase.rpc("admin_survey_vote_count", { p_survey_id: surveyId }),
      ]);

      if (surveyRes.error) {
        console.error("[survey] 어드민 단건 조회 실패:", surveyRes.error);
        throw new Error(toDbErrorMessage(surveyRes.error));
      }
      if (!surveyRes.data) return null;
      if (optionRes.error) {
        console.error("[survey] 어드민 선택지 조회 실패:", optionRes.error);
        throw new Error(toDbErrorMessage(optionRes.error));
      }
      // ⚠ 삼키면 `hasVotes:false`가 되어 **표가 있는 문항의 개수 편집 버튼이 열린다.**
      //   최종 차단은 RPC의 P0001이라 데이터는 안전하지만, 화면이 거짓 안내를 한다.
      if (voteRes.error) {
        console.error("[survey] 어드민 표 수 조회 실패:", voteRes.error);
        throw new Error(toDbErrorMessage(voteRes.error));
      }

      return {
        survey: buildAdminSurvey(surveyRes.data),
        options: (optionRes.data ?? []).map((row) => ({
          id: row.id,
          label: row.label,
          sortOrder: row.sort_order,
          subtitle: row.subtitle,
          imagePath: row.image_path,
          bgColor: row.bg_color,
          textColor: row.text_color,
        })),
        /*
         * ⚠ **`survey_vote`를 직접 세지 않는다** — 그 테이블의 SELECT 정책이 "내 행만"이라
         *   참여하지 않은 관리자에게는 언제나 0이 온다(잠금이 항상 풀린다).
         * ⚠ 이 값은 버튼을 미리 잠그는 **힌트**이고 최종 판정은 RPC의 P0001이다.
         */
        hasVotes: (voteRes.data ?? 0) > 0,
      };
    },
    enabled: Number.isSafeInteger(surveyId) && surveyId > 0,
  });
}

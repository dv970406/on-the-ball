"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { NOTICE_LIST_LIMIT, NOTICE_SELECT, buildNotice, buildNoticeListItem } from "./mappers";
import { buildBannerNoticeQuery, buildNoticeListQuery } from "./list-query";
import { noticeKeys } from "./keys";
import type { Notice, NoticeListItem } from "../model/types";

/**
 * 공지 목록 — 필독이 먼저, 그다음 최신순.
 *
 * ⚠ 조립은 `buildNoticeListQuery`가 단독으로 소유한다(SSR 페이지가 같은 함수를 부른다).
 * ⚠ 노출 기간·삭제는 `notice_select_live` 정책이 거른다 — 훅에 필터를 두지 않는다.
 */
export function useNoticeListQuery(initialData?: NoticeListItem[]) {
  return useQuery<NoticeListItem[], Error>({
    initialData,
    queryKey: noticeKeys.list(),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await buildNoticeListQuery(supabase);

      if (error) {
        console.error("[notice] 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildNoticeListItem);
    },
  });
}

/**
 * 공지 단건.
 *
 * ⚠ 0행이 정상이다(없는 id · 노출 기간 밖) → `maybeSingle()`. 화면은 `null`을 404로 읽는다.
 */
export function useNoticeQuery(noticeId: number, initialData?: Notice) {
  return useQuery<Notice | null, Error>({
    initialData,
    queryKey: noticeKeys.detail(noticeId),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .from("notice")
        .select(NOTICE_SELECT)
        .eq("id", noticeId)
        .maybeSingle();

      if (error) {
        console.error("[notice] 단건 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildNotice(data) : null;
    },
    enabled: Number.isSafeInteger(noticeId) && noticeId > 0,
  });
}

/**
 * 피드 최상단 배너용 — 가장 최신 '필독' 하나.
 *
 * ⚠ `initialData`에 **`null`을 넘길 수 있어야 한다**(= "공지가 없다"). `undefined`는
 *   "프리페치를 안 했다"는 다른 뜻이라, 하나로 접으면 필독 공지가 없는 사이트에서
 *   목록 화면을 열 때마다 조회가 한 번씩 더 나간다(투표의 `null`/`undefined`와 같은 규약).
 */
export function useBannerNoticeQuery(initialData?: NoticeListItem | null) {
  return useQuery<NoticeListItem | null, Error>({
    initialData,
    queryKey: noticeKeys.banner(),
    queryFn: async () => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await buildBannerNoticeQuery(supabase);

      if (error) {
        console.error("[notice] 배너 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildNoticeListItem(data) : null;
    },
  });
}

/**
 * 어드민 공지 목록.
 *
 * ⚠ **테이블이 아니라 `admin_notice_list` RPC를 부른다.** `notice_select_live` 정책이
 *   예약·만료·삭제된 공지를 감추므로 테이블 조회로는 어드민이 그것들을 볼 수 없다.
 *   정책에 `or is_admin()`을 얹지 않은 이유는 그러면 **관리자의 일반 화면까지** 남들과
 *   달라지기 때문이다(`docs/conventions/api-and-db.md`의 어드민 절).
 * ⚠ 비관리자에게는 **에러가 아니라 0행**이 온다 — 화면은 그것을 빈 목록으로 그리면 된다
 *   (실제 차단은 서버 가드와 RPC 안의 `is_admin()`이 한다).
 */
export function useAdminNoticeListQuery(deleted: boolean | null) {
  return useQuery({
    queryKey: noticeKeys.adminList(deleted),
    queryFn: async (): Promise<Notice[]> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .rpc("admin_notice_list", deleted === null ? {} : { p_deleted: deleted })
        .select(NOTICE_SELECT)
        .order("id", { ascending: false })
        .limit(NOTICE_LIST_LIMIT);

      if (error) {
        console.error("[notice] 어드민 목록 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return (data ?? []).map(buildNotice);
    },
  });
}

/** 어드민 공지 단건 — 목록과 같은 RPC를 id로 좁힌다(별도 함수를 만들지 않는다) */
export function useAdminNoticeQuery(noticeId: number) {
  return useQuery({
    queryKey: noticeKeys.adminDetail(noticeId),
    queryFn: async (): Promise<Notice | null> => {
      const supabase = requireBrowserSupabase();
      const { data, error } = await supabase
        .rpc("admin_notice_list")
        .select(NOTICE_SELECT)
        .eq("id", noticeId)
        // 0행이 정상이다(없는 id·비관리자) → single()이면 PGRST116이 에러로 섞인다
        .maybeSingle();

      if (error) {
        console.error("[notice] 어드민 단건 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? buildNotice(data) : null;
    },
    enabled: Number.isSafeInteger(noticeId) && noticeId > 0,
  });
}

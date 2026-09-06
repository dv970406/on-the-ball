import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { NOTICE_LIST_LIMIT, NOTICE_LIST_SELECT } from "./mappers";

/**
 * 공지 목록 조립의 **단일 소스** — 훅과 SSR 페이지가 같은 함수를 부른다.
 *
 * ⚠ **서버가 정렬·상한·select를 다시 짜면 안 된다.** 한 글자만 달라도 하이드레이션 직후
 *   목록이 재배열된다(`buildPostListQuery`·`buildSurveyListQuery`와 같은 규약).
 * ⚠ 이 파일에 `"use client"`를 붙이지 않는다 — 서버 페이지가 import해야 한다.
 * ⚠ 예약·만료·삭제된 공지를 여기서 거르지 않는다. 그 판정은 **`notice_select_live` 정책이
 *   단독으로** 갖는다 — 필터를 조회마다 반복하면 한 곳만 빠뜨려도 발표 전 공지가 샌다
 *   (소프트 삭제·차단을 정책에 맡긴 것과 같은 이유).
 */
export function buildNoticeListQuery(supabase: SupabaseClient<Database>) {
  return (
    supabase
      .from("notice")
      .select(NOTICE_LIST_SELECT)
      /*
       * ⚠ **필독이 먼저다.** `notice_type` enum의 정의 순서가 `('필독','공지')`라
       *   오름차순이 곧 그 순서다 — 값을 더하거나 `alter type … before/after`로 순서를
       *   바꾸면 이 정렬이 함께 움직인다(라벨맵이 없어 값 자체가 계약인 자리다).
       */
      .order("type", { ascending: true })
      .order("opens_at", { ascending: false })
      .limit(NOTICE_LIST_LIMIT)
  );
}

/**
 * 피드 최상단 배너가 그릴 **가장 최신 '필독'** 하나.
 *
 * ⚠ 0행이 정상이다(필독 공지가 없는 것이 기본 상태다) → `single()`이 아니라 `maybeSingle()`.
 * ⚠ 타입을 `'공지'`까지 넓히지 않는다 — 배너는 화면 최상단의 가장 비싼 자리라
 *   "반드시 읽어야 하는 것"만 올린다. 나머지는 목록에서 본다.
 */
export function buildBannerNoticeQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .from("notice")
    .select(NOTICE_LIST_SELECT)
    .eq("type", "필독")
    .order("opens_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

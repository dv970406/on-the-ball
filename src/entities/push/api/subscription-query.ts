import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * 구독 한 건의 select — **클라이언트가 읽을 수 있는 것은 이 컬럼뿐이다.** 암호화 키(`p256dh`·`auth`)는 SELECT grant가
 * 없어(발송만 읽는다) 실으면 42501이다.
 */
export const OWN_SUBSCRIPTION_SELECT = "endpoint" as const;

/**
 * "이 주소의 구독이 **내 행으로** 서버에 있는가" — 알림 상태 조회와 알림 켜기(남의 구독을 넘겨받지 않기)가 같은 판정을 쓴다.
 *
 * ⚠ **유저 필터를 걸지 않는다** — SELECT 정책이 "내 행만"이라 남의 구독이면 0행이다. 그래서 `maybeSingle`이다(0행이 에러가 아니다).
 */
export function buildOwnSubscriptionQuery(supabase: SupabaseClient<Database>, endpoint: string) {
  return supabase
    .from("profiles_push_subscription")
    .select(OWN_SUBSCRIPTION_SELECT)
    .eq("endpoint", endpoint)
    .maybeSingle();
}

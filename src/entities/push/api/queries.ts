"use client";

import { useQuery } from "@tanstack/react-query";
import { requireBrowserSupabase, toDbErrorMessage } from "@/shared/api";
import { env } from "@/shared/config";
import { detectPushSupport, getPushSubscription, pushSubscriptionUsesKey } from "@/shared/lib";
import type { PushStatus } from "../model/types";
import { pushKeys } from "./keys";
import { buildOwnSubscriptionQuery } from "./subscription-query";

/**
 * 이 기기에서 **이 사용자**의 알림 상태.
 *
 * 브라우저의 상태(지원 여부 · 권한 · 구독)와 서버의 행을 함께 본다 — 브라우저에 구독이 있어도 그 주소가 내 행으로
 * 서버에 없으면 꺼진 것이다(같은 브라우저를 쓰던 다른 계정의 구독이거나, 서버 쪽 행이 정리됐다).
 *
 * ⚠ 브라우저 API를 읽으므로 **queryFn 안에서만** 판정한다 — 렌더 중에 읽으면 서버 HTML과 첫 렌더가 갈린다.
 *   그래서 이 값은 서버가 미리 그릴 수 없고, 화면은 도착 전 자리를 스켈레톤으로 잡아 둔다.
 * ⚠ `userId`를 인자로 받는다 — entities끼리는 import할 수 없어 세션을 아는 상위 레이어가 넘긴다(`useProfileQuery`와 같다).
 * ⚠ 권한은 앱 밖(브라우저 설정)에서도 바뀐다 — 그 변화는 이 화면을 다시 열 때 따라온다.
 */
export function usePushStatusQuery(userId: string | undefined) {
  return useQuery<PushStatus, Error>({
    queryKey: pushKeys.status(userId ?? ""),
    queryFn: async () => {
      // ⚠ `!`를 쓰지 않는다 — 아래 `enabled`와 떨어져 있어 한쪽만 고치면 조용히 깨진다
      if (!userId) throw new Error("로그인이 필요해요.");

      // ⚠ 키 판정이 **맨 앞**이다 — 켤 수 없는 배포에서 "사파리로 열어 주세요" 같은 안내를 내면 따라 해도 켜지지 않는다
      if (!env.vapidPublicKey) return "unconfigured";
      const support = detectPushSupport();
      if (support !== "supported") return support;
      if (Notification.permission === "denied") return "denied";

      const subscription = await getPushSubscription();
      // 권한이 `default`로 되돌아갔는데 구독만 남은 경우도 꺼진 것으로 본다(다시 켜면 권한부터 묻는다)
      if (subscription === null || Notification.permission !== "granted") return "off";
      // 옛 공개키에 묶인 구독은 발송이 전부 거부된다 — 받는 중이라고 그리지 않는다(다시 켜면 새로 받는다)
      if (!pushSubscriptionUsesKey(subscription, env.vapidPublicKey)) return "off";

      const supabase = requireBrowserSupabase();
      const { data, error } = await buildOwnSubscriptionQuery(supabase, subscription.endpoint);
      if (error) {
        console.error("[push] 알림 상태 조회 실패:", error);
        throw new Error(toDbErrorMessage(error));
      }
      return data ? "on" : "off";
    },
    enabled: !!userId,
  });
}

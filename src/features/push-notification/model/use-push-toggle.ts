"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireBrowserSupabase, toWriteErrorMessage } from "@/shared/api";
import { env } from "@/shared/config";
import {
  getPushSubscription,
  pushSubscriptionUsesKey,
  serializePushSubscription,
  subscribePush,
  track,
  useDuplicateGuard,
  useToast,
} from "@/shared/lib";
import { buildOwnSubscriptionQuery, pushKeys } from "@/entities/push";
import { useSessionStore } from "@/entities/session";

/** 알림을 켠 자리 — 분석 이벤트에 싣는다 */
type PushSource = "profile" | "deal";

interface EnableVariables {
  /**
   * 권한 요청의 결과 — **클릭 핸들러 안에서 이미 시작된** Promise다.
   * ⚠ 뮤테이션 함수 안에서 요청하지 않는다. 브라우저(특히 사파리)는 권한 요청이 사용자의 동작에서 곧바로 이어질 때만
   *   물음을 띄우는데, 뮤테이션 함수는 비동기 단계 뒤에 불린다.
   */
  permission: Promise<NotificationPermission>;
}

/**
 * 브라우저의 푸시 단계(워커 등록 · 구독 · 해지)가 던진 예외를 한국어 한 문구로 접는다.
 * 그 예외들은 영문이고(`Registration failed - push service error`) 길어서 토스트가 화면 밖으로 넘친다 — 원본은 콘솔에 남긴다.
 * 구글 서비스가 막힌 크롬·사생활 보호 창·불안정한 회선에서 실제로 난다.
 */
async function browserStep<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (e) {
    console.error("[push] 브라우저 푸시 단계 실패:", e);
    throw new Error("이 브라우저에서 알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

/**
 * 이 기기의 알림 켜기·끄기.
 *
 * 켜기: 권한 → 서비스 워커 등록 → 브라우저 구독 → 서버에 저장(`profiles_push_subscription`).
 * 끄기: 서버의 행을 지우고 브라우저 구독을 버린다.
 *
 * ⚠ **브라우저에 남은 구독이 내 것이 아니면 버리고 새로 받는다.** 구독은 계정이 아니라 브라우저의 것이라, 같은
 *   브라우저에서 계정을 바꾸면 앞 사람 명의의 행이 그 주소를 쥐고 있다(PK가 endpoint다). 새로 받으면 주소가 바뀌고
 *   옛 행은 다음 발송에서 410을 받아 정리된다 — 알림이 엉뚱한 사람에게 가는 길이 없다.
 * ⚠ **저장에 실패하면 방금 받은 구독을 버린다.** 남겨 두면 브라우저는 구독 중인데 서버는 모르는 상태가 된다.
 * ⚠ **가드를 갖는다(둘 다)** — 켜기는 행을 만들고 끄기는 행을 지운다(`data-and-state.md`의 가드 표). 맨 `mutate`를
 *   내보내지 않고 `enable`·`disable`만 노출한다.
 * ⚠ 실제 차단은 RLS다(본인 행만 INSERT·DELETE). 세션 확인은 이중 방어다.
 * ⚠ 성공·실패 모두 상태를 다시 읽는다 — 권한을 거절하면 브라우저의 권한이 `denied`로 바뀌어 화면의 안내가 달라져야 한다.
 */
export function usePushToggle(source: PushSource) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: pushKeys.all });

  const enableMutation = useMutation<void, Error, EnableVariables>({
    mutationFn: async ({ permission }) => {
      const user = useSessionStore.getState().user;
      if (!user) throw new Error("로그인이 필요해요.");
      if (!env.vapidPublicKey) throw new Error("지금은 알림을 켤 수 없어요.");

      /*
       * 권한 — 거절(`denied`)과 물음을 닫은 것(`default`)을 가른다. 닫은 것은 다시 누르면 또 물을 수 있는데 "브라우저
       * 설정에서 허용해 주세요"라고 하면 틀린 안내다. 문구는 짧게 둔다 — 토스트는 한 줄이고(줄바꿈하지 않는다), 거절된
       * 뒤의 자세한 안내는 상태(`denied`)가 바뀐 화면이 한다.
       */
      const granted = await permission;
      if (granted === "denied") {
        track("push_denied", { source });
        throw new Error("브라우저에서 알림이 차단돼 있어요.");
      }
      if (granted !== "granted") throw new Error("알림을 허용해야 켤 수 있어요.");

      const supabase = requireBrowserSupabase();
      const existing = await browserStep(getPushSubscription);
      // 옛 공개키에 묶인 구독은 내 것이어도 쓸 수 없다(발송이 거부된다) — 서버의 행을 지우고 새로 받는다
      if (existing !== null && !pushSubscriptionUsesKey(existing, env.vapidPublicKey)) {
        await supabase.from("profiles_push_subscription").delete().eq("endpoint", existing.endpoint);
        await browserStep(() => existing.unsubscribe());
      } else if (existing !== null) {
        const { data, error } = await buildOwnSubscriptionQuery(supabase, existing.endpoint);
        if (error) {
          console.error("[push] 구독 확인 실패:", error);
          throw new Error(await toWriteErrorMessage(supabase, error));
        }
        // 이미 내 구독이다(다른 탭에서 켰다) — 목표 상태라 그대로 성공이다
        if (data) return;
        // 내 것이 아니다 — 버리고 새 주소를 받는다(위 ⚠)
        await browserStep(() => existing.unsubscribe());
      }

      const subscription = await browserStep(() => subscribePush(env.vapidPublicKey));
      const row = serializePushSubscription(subscription);
      if (row === null) {
        await subscription.unsubscribe();
        throw new Error("이 브라우저에서는 알림을 켤 수 없어요.");
      }

      const { error } = await supabase
        .from("profiles_push_subscription")
        .insert({ ...row, user_id: user.id });
      if (!error) return;

      /*
       * 23505 — 이 주소의 행이 이미 있다. **내 행이면 목표 상태에 이미 도달한 것**이라 성공으로 흡수한다(두 탭에서
       * 동시에 켰다 — 브라우저는 같은 구독을 돌려주므로 뒤 탭의 insert가 앞 탭의 행과 부딪힌다). 여기서 구독을 버리면
       * 방금 정상 저장된 구독이 죽는다. 그대로 흘려도 안 된다 — `toDbErrorMessage`가 23505를 닉네임 문구로 접는다
       * (`api-and-db.md`의 "설명과 흡수" 표).
       */
      if (error.code === "23505") {
        const { data: mine } = await buildOwnSubscriptionQuery(supabase, row.endpoint);
        if (mine) return;
      }

      console.error("[push] 구독 저장 실패:", error);
      await subscription.unsubscribe();
      // 23505(남의 행이 그 주소를 쥐고 있다)·23514(브라우저가 준 주소·키가 형식 밖이다)는 사용자가 입력한 값이
      // 아니라서 일반 문구("입력한 내용을 다시 확인해 주세요")가 뜻이 어긋난다 → 할 수 있는 일을 말한다
      if (error.code === "23505" || error.code === "23514") {
        throw new Error("이 브라우저의 알림을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      throw new Error(await toWriteErrorMessage(supabase, error));
    },
    onSuccess: () => {
      toast("알림을 켰어요");
      track("push_enable", { source });
    },
    onError: (error) => toast(error.message),
    onSettled: refreshStatus,
  });

  const disableMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const subscription = await browserStep(getPushSubscription);
      // 브라우저에 구독이 없다 — 이미 목표 상태다(서버에 남은 행은 다음 발송이 정리한다)
      if (subscription === null) return;

      const supabase = requireBrowserSupabase();
      // ⚠ 서버의 행을 **먼저** 지운다 — 순서를 뒤집어 브라우저 구독부터 버리면, 삭제가 실패했을 때 지울 주소를 잃는다.
      // ⚠ RLS 위반·행 없음은 에러가 아니라 0행이다 — "이미 지워져 있음"도 목표 상태라 실패로 올리지 않는다(멱등)
      const { error } = await supabase
        .from("profiles_push_subscription")
        .delete()
        .eq("endpoint", subscription.endpoint);
      if (error) {
        console.error("[push] 구독 삭제 실패:", error);
        throw new Error(await toWriteErrorMessage(supabase, error));
      }
      await browserStep(() => subscription.unsubscribe());
    },
    onSuccess: () => {
      toast("알림을 껐어요");
      // 끄는 자리는 프로필뿐이다
      track("push_disable", { source: "profile" });
    },
    onError: (error) => toast(error.message),
    onSettled: refreshStatus,
  });

  const enableGuard = useDuplicateGuard(enableMutation);
  const disableGuard = useDuplicateGuard(disableMutation);

  return {
    /** ⚠ **클릭 핸들러에서 곧바로** 부른다 — 권한 요청이 이 호출 안에서 동기로 시작된다 */
    enable: () => {
      if (enableGuard.isLocked()) return;
      // ⚠ 권한 요청을 **잠그기 전에** 시작한다 — 여기서 동기로 던지면(알림 API가 없는 브라우저) 뮤테이션이 시작되지
      //   않아 자물쇠가 풀리지 않는다. `Promise.resolve`로 감싸는 것은 Promise를 돌려주지 않는 구현까지 받기 위해서다.
      const permission: Promise<NotificationPermission> =
        typeof Notification === "undefined"
          ? Promise.resolve("denied")
          : Promise.resolve(Notification.requestPermission());
      enableGuard.lock();
      enableMutation.mutate({ permission });
    },
    disable: () => {
      if (disableGuard.isLocked()) return;
      disableGuard.lock();
      disableMutation.mutate();
    },
    isPending: enableMutation.isPending || disableMutation.isPending,
    /**
     * **가장 최근에 시도한 쪽**의 실패 — 화면이 지속 표시로 남긴다(토스트는 곧 사라진다).
     * ⚠ `enable.error ?? disable.error`로 두지 않는다 — 뮤테이션의 error는 다음 호출까지 남아, 오래된 켜기 실패가
     *   방금의 끄기 결과를 가린다(`linked-accounts.tsx`가 같은 함정을 적어 두었다).
     */
    error:
      enableMutation.submittedAt >= disableMutation.submittedAt
        ? enableMutation.error
        : disableMutation.error,
  };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { unsubscribePush } from "@/shared/lib";
import { rememberAuthProvider } from "../lib/last-auth-provider";
import { clearSignOutIntent } from "../lib/sign-out-intent";
import { useSessionStore } from "./session-store";

/**
 * supabase 세션 ↔ zustand 스토어 동기화, 그리고 **유저가 바뀔 때의 캐시 리싱크**.
 *
 * `onAuthStateChange`는 구독 즉시 INITIAL_SESSION 이벤트를 발행하므로
 * `getSession()`을 따로 호출하지 않아도 "복원 완료" 시점을 알 수 있다.
 * (@supabase/auth-js 2.110 GoTrueClient 구현 확인)
 *
 * ⚠ `AuthProvider`를 통해서만 마운트된다 — 앱 전체에 **하나**여야 한다.
 *   두 번 부르면 구독이 둘이 되어 유저가 바뀔 때 전량 무효화가 두 번 돈다.
 * ⚠ `useQueryClient`를 쓰므로 `QueryClientProvider` 안쪽이어야 한다.
 */
export function useSessionSync() {
  const applySession = useSessionStore((s) => s.applySession);
  const queryClient = useQueryClient();
  /**
   * 리싱크를 **다음 커밋으로 미루기 위한** 신호. 값 자체에는 뜻이 없고, 이 훅이 사는
   * `AuthProvider`를 한 번 더 렌더시키는 것이 목적이다(아래 리싱크 effect 주석).
   */
  const [resyncNonce, setResyncNonce] = useState(0);
  /**
   * 지금 캐시가 **누구 기준으로** 채워져 있는가. `undefined`는 "아직 첫 이벤트 전"이다.
   *
   * ⚠ **이벤트 이름으로 리싱크를 판정하지 않는다.** auth-js 2.110은 저장된 세션을 복원할 때마다
   *   (`_recoverAndRefresh`) `SIGNED_IN`을 발행하고, 다른 탭이 열릴 때도 BroadcastChannel로 같은
   *   이벤트가 온다. 이름만 보면 로그인 사용자는 **페이지를 열 때마다** 서버가 그려 준 데이터를
   *   전량 버리고 다시 조회한다(실측: 하이드레이션 직후 3건).
   * ⚠ 첫 이벤트는 기준만 세우고 리싱크하지 않는다 — 그때의 캐시는 비어 있거나 **같은 쿠키
   *   세션으로 SSR한** 값이다. OAuth 복귀도 전체 페이지 로드라 캐시가 새로 시작한다.
   */
  const cacheUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    /**
     * ⚠ supabase-js를 **동적으로** 불러온다. 이 훅은 루트 layout(`AppProviders`)에 실려 모든 라우트의
     *   초기 JS에 들어가는데, 정적으로 import하면 supabase-js 전체(realtime 포함, gzip 약 69KB)가
     *   404·에러 화면처럼 조회가 하나도 없는 라우트에서도 하이드레이션 **전에** 내려간다.
     *   조회가 있는 라우트는 쿼리 훅이 같은 모듈을 정적으로 갖고 있어 이 import가 곧바로 풀린다(왕복이
     *   늘지 않는다). 구독이 마이크로태스크 하나 늦어질 뿐이고, `onAuthStateChange`는 구독 즉시
     *   INITIAL_SESSION을 내므로 놓치는 이벤트가 없다. 배럴 경로 그대로다(deep import 규칙).
     */
    import("@/shared/api")
      .then(({ getBrowserSupabase }) => {
        if (cancelled) return;
        const supabase = getBrowserSupabase();
        if (!supabase) {
          // env 미설정 — loading에 갇히면 모든 화면이 영원히 스켈레톤이 된다. guest로 확정.
          applySession(null);
          return;
        }

        // ⚠ 콜백을 async로 만들지 않는다.
        //   @supabase/auth-js 2.110에서 async 오버로드는 @deprecated이며,
        //   TOKEN_REFRESHED 처리 중 중첩 리프레시가 나면 데드락된다.
        //   콜백 안에서 supabase.auth.*를 다시 호출하는 것도 같은 이유로 금지.
        ({
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
      applySession(session);

      // 이번 세션이 어느 프로바이더로 섰는지 남긴다 — 로그인 화면의 "최근 사용" 배지가 읽는다.
      // ⚠ **이벤트를 가리지 않는다.** 복원이 INITIAL_SESSION으로도(SIGNED_IN으로도) 오므로
      //   어느 쪽이 먼저 오든 값이 채워지게 한다.
      // ⚠ SIGNED_OUT은 session이 null이라 아무 일도 일어나지 않는다 — 로그아웃으로 지우면
      //   정작 필요한 순간(다시 왔을 때)에 값이 없다.
      rememberAuthProvider(session?.user.app_metadata.provider);

      // 가드가 소비하지 못한 로그아웃 신호를 여기서 버린다 — 가드가 없는 화면(목록)에서
      // 로그아웃하면 신호가 남고, 그대로 두면 다음 세션 만료가 "직접 로그아웃"으로 오인된다.
      if (event === "SIGNED_IN") clearSignOutIntent();

      // 로그인·로그아웃 시 개인화된 데이터(`isWatched`·댓글의 내 표·`나` 뱃지)를 전량 리싱크한다 —
      // 단 **유저가 실제로 바뀐 경우에만**(이 ref의 주석). TOKEN_REFRESHED·INITIAL_SESSION도
      // 유저가 바뀐 게 아니므로 제외 — 무효화하면 토큰 갱신마다 화면 전체가 리페치된다.
      // USER_UPDATED는 같은 유저라도 프로필 메타데이터가 바뀐 것이라 그대로 리싱크한다.
      const prevUserId = cacheUserIdRef.current;
      const nextUserId = session?.user.id ?? null;
      cacheUserIdRef.current = nextUserId;
      const userChanged = prevUserId !== undefined && prevUserId !== nextUserId;

      /*
       * 이 브라우저에 더는 그 사용자의 세션이 없다(로그아웃 · 세션 부정 · 다른 탭의 로그아웃 · 계정 전환 · **만료된 채
       * 돌아온 브라우저**) — **이 브라우저의 푸시 구독을 버린다.** 구독은 계정이 아니라 브라우저의 것이라, 남겨 두면 떠난 사람의 알림이
       * 이 기기에 계속 온다. 서버의 행은 세션이 이미 없어 여기서 지울 수 없지만, 푸시 서비스가 그 주소를 죽이므로
       * 다음 발송이 410을 받아 정리한다(`scripts/lib/transfer/notify.mjs`).
       * ⚠ 직접 로그아웃(`features/sign-out`)에만 걸지 않는다 — 세션이 사라지는 경로가 여럿인데 이 콜백이 전부 받는다.
       * ⚠ supabase를 부르지 않는 브라우저 API라 이 콜백에서 불러도 된다(위 ⚠의 금지는 `supabase.auth.*`다).
       *   기다리지 않는다 — 실패해도 세션 정리를 막을 일이 아니고, 다음 사용자가 알림을 켤 때 남은 구독을 다시 거른다.
       * ⚠ **첫 이벤트가 "세션 없음"인 경우도 포함한다**(`prevUserId`가 `undefined`). 세션이 만료된 채 다시 연 브라우저는
       *   로그아웃 이벤트를 거치지 않는다 — 그 경로를 빼면 떠난 사람의 알림이 그 기기에 계속 온다. 구독이 없는 브라우저
       *   (대부분의 비로그인 방문)에서는 등록된 워커가 없어 아무 일도 하지 않는다.
       */
      /*
       * ⚠ 첫 이벤트의 "세션 없음"은 **쿠키가 실제로 없을 때만** 믿는다. auth-js는 만료된 토큰의 갱신이 일시 장애
       *   (네트워크·5xx)로 실패하면 세션을 쿠키에 그대로 둔 채 첫 이벤트를 `null`로 낸다 — 그때 구독을 버리면 인증
       *   서버가 잠깐 죽은 시간대의 방문자 전원이 알림을 조용히 잃는다(세션은 곧 스스로 복구된다). 세션이 정말 끝났으면
       *   쿠키도 지워져 있다.
       */
      const hasSessionCookie = /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/.test(document.cookie);
      const sessionGone =
        nextUserId === null && (typeof prevUserId === "string" || (prevUserId === undefined && !hasSessionCookie));
      const switchedUser = typeof prevUserId === "string" && nextUserId !== null && prevUserId !== nextUserId;
      if (sessionGone || switchedUser) {
        unsubscribePush().catch((e) => console.error("[auth] 푸시 구독 해지 실패:", e));
      }
      if (
        event === "USER_UPDATED" ||
        ((event === "SIGNED_IN" || event === "SIGNED_OUT") && userChanged)
      ) {
        setResyncNonce((n) => n + 1);
      }
        }));
      })
      .catch((e) => {
        // 청크를 못 받았다(오프라인 등) — env 미설정과 같은 취급. loading에 가두지 않는다
        console.error("[auth] supabase 클라이언트 로드 실패:", e);
        applySession(null);
      });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [applySession]);

  /**
   * 캐시 리싱크 — **세션 변화가 화면에 반영된 다음 커밋에서** 돈다.
   *
   * ⚠ invalidateQueries만으로는 부족하다. 기본 refetchType이 "active"라
   *   **언마운트된(비활성) 쿼리는 stale 표시만 되고 데이터가 그대로 남는다.**
   *   그래서 A로 보던 상세를 떠났다가 B로 로그인하면 A의 개인화 값(관심 표시·내 표)이 한 프레임 노출됐다.
   *   비활성 캐시는 지우고(다시 열 때 새로 받는다), 활성 캐시만 무효화해
   *   화면 깜빡임 없이 리페치한다.
   * ⚠ 활성 쿼리는 리페치가 끝날 때까지 옛 데이터를 들고 있으므로, 유저별 데이터를
   *   담는 키는 **userId로 스코프**해야 그 창에서도 남의 값이 보이지 않는다
   *   (`identityKeys`·`profileKeys`가 그렇게 되어 있다).
   *
   * ⚠ **콜백 안에서 바로 부르면 안 된다.** `applySession`이 일으키는 리렌더는 비동기로
   *   배치되므로, 콜백 시점의 화면은 아직 **로그인 상태 그대로**다 — 로그인이 있어야만
   *   성립하는 활성 쿼리에까지 리페치가 나가고, 그 요청은 세션이 이미 사라졌으니 반드시
   *   실패한다(실측: 프로필에서 로그아웃하면 `useLinkedIdentitiesQuery`가
   *   `AuthSessionMissingError`로 죽어 콘솔에 실패로 찍혔다). `enabled`도 소용이 없다 —
   *   옵저버가 아직 낡은 props(userId 있음)로 살아 있기 때문이다.
   *   nonce를 거쳐 한 커밋 뒤로 미루면 그 쿼리들은 이미 언마운트되어(가드가 화면을
   *   스켈레톤으로 갈아치운다) **비활성 정리 대상**이 된다 — 실패할 요청 자체가 사라진다.
   * ⚠ 미뤄도 노출 시간은 늘지 않는다. 어차피 리페치가 끝날 때까지는 옛 데이터가 보이고,
   *   비활성 캐시 삭제는 다음 마운트보다 **먼저** 끝난다(같은 커밋의 정리 단계).
   */
  useEffect(() => {
    if (resyncNonce === 0) return; // 최초 마운트 — 리싱크할 이벤트가 아직 없다
    queryClient.removeQueries({ type: "inactive" });
    queryClient.invalidateQueries();
  }, [resyncNonce, queryClient]);
}

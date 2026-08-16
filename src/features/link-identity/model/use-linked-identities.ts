"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserIdentity } from "@supabase/supabase-js";
import { requireBrowserSupabase } from "@/shared/api";
import { ROUTES, type OAuthProvider } from "@/shared/config";
import { useDuplicateGuard } from "@/shared/lib";
import { identityKeys, toAuthErrorMessage } from "@/entities/session";

/**
 * 다른 로그인 수단을 이 계정에 연결한다.
 *
 * ⚠ **자동 연결이 닿지 않는 자리를 메우는 기능이다.** Supabase는 이메일이 같고 검증된
 *   경우에만 identity를 자동으로 합친다. 카카오는 이메일을 안 줄 수도 있고, 줘도 구글과
 *   주소가 다른 경우가 흔하다 → 그러면 같은 사람이 계정 2개를 갖게 된다.
 *
 * ⚠ **이미 계정이 갈린 뒤에는 실패한다.** `auth.identities`의 `(provider, provider_id)`가
 *   유니크라, 그 구글 계정이 이미 다른 유저에게 붙어 있으면 옮겨올 수 없다(`identity_already_exists`).
 *   재시도로는 **구조적으로 성공할 수 없으므로** 문구가 그 사실을 말해야 한다
 *   → `toAuthErrorMessage`에 identity 코드가 매핑되어 있다(entities/session/lib).
 *
 * ⚠ **가드를 훅 안에 둔다** — `useOAuthSignIn`과 같은 계약이다. `linkIdentity`도 호출마다
 *   PKCE code_verifier를 저장소에 덮어쓴 뒤 그 challenge를 담은 URL로 이동하므로, 두 호출이
 *   겹치면 저장된 verifier와 커밋된 내비게이션이 어긋나 돌아온 code를 교환할 수 없다.
 *   배럴이 맨 `mutate`를 내보내면 방어가 **호출자의 기억력**에 걸린다 → `start`만 노출한다.
 *
 * ⚠ 프로바이더로 나갔다 돌아오므로 성공 상태가 없다 — 페이지가 통째로 넘어간다.
 *   돌아오는 곳은 `/profile`이고, 그 화면이 `?error=`를 처리한다(app/profile/page.tsx).
 */
export function useLinkIdentity() {
  const mutation = useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: `${window.location.origin}${ROUTES.profile}` },
      });
      if (error) {
        console.error("[auth] 계정 연결 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
  });

  const guard = useDuplicateGuard(mutation.isPending);

  const start = (provider: OAuthProvider) => {
    if (guard.isLocked()) return;
    guard.lock();
    mutation.mutate(provider);
  };

  return { start, isPending: mutation.isPending, error: mutation.error };
}

/**
 * 연결 해제.
 *
 * ⚠ **마지막 하나는 끊을 수 없다.** 로그인 수단이 0개인 계정이 되면 그 사용자는 영영
 *   들어올 수 없다. supabase도 `single_identity_not_deletable`로 거부하지만, 그 전에
 *   화면에서 막고 이유를 설명한다.
 *
 * ⚠ **동기 가드가 필요하다** — `auth.identities`에서 **행이 사라지는** 뮤테이션이다
 *   (data-and-state.md의 판단 기준: "연타하면 되돌릴 수 없는 결과가 남는가").
 *   화면의 `canUnlink`는 리페치 전 stale 값이라, 두 항목의 해제를 같은 tick에 누르면
 *   둘 다 통과해 **로그인 수단이 0개가 될 수 있다.** 서버가 막아주기를 기대하지 않는다.
 */
export function useUnlinkIdentity() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (identity: UserIdentity) => {
      const supabase = requireBrowserSupabase();
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) {
        console.error("[auth] 연결 해제 실패:", error);
        throw new Error(toAuthErrorMessage(error));
      }
    },
    // 낙관적 업데이트가 없으므로 무효화 Promise를 반환한다 —
    // 리페치가 끝날 때까지 isPending을 유지해 목록이 갱신되기 전 재클릭을 막는다.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: identityKeys.all }),
  });

  const guard = useDuplicateGuard(mutation.isPending);

  const remove = (identity: UserIdentity) => {
    if (guard.isLocked()) return;
    guard.lock();
    mutation.mutate(identity);
  };

  return { remove, isPending: mutation.isPending, error: mutation.error };
}

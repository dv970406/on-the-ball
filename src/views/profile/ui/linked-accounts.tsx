"use client";

import { Link2, Unlink } from "lucide-react";
import { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABEL } from "@/shared/config";
import { Button, EmptyState, Skeleton } from "@/shared/ui";
import { useLinkedIdentitiesQuery } from "@/entities/session";
import { useLinkIdentity, useUnlinkIdentity } from "@/features/link-identity";

/**
 * 연결된 로그인 수단 — 카카오·구글을 한 계정에 붙인다.
 *
 * ⚠ **왜 필요한가**: Supabase는 이메일이 같고 검증된 경우에만 identity를 자동으로 합친다.
 *   카카오는 이메일을 안 줄 수도 있고, 줘도 구글과 주소가 다른 경우가 흔하다
 *   → 그러면 같은 사람이 계정 2개를 갖는다. 그 구멍을 사용자가 직접 메우는 화면이다.
 *
 * ⚠ **가입 직후에 연결하는 게 중요하다.** 이미 다른 프로바이더로 별도 계정을 만든 뒤에는
 *   연결이 실패한다 — `auth.identities`의 (provider, provider_id)가 유니크라 그 계정을
 *   옮겨올 수 없다. 그래서 실패 사유를 삼키지 않고 그대로 보여준다.
 *
 * ⚠ 중복 시작 가드는 **훅 안에 있다**(`start`·`remove`). 여기서 다시 짜지 않는다.
 */
export function LinkedAccounts({ userId }: { userId: string | undefined }) {
  const identities = useLinkedIdentitiesQuery(userId);
  const link = useLinkIdentity();
  const unlink = useUnlinkIdentity();

  const linked = identities.data ?? [];
  /** ⚠ 마지막 하나는 끊을 수 없다 — 로그인 수단이 0개면 영영 못 들어온다 */
  const canUnlink = linked.length > 1;

  /**
   * ⚠ **가장 최근 실패를 먼저 보여준다.** mutation의 error는 다음 호출까지 남으므로
   *   `link.error ?? unlink.error ?? …` 순으로 두면 **오래된 실패가 새 실패를 가린다**.
   *   조회 실패는 아래 EmptyState가 이미 말하고 있으므로 여기서는 제외한다(중복 낭독 방지).
   */
  const actionError = unlink.error?.message ?? link.error?.message ?? null;

  return (
    <section aria-labelledby="linked-heading" className="px-5 pt-7">
      <h2 id="linked-heading" className="text-[15px] font-semibold tracking-[-0.3px] text-ink">
        로그인 수단
      </h2>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-mute">
        연결해 두면 어느 쪽으로 로그인해도 같은 계정으로 들어옵니다.
      </p>

      {identities.isPending && (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {/* 보여줄 데이터가 없을 때만 전체 대체한다(data-and-state.md) */}
      {identities.error && !identities.data && (
        <EmptyState
          title="연결 정보를 불러오지 못했어요"
          description={identities.error.message}
          onRetry={() => void identities.refetch()}
        />
      )}

      {identities.data && (
        <ul className="mt-4 flex flex-col gap-2">
          {OAUTH_PROVIDERS.map((provider) => {
            const identity = linked.find((item) => item.provider === provider);
            const disabled = identity ? !canUnlink || unlink.isPending : link.isPending;
            return (
              <li
                key={provider}
                className="flex items-center gap-3 rounded-sm border border-hairline-cool px-4 py-3"
              >
                <span className="text-[14px] font-medium text-ink">
                  {OAUTH_PROVIDER_LABEL[provider]}
                </span>
                {identity && <span className="text-[12px] text-ink-mute-2">연결됨</span>}
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-auto"
                  icon={identity ? Unlink : Link2}
                  disabled={disabled}
                  onClick={() =>
                    identity ? unlink.remove(identity) : link.start(provider)
                  }
                >
                  {identity ? "해제" : "연결"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {identities.data && !canUnlink && (
        <p className="mt-2 text-[12px] leading-[1.6] text-ink-faint">
          로그인 수단이 하나뿐이라 해제할 수 없어요. 다른 수단을 먼저 연결해 주세요.
        </p>
      )}

      {actionError && (
        <p className="mt-3 text-[13px] leading-[1.5] text-crimson">
          {actionError}
        </p>
      )}
    </section>
  );
}

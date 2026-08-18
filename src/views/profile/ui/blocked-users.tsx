"use client";

import { avatarUrl } from "@/shared/config";
import { Avatar, Button, EmptyState, Skeleton } from "@/shared/ui";
import { useBlockedUsersQuery } from "@/entities/block";
import { useBlockRemoval } from "../model/use-block-removal";

/**
 * 차단한 사용자 — 해제할 수 있는 유일한 자리다.
 *
 * ⚠ **차단하면 그 사람의 글이 내 화면에서 사라지므로 오버플로 메뉴로 되돌아갈 경로가 없다.**
 *   이 섹션을 없애려면 대체 진입점을 먼저 만든다(`AuthStatus`의 프로필 링크와 같은 사정).
 *
 * ⚠ `userId`를 인자로 받는다 — 조회 훅이 세션을 직접 읽지 않기 때문이다(FSD).
 *   `LinkedAccounts`와 같은 시그니처·같은 구조.
 */
export function BlockedUsers({ userId }: { userId: string | undefined }) {
  const blocked = useBlockedUsersQuery(userId);
  const removal = useBlockRemoval();

  const items = blocked.data;

  return (
    <section aria-labelledby="blocked-heading" className="px-5 pt-7">
      <h2 id="blocked-heading" className="text-[15px] font-semibold tracking-[-0.3px] text-ink">
        차단한 사용자
      </h2>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-mute">
        차단하면 그 사람의 글과 댓글이 내 화면에서 보이지 않아요. 상대에게는 알리지 않습니다.
      </p>

      {blocked.isPending && (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {/* 보여줄 데이터가 없을 때만 전체 대체한다(data-and-state.md) */}
      {blocked.error && !items && (
        <EmptyState
          title="차단 목록을 불러오지 못했어요"
          description={blocked.error.message}
          onRetry={() => void blocked.refetch()}
        />
      )}

      {/* 비어 있는 것은 정상 상태다 — EmptyState로 크게 그리면 문제처럼 읽힌다 */}
      {items && items.length === 0 && (
        <p className="mt-4 text-[13px] leading-[1.6] text-ink-faint">차단한 사용자가 없어요.</p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.userId}
              className="flex items-center gap-3 rounded-sm border border-hairline-cool px-4 py-3"
            >
              <Avatar label={item.nickname} src={avatarUrl(item.avatarPath)} size={28} />
              <span className="text-[14px] font-medium text-ink">{item.nickname}</span>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto"
                disabled={removal.isRemoving(item.userId)}
                onClick={() => removal.remove(item.userId, item.nickname)}
              >
                {removal.isRemoving(item.userId) ? "해제 중…" : "해제"}
                {/* ⚠ `aria-label`을 쓰면 안 된다 — 콘텐츠를 **덮어써서** "해제"가 사라진다
                    (code-quality.md). 덧붙이려면 콘텐츠를 덮지 않는 sr-only 텍스트를 쓴다.
                    행이 여럿이라 이름이 전부 "해제"면 음성 제어로 지목할 수 없다. */}
                <span className="sr-only"> — {item.nickname}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* 토스트는 1.8초 뒤 사라진다 — 지속 표시를 함께 남긴다(둘은 경쟁하지 않는다) */}
      {removal.error && (
        <p className="mt-3 text-[13px] leading-[1.5] text-crimson">{removal.error.message}</p>
      )}
    </section>
  );
}

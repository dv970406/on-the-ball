"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { TransferCrest, useFollowedClubsQuery } from "@/entities/transfer";
import { useToggleClubFollow } from "@/features/follow-club";
import { Button, EmptyState, Icon, Skeleton, StaleBanner, buttonClassName } from "@/shared/ui";

interface FollowedClubsProps {
  userId: string | undefined;
  /**
   * 구단 고르는 시트를 연다.
   * ⚠ 시트를 여기서 렌더하지 않고 위로 올린다 — `Sheet`가 `absolute`라 스크롤 영역(`<main>`) 안에 두면 스크롤한
   *   만큼 화면 밖에 뜬다(`SignInDialog`를 뷰가 한 벌 두는 것과 같은 이유).
   */
  onOpenPicker: () => void;
}

/**
 * 응원 구단 — 고른 구단의 목록과 고르는 시트의 진입점.
 *
 * 고른 구단은 이적시장 보드의 구단 칩 맨 앞에 놓인다(`views/transfer-board`). 조회는 `entities/transfer`,
 * 쓰기는 `features/follow-club`이다.
 *
 * ⚠ 줄의 `빼기`와 시트의 체크는 **같은 훅·같은 캐시**를 쓴다 — 한쪽에서 바꾸면 다른 쪽이 곧바로 따라온다.
 * ⚠ **빼기 직후의 탭은 잠깐 무시한다**(`REMOVE_GUARD_MS`). 낙관적 토글이라 누르는 즉시 줄이 사라지는데, 그 자리로
 *   **다음 줄이 당겨 올라온다** — 더블탭의 두 번째 탭이 옆 구단의 `빼기`를, 마지막 줄이면 `구단 고르기`를 누른다
 *   (실측: 간격 80~250ms에서 구단 둘이 함께 빠졌다). 같은 구단의 연타를 막는 가드가 아니라 **자리가 바뀐 컨트롤**을
 *   막는 창이다(`Dialog`가 열린 직후의 스크림 탭을 무시하는 것과 같은 장치).
 * ⚠ 키보드로 빼면 눌렀던 버튼이 사라져 포커스가 `body`로 떨어진다 → 늘 남아 있는 `구단 고르기`로 옮긴다.
 */
/** 빼기 직후 이 섹션의 탭을 무시하는 창 — 더블탭 간격(보통 300ms 안)을 덮는다 */
const REMOVE_GUARD_MS = 400;

export function FollowedClubs({ userId, onOpenPicker }: FollowedClubsProps) {
  const follows = useFollowedClubsQuery({ userId });
  const toggle = useToggleClubFollow();
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  /** 마지막으로 뺀 시각(이벤트의 `timeStamp`) — 그 직후의 탭을 거르는 기준 */
  const lastRemovedAt = useRef(Number.NEGATIVE_INFINITY);
  const justRemoved = (timeStamp: number) => timeStamp - lastRemovedAt.current < REMOVE_GUARD_MS;

  return (
    <section aria-labelledby="clubs-heading" className="px-5 pt-7">
      <h2 id="clubs-heading" className="text-[15px] font-semibold tracking-[-0.3px] text-ink">
        응원 구단
      </h2>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-mute">
        고른 구단은 이적시장의 구단 필터 맨 앞에 놓이고, 알림을 켜면 새 딜 소식을 받아요.
      </p>

      {follows.isPending && <Skeleton className="mt-4 h-12 w-full" />}

      {/* 보여줄 데이터가 없을 때만 전체 대체한다(data-and-state.md) */}
      {follows.error && !follows.data && (
        <EmptyState
          title="응원 구단을 불러오지 못했어요"
          description={follows.error.message}
          onRetry={() => follows.refetch()}
        />
      )}

      {/* 캐시된 목록은 그대로 두고 최신화 실패만 알린다 */}
      {follows.error && follows.data && (
        <div className="mt-4">
          <StaleBanner noun="응원 구단" onRetry={() => follows.refetch()} />
        </div>
      )}

      {follows.data && follows.data.length === 0 && (
        <p className="mt-4 text-[13px] leading-[1.6] text-ink-mute-2">아직 고른 구단이 없어요.</p>
      )}

      {follows.data && follows.data.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {follows.data.map((club) => (
            <li
              key={club.code}
              className="flex items-center gap-3 rounded-sm border border-hairline-cool px-4 py-3"
            >
              <TransferCrest club={club} size={24} className="shrink-0" />
              <span className="min-w-0 truncate text-[14px] font-medium text-ink">{club.name}</span>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto shrink-0"
                onClick={(e) => {
                  // `userId`가 없으면 이 줄 자체가 그려지지 않는다(조회가 닫혀 있다) — 타입만 좁힌다
                  if (!userId || justRemoved(e.timeStamp)) return;
                  lastRemovedAt.current = e.timeStamp;
                  toggle.mutate({ club, following: true, userId });
                  pickerButtonRef.current?.focus({ preventScroll: true });
                }}
              >
                {/* 버튼마다 글자가 같아 무엇을 빼는지 이름에 싣는다(aria-label은 콘텐츠를 덮는다 — sr-only로 덧붙인다) */}
                <span className="sr-only">{club.name} </span>
                빼기
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* 목록을 못 받았으면 시트의 체크도 그릴 수 없다 — 받은 뒤에만 연다 */}
      {follows.data && (
        // `Button`이 아니라 생 `button`이다 — 포커스를 옮길 ref가 필요하다(외형은 같은 클래스 함수가 그린다)
        <button
          ref={pickerButtonRef}
          type="button"
          className={buttonClassName({ variant: "secondary", block: true, className: "mt-4" })}
          onClick={(e) => {
            // 마지막 줄을 뺀 직후에는 이 버튼이 그 자리로 올라온다
            if (!justRemoved(e.timeStamp)) onOpenPicker();
          }}
        >
          <Icon as={Plus} size={16} />
          구단 고르기
        </button>
      )}
    </section>
  );
}

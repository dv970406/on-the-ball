"use client";

import { useEffect, useId, useRef } from "react";
import { Check } from "lucide-react";
import {
  TRANSFER_LEAGUES,
  type TransferClub,
  TransferCrest,
  useFollowedClubsQuery,
  useTransferClubListQuery,
} from "@/entities/transfer";
import { useToggleClubFollow } from "@/features/follow-club";
import { EmptyState, Icon, Sheet, SheetItem, Skeleton, StaleBanner } from "@/shared/ui";

interface ClubPickerSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
}

/**
 * 응원 구단 고르는 시트 — 5대 리그 구단을 리그별로 늘어놓고 줄을 누르면 고르거나 푼다.
 *
 * ⚠ **여러 개를 고르는 시트라 누른다고 닫히지 않는다.** 닫기는 스크림·Escape·그래버다(`Sheet`).
 * ⚠ 구단 목록은 **열릴 때** 받는다(`enabled: open`) — 프로필을 여는 사람 대부분은 이 시트를 열지 않는다.
 *   구단 표는 파생이 채우는 운영 데이터라 한 번 받으면 세션 동안 다시 받지 않는다(그 훅의 staleTime).
 * ⚠ 선택 표시는 리그 시트(`views/transfer-board`의 `LeagueSheet`)와 같은 형태다 — 16px 체크 + `bg-canvas-soft`,
 *   비선택은 같은 폭의 빈칸. 체크 아이콘은 `aria-hidden`이라 sr-only "(선택됨)"을 함께 둔다.
 * ⚠ 두 조회가 **모두** 와야 줄을 그린다 — 내 응원 구단을 모르는 채로 줄을 누르면 "지금 상태"를 틀리게 넘긴다.
 * ⚠ **"지금 상태"를 prop만으로 판정하지 않는다.** 낙관적 갱신은 캐시를 곧바로 고치지만 이 컴포넌트의 값은 다음 렌더에야
 *   바뀌어, 그 사이의 두 번째 탭은 옛 값을 읽고 같은 방향 요청을 또 보낸다(`data-and-state.md` "같은 tick의 연타").
 *   마지막으로 요청한 상태를 ref에 동기로 적어 두고, 캐시가 따라오면 비운다.
 */
export function ClubPickerSheet({ open, onClose, userId }: ClubPickerSheetProps) {
  const clubs = useTransferClubListQuery({ enabled: open });
  const follows = useFollowedClubsQuery({ userId });
  const toggle = useToggleClubFollow();
  const headingPrefix = useId();

  const followed = new Set((follows.data ?? []).map((club) => club.code));

  /** 구단 코드 → 방금 요청한 상태(고름 true · 풂 false). 캐시가 그 상태가 되면 지운다 */
  const requested = useRef(new Map<string, boolean>());
  useEffect(() => {
    const codes = new Set((follows.data ?? []).map((club) => club.code));
    for (const [code, state] of requested.current) {
      if (codes.has(code) === state) requested.current.delete(code);
    }
  }, [follows.data]);

  const handleToggle = (club: TransferClub, selected: boolean) => {
    if (!userId) return;
    const current = requested.current.get(club.code) ?? selected;
    requested.current.set(club.code, !current);
    toggle.mutate({ club, following: current, userId });
  };
  const error = clubs.error ?? follows.error;
  const ready = clubs.data !== undefined && follows.data !== undefined;

  return (
    <Sheet open={open} onClose={onClose} label="응원 구단 고르기">
      {!ready && !error && (
        <div aria-hidden className="flex flex-col gap-2 px-5 py-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}

      {!ready && error && (
        <EmptyState
          title="구단 목록을 불러오지 못했어요"
          description={error.message}
          onRetry={() => {
            clubs.refetch();
            follows.refetch();
          }}
        />
      )}

      {/* 받아 둔 목록은 그대로 두고 최신화 실패만 알린다(data-and-state.md) */}
      {ready && error && (
        <div className="px-5 pb-1">
          <StaleBanner
            noun="구단 목록"
            onRetry={() => {
              clubs.refetch();
              follows.refetch();
            }}
          />
        </div>
      )}

      {/* 구단 표가 아직 채워지지 않았다(딜 파생이 구단을 쓴다) — 빈 시트로 두면 고장으로 읽힌다 */}
      {ready && clubs.data.length === 0 && (
        <p className="px-5 py-6 text-center text-[13px] leading-[1.6] text-ink-mute-2">
          고를 수 있는 구단이 아직 없어요.
        </p>
      )}

      {ready &&
        TRANSFER_LEAGUES.map((league, index) => {
          const items = clubs.data.filter((club) => club.league === league);
          if (items.length === 0) return null;
          // 리그명에는 공백이 있어(`세리에 A`) id로 쓸 수 없다 — 노출 순서의 자리 번호로 만든다
          const headingId = `${headingPrefix}-${index}`;
          return (
            <section key={league} aria-labelledby={headingId}>
              <h2 id={headingId} className="px-5 pb-1 pt-3 text-[12px] font-medium text-ink-mute-2">
                {league}
              </h2>
              <ul>
                {items.map((club) => {
                  const selected = followed.has(club.code);
                  return (
                    <li key={club.code} className={selected ? "bg-canvas-soft" : undefined}>
                      <SheetItem onClick={() => handleToggle(club, selected)}>
                        <span aria-hidden className="inline-flex w-4 shrink-0 justify-center">
                          {selected && <Icon as={Check} size={16} />}
                        </span>
                        <TransferCrest club={club} size={24} className="shrink-0" />
                        <span className="min-w-0 truncate">{club.name}</span>
                        {selected && <span className="sr-only">(선택됨)</span>}
                      </SheetItem>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
    </Sheet>
  );
}

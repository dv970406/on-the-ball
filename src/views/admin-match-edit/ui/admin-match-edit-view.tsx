"use client";

import type { ReactNode } from "react";
import { ROUTES } from "@/shared/config";
import { toKstInputValue } from "@/shared/lib";
import { Button, EmptyState, Skeleton, StaleBanner } from "@/shared/ui";
import { useAdminMatchQuery, useTeamListQuery } from "@/entities/match";
import { MatchForm } from "@/features/admin-match";
import { SubHeader } from "@/widgets/sub-header";
import { useMatchEdit } from "../model/use-match-edit";

/**
 * 경기 수정.
 *
 * ⚠ **조건부 셸 패턴**(`PostEditView` 선례) — 헤더는 어느 분기에서나 그대로 두고 본문만 바꾼다.
 * ⚠ 캐시에 경기가 있으면 에러 화면으로 갈아치우지 않는다 — 폼이 언마운트되면 입력 중이던
 *   내용이 사라진다.
 */
export function AdminMatchEditView({ matchId }: { matchId: number }) {
  const match = useAdminMatchQuery(matchId);
  const teams = useTeamListQuery();
  const edit = useMatchEdit(matchId);

  const shell = (body: ReactNode) => (
    <>
      <SubHeader title="경기 수정" fallbackHref={ROUTES.adminMatchList} />
      <main className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto">
        <h1 className="sr-only">경기 수정</h1>
        {body}
      </main>
    </>
  );

  if (match.isPending || teams.isPending) {
    return shell(
      <div className="flex flex-col gap-3 px-5 pt-5">
        <Skeleton className="h-[50px] w-full" />
        <Skeleton className="h-[50px] w-full" />
        <Skeleton className="h-[50px] w-full" />
      </div>,
    );
  }
  if (match.error && !match.data) {
    return shell(
      <EmptyState
        title="경기를 불러오지 못했어요"
        description={match.error.message}
        onRetry={() => match.refetch()}
      />,
    );
  }
  if (!match.data) {
    return shell(
      <EmptyState title="경기를 찾을 수 없어요" description="이미 지워졌을 수 있어요." />,
    );
  }

  const data = match.data;

  return shell(
    <>
      {match.error && <StaleBanner noun="경기" onRetry={() => match.refetch()} />}

      {data.adminLockedAt !== null && (
        <div className="mx-5 mt-4 flex items-center gap-3 rounded-sm border border-hairline-cool bg-canvas-soft px-4 py-3">
          <p className="min-w-0 flex-1 text-[12px] leading-[1.6] text-ink-mute">
            이 경기는 <b className="font-medium text-ink">동기화 잠금</b> 상태예요. 자동 가져오기가
            건드리지 않습니다.
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={edit.isUnlocking}
            onClick={edit.unlock}
          >
            {edit.isUnlocking ? "푸는 중…" : "잠금 풀기"}
          </Button>
        </div>
      )}

      <MatchForm
        initial={{
          season: data.season,
          matchday: String(data.matchday),
          homeTeam: data.homeTeam.code,
          awayTeam: data.awayTeam.code,
          kickoffAt: toKstInputValue(data.kickoffAt),
          homeScore: data.homeScore === null ? "" : String(data.homeScore),
          awayScore: data.awayScore === null ? "" : String(data.awayScore),
          voided: data.isVoided,
        }}
        teams={teams.data ?? []}
        isPending={edit.isPending}
        error={edit.error}
        onSubmit={edit.submit}
      />
    </>,
  );
}

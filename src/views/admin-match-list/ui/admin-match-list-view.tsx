"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { formatKickoff, useQueryNowMs } from "@/shared/lib";
import { Button, EmptyState, Pill, Skeleton, StaleBanner, buttonClassName } from "@/shared/ui";
import { useAdminMatchListQuery } from "@/entities/match";
import { AdminFilterRail, AdminShell } from "@/widgets/admin-shell";
import { useMatchRowActions } from "../model/use-match-row-actions";
import { useMatchSync } from "../model/use-match-sync";

/**
 * 어드민 승부예측 목록.
 *
 * ⚠ 필터 상태는 **URL이 소유한다**(`?deleted=1`) — 서버 page가 읽어 prop으로 내린다
 *   (`useSearchParams`는 프리렌더를 CSR로 떨어뜨린다).
 */
export function AdminMatchListView({ deleted }: { deleted: boolean }) {
  const { data, dataUpdatedAt, isPending, error, refetch } = useAdminMatchListQuery(deleted);
  // ⚠ 세션 고정 시계가 아니라 **이 목록을 받은 시각**으로 판정한다(등록 직후 상태가 어긋난다)
  const nowMs = useQueryNowMs(dataUpdatedAt);
  const rows = useMatchRowActions();
  const sync = useMatchSync();

  return (
    <AdminShell>
      <h1 className="sr-only">승부예측 관리</h1>

      <section className="border-b border-hairline-cool px-5 py-4">
        <Button variant="dark" block disabled={sync.isPending} onClick={sync.start}>
          {sync.isPending ? "가져오는 중…" : "경기 일정 가져오기"}
        </Button>
        <p className="mt-2 text-[12px] leading-[1.6] text-ink-mute">
          제공자 API에서 이번 시즌 일정·결과를 받아 저장해요. 어드민이 수정해 잠긴 경기는
          건너뜁니다.
        </p>

        {/*
          ⚠ 토스트는 1.8초 뒤 사라진다 — 실패 문구는 화면에도 남긴다(`code-quality.md`).
          훅이 이미 한국어로 바꿔 던진 메시지를 그대로 노출한다.
        */}
        {sync.error && (
          <p className="mt-3 text-[13px] leading-[1.5] text-crimson">{sync.error.message}</p>
        )}

        {sync.result && (
          <div className="mt-3 rounded-sm border border-hairline-cool bg-canvas-soft px-3.5 py-3 text-[12px] leading-[1.7] text-ink-mute">
            <p>
              {sync.result.season} · 경기 {sync.result.matches.saved}건 저장
              {sync.result.matches.locked > 0 && ` · 잠금 ${sync.result.matches.locked}건 건너뜀`}
              {sync.result.matches.skipped > 0 && ` · 미시도 ${sync.result.matches.skipped}건`}
              {sync.result.matches.failed > 0 && ` · 실패 ${sync.result.matches.failed}건`}
            </p>
            {/*
              ⚠ **중단은 반드시 말한다.** `aborted`는 계통적 실패일 수도, 행 단위 재시도
                상한을 넘긴 것일 수도 있다 — 어느 쪽이든 **일정이 다 들어오지 않은 상태**라
                관리자가 다시 눌러야 하는데, 위 숫자만 보면 성공으로 읽힌다.
            */}
            {sync.result.matches.aborted && (
              <p className="text-crimson">
                중단됐어요 — 일정이 다 들어오지 않았습니다. 다시 눌러 주세요.
              </p>
            )}
            {/* ⚠ 경고를 삼키지 않는다 — 한국어 표기 없는 팀·스코어를 못 읽은 경기가 여기로 온다 */}
            {sync.result.warnings.map((warning) => (
              <p key={warning} className="text-crimson">
                {warning}
              </p>
            ))}
          </div>
        )}
      </section>

      <AdminFilterRail basePath={ROUTES.adminMatchList} deleted={deleted} />

      {isPending && (
        <div className="flex flex-col gap-2 px-5 pt-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {/* 보여줄 데이터가 없을 때만 화면을 갈아치운다 */}
      {error && !data && (
        <EmptyState
          title="경기를 불러오지 못했어요"
          description={error.message}
          onRetry={() => refetch()}
        />
      )}
      {error && data && <StaleBanner noun="경기" onRetry={() => refetch()} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title={deleted ? "숨긴 경기가 없어요" : "경기가 없어요"}
          description={deleted ? undefined : "위의 '경기 일정 가져오기'를 눌러 주세요."}
        />
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col">
          {data.map((match) => (
            <li
              key={match.id}
              className="flex items-center gap-3 border-b border-hairline-cool px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] text-ink-mute-2">
                  <span className="font-mono tabular-nums">
                    {match.season} · R{match.matchday}
                  </span>
                  {match.isVoided && <Pill variant="crimson">취소</Pill>}
                  {match.adminLockedAt !== null && <Pill variant="yellow">잠금</Pill>}
                  {match.deletedAt !== null && <Pill variant="outline">숨김</Pill>}
                </p>
                <p className="mt-1 truncate text-[14px] font-medium text-ink">
                  {match.homeTeam.name}
                  <span className="px-1.5 font-mono tabular-nums text-ink-mute">
                    {match.homeScore === null ? "vs" : `${match.homeScore}-${match.awayScore}`}
                  </span>
                  {match.awayTeam.name}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-mute">
                  {formatKickoff(match.kickoffAt, nowMs)}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-1.5">
                {match.deletedAt === null ? (
                  <>
                    <Link
                      href={ROUTES.adminMatch(match.id)}
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                    >
                      수정
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={rows.isBusy(match.id)}
                      onClick={() => rows.remove(match.id)}
                    >
                      {rows.isBusy(match.id) ? "숨기는 중…" : "숨기기"}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={rows.isBusy(match.id)}
                    onClick={() => rows.restore(match.id)}
                  >
                    {rows.isBusy(match.id) ? "되돌리는 중…" : "되돌리기"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

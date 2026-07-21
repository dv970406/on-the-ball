"use client";

import { Settings, UserRound } from "lucide-react";
import { Avatar, Button, EmptyState, Icon, Pill, SectionHead, Skeleton } from "@/shared/ui";
import { formatCount } from "@/shared/lib";
import { useMyActivityQuery, type ActivityTrait } from "../model/use-my-activity";
import { RecentList } from "./recent-list";

// ---------------------------------------------------------------------------
// 프로필 아바타 그라데이션 — fanTeam에서 클럽 톤 매칭, 없으면 뉴트럴
// ---------------------------------------------------------------------------

const CLUB_TONES: [needle: string, gradient: string][] = [
  ["아스널", "linear-gradient(135deg, #9c0d1e 0%, #ef0107 100%)"],
  ["토트넘", "linear-gradient(135deg, #0b1a4a 0%, #24357a 100%)"],
  ["맨유", "linear-gradient(135deg, #7a1010 0%, #da291c 100%)"],
  ["맨시티", "linear-gradient(135deg, #4f93c4 0%, #6cabdd 100%)"],
  ["첼시", "linear-gradient(135deg, #022f63 0%, #0d5cb0 100%)"],
  ["리버풀", "linear-gradient(135deg, #7a0c1e 0%, #c8102e 100%)"],
];

const NEUTRAL_TONE = "linear-gradient(135deg, #4a4a4a 0%, #171717 100%)";

function avatarGradient(fanTeam: string | null): string {
  if (!fanTeam) return NEUTRAL_TONE;
  const matched = CLUB_TONES.find(([needle]) => fanTeam.includes(needle));
  return matched ? matched[1] : NEUTRAL_TONE;
}

/** 가입일 "2024.03" 표기 (ISO 문자열 → 로컬 연/월) */
function formatJoined(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// 섹션 컴포넌트
// ---------------------------------------------------------------------------

/** 나의 축구 성향 다크 카드 */
function TraitCard({ trait }: { trait: ActivityTrait }) {
  return (
    <div className="px-5 py-6">
      <div className="rounded-xl bg-canvas-night p-[18px] text-white">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.6px] text-primary">
          ▸ 나의 축구 성향
        </p>
        <p className="mb-3 text-lg font-semibold leading-[1.35] tracking-[-0.3px]">
          “{trait.title} — {trait.text}”
        </p>
        <p className="font-mono text-[10px] text-ink-mute-2">
          최근 60일 데이터 기반 · 월 1회 갱신
        </p>
      </div>
    </div>
  );
}

/** 로딩 스켈레톤 — 프로필/스탯/리스트 구조 유지 */
function ActivitySkeleton() {
  return (
    <div className="px-5 pt-14">
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-[62px] rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-44" />
        </div>
      </div>
      <Skeleton className="mt-5 h-[74px] rounded-[14px]" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}

/** 내 활동 탭 화면 */
export function ActivityView() {
  const { data, isPending, isError, error, refetch } = useMyActivityQuery();

  if (isPending) return <ActivitySkeleton />;

  if (isError) {
    return (
      <EmptyState
        icon={UserRound}
        title="내 활동을 불러오지 못했어요"
        description={error instanceof Error ? error.message : undefined}
        action={
          <Button variant="dark" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        }
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={UserRound}
        title="세션을 만들지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
        action={
          <Button variant="dark" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        }
      />
    );
  }

  const { profile, stats, recent, trait } = data;

  const statCells: [label: string, value: string][] = [
    ["투표", formatCount(stats.votes)],
    ["퀴즈", formatCount(stats.quizzes)],
    ["연속", `${stats.streak}일`],
    ["정답률", `${stats.accuracyPct}%`],
  ];

  return (
    <div>
      <div className="px-5 pb-5 pt-14">
        {/* 프로필 헤더 */}
        <div className="mb-[18px] flex items-center gap-3.5">
          <Avatar
            size={62}
            label={profile.nickname}
            className="border-0 text-2xl font-bold text-white"
            style={{ background: avatarGradient(profile.fanTeam) }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-ink">{profile.nickname}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {profile.fanTeam ? (
                <Pill variant="soft">{profile.fanTeam}</Pill>
              ) : (
                <Pill variant="soft" className="text-ink-mute">
                  팬 태그 미설정
                </Pill>
              )}
              <Pill variant="outline" className="font-mono tnum">
                {formatJoined(profile.joinedAt)} 가입
              </Pill>
            </div>
          </div>
          <button
            type="button"
            aria-label="설정"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline-cool bg-canvas-soft text-ink"
          >
            <Icon as={Settings} size={16} />
          </button>
        </div>

        {/* 4열 스탯 */}
        <div className="grid grid-cols-4 divide-x divide-hairline-cool rounded-[14px] border border-hairline py-3.5">
          {statCells.map(([label, value]) => (
            <div key={label} className="text-center">
              <p className="font-mono text-lg font-semibold text-ink tnum">{value}</p>
              <p className="mt-0.5 text-[11px] text-ink-mute">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 최근 한 표 */}
      <SectionHead title="최근 한 표" />
      <RecentList items={recent} />

      {/* 나의 축구 성향 */}
      <TraitCard trait={trait} />
    </div>
  );
}

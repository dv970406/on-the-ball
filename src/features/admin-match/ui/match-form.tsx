"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Button, Chip, Sheet, SheetItem, TextField } from "@/shared/ui";
import type { AdminMatchInput } from "../model/use-admin-match-mutations";
import { type MatchDraft, type MatchFieldErrors, validateMatch } from "../lib/match-schema";

export interface TeamOption {
  code: string;
  name: string;
  shortName: string;
}

interface MatchFormProps {
  initial: MatchDraft;
  teams: TeamOption[];
  isPending: boolean;
  /** 훅이 이미 한국어로 바꿔 던진 서버 에러 */
  error?: Error | null;
  onSubmit: (input: AdminMatchInput) => void;
}

/**
 * 경기 수정 폼.
 *
 * ⚠ **`result`를 다루지 않는다.** 스코어에서 파생된 generated 컬럼이라 값을 실으면
 *   Postgres가 superuser에게도 거부한다(타입은 통과시키므로 런타임에만 죽는다).
 * ⚠ **드롭다운 컴포넌트가 이 프로젝트에 없다** — 팀 선택은 `Sheet` + `SheetItem`이다
 *   (선택 UI의 선례가 `Chip` 토글과 바텀시트 목록 둘뿐이다).
 * ⚠ 중복 실행 가드는 여기 두지 않는다. `isPending`을 prop으로 받는 컴포넌트는 부모가
 *   리렌더되기 전까지 낡은 값을 읽어 **첫 실패 이후 영영 제출할 수 없게 된다**(실측) —
 *   가드는 뮤테이션을 조립하는 뷰가 갖는다.
 */
export function MatchForm({ initial, teams, isPending, error, onSubmit }: MatchFormProps) {
  const [draft, setDraft] = useState<MatchDraft>(initial);
  const [errors, setErrors] = useState<MatchFieldErrors>({});
  const [picking, setPicking] = useState<"home" | "away" | null>(null);

  const change = <K extends keyof MatchDraft>(key: K, value: MatchDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined, form: undefined }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = validateMatch(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.value);
  };

  const teamLabel = (code: string) =>
    teams.find((team) => team.code === code)?.name ?? (code || "고르기");

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-10 pt-5">
        <TextField
          label="시즌"
          value={draft.season}
          error={errors.season}
          hint="2025-26 형태"
          onChange={(e) => change("season", e.target.value)}
        />
        <TextField
          label="라운드"
          inputMode="numeric"
          value={draft.matchday}
          error={errors.matchday}
          hint="1 ~ 38"
          onChange={(e) => change("matchday", e.target.value)}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-[13px] font-medium text-ink">맞대결</legend>
          <div className="grid grid-cols-2 gap-2">
            <TeamPicker
              label="홈"
              value={teamLabel(draft.homeTeam)}
              error={errors.homeTeam}
              onOpen={() => setPicking("home")}
            />
            <TeamPicker
              label="원정"
              value={teamLabel(draft.awayTeam)}
              error={errors.awayTeam}
              onOpen={() => setPicking("away")}
            />
          </div>
        </fieldset>

        <TextField
          label="킥오프 (한국 시각)"
          type="datetime-local"
          value={draft.kickoffAt}
          error={errors.kickoffAt}
          hint="예측 마감이 곧 이 시각이에요"
          onChange={(e) => change("kickoffAt", e.target.value)}
        />

        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="홈 스코어"
            inputMode="numeric"
            value={draft.homeScore}
            error={errors.homeScore}
            onChange={(e) => change("homeScore", e.target.value)}
          />
          <TextField
            label="원정 스코어"
            inputMode="numeric"
            value={draft.awayScore}
            error={errors.awayScore}
            onChange={(e) => change("awayScore", e.target.value)}
          />
        </div>
        <p className="text-[12px] leading-[1.6] text-ink-mute">
          스코어를 양쪽 다 비우면 &lsquo;결과 없음&rsquo;이 되고, 채우면 종료 처리돼요. 승패 판정은 DB가 하므로 따로 고르지 않아요.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">경기 상태</legend>
          <div className="flex gap-1.5">
            <Chip selected={!draft.voided} onClick={() => change("voided", false)}>
              정상
            </Chip>
            <Chip selected={draft.voided} onClick={() => change("voided", true)}>
              취소·몰수
            </Chip>
          </div>
        </fieldset>

        {errors.form && <p className="text-[13px] text-crimson">{errors.form}</p>}
        {error && <p className="text-[13px] text-crimson">{error.message}</p>}

        <p className="rounded-sm border border-hairline-cool bg-canvas-soft px-4 py-3 text-[12px] leading-[1.6] text-ink-mute">
          저장하면 이 경기에 <b className="font-medium text-ink">동기화 잠금</b>이 걸려요. 잠그지
          않으면 다음 일정 가져오기가 방금 고친 값을 되돌립니다.
        </p>

        <Button type="submit" block disabled={isPending}>
          {isPending ? "저장 중…" : "저장하기"}
        </Button>
      </form>

      {/*
        ⚠ 시트는 폼 **밖**에 둔다 — 안에 두면 시트 안의 버튼이 form 제출로 해석될 여지가 있고,
          `Sheet`가 absolute라 스크롤 컨테이너 안에서는 스크롤한 만큼 밀려난다.
      */}
      <Sheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        label={picking === "home" ? "홈 팀 고르기" : "원정 팀 고르기"}
      >
        {teams.map((team) => (
          <SheetItem
            key={team.code}
            onClick={() => {
              change(picking === "home" ? "homeTeam" : "awayTeam", team.code);
              setPicking(null);
            }}
          >
            {team.name}
          </SheetItem>
        ))}
      </Sheet>
    </>
  );
}

function TeamPicker({
  label,
  value,
  error,
  onOpen,
}: {
  label: string;
  value: string;
  error?: string;
  onOpen: () => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {/*
        에러를 컨트롤에 묶는다 — `TextField`가 하는 것과 같은 형태다.
        ⚠ `aria-invalid`는 쓰지 않는다: `button` 롤이 지원하지 않는 속성이라
          "틀린 ARIA는 없는 것보다 나쁘다"에 걸린다(린트도 잡는다). 연결은 describedby가 한다.
      */}
      <button
        id={id}
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-[50px] w-full rounded-sm border border-hairline-strong bg-canvas px-3.5 text-left text-[15px] text-ink"
      >
        {value}
      </button>
      {error && (
        <p id={`${id}-error`} className="text-[12px] text-crimson">
          {error}
        </p>
      )}
    </div>
  );
}

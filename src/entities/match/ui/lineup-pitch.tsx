import { preconnect } from "react-dom";
import { env } from "@/shared/config";
import { cn } from "@/shared/lib/cn";
import { buildPitchSpots } from "../lib/pitch-layout";
import { PHOTO_ORIGIN } from "../lib/player-photo";
import type { PlayerMarks } from "../lib/player-marks";
import type { MatchLineup, Team } from "../model/types";
import { PlayerBadges } from "./player-badges";
import { PlayerPhoto } from "./player-photo";

interface LineupPitchProps {
  home: MatchLineup;
  away: MatchLineup;
  homeTeam: Team;
  awayTeam: Team;
  /** 선수별 득점·카드·교체 표시 — 판정은 `lib/player-marks`가 단독으로 갖는다 */
  marks: Map<number, PlayerMarks>;
}

/**
 * 확정 라인업 — 두 팀을 한 피치에 마주 보게 그린다.
 *
 * ⚠ **`"use client"`를 붙이지 않지만, 지금은 클라이언트로 내려간다.** 유일한 소비자가
 *   `"use client"`인 `views/match-detail`이라 서버 컴포넌트 트리가 여기 닿는 경로가 없다 —
 *   디렉티브를 빼 두는 것은 **나중에 서버 컴포넌트가 직접 렌더할 여지**를 남기는 것이고,
 *   색인은 클라이언트 컴포넌트도 SSR HTML에 실리므로 디렉티브와 무관하게 이미 보장된다.
 *
 * ⚠ **피치를 초록으로 칠하지 않는다.** 참고 화면(네이버)은 초록 면을 쓰지만 이 디자인
 *   시스템에서 그건 뷰포트를 지배하는 컬러 이벤트가 되어 "눌러야 할 곳을 가리키는 색은
 *   하나"와 정면으로 부딪힌다. 입축구 분할 카드가 색을 쓰는 것은 **그 색이 선택지 자체**라
 *   콘텐츠이기 때문인데(DB가 준 값이다), 여기 초록은 장식이다 → 헤어라인으로 그린다.
 *   ⚠ 되돌리고 싶다면 `styling.md`에 예외를 등재하고 나서 한다.
 *
 * ⚠ **선수 사진은 제공자 CDN에서 온다.** 자산의 권리는 제공자에게 없고(약관이 게시 라이선스를
 *   주지 않는다) 초상권까지 겹치므로, 그 사실과 폴백은 `lib/player-photo`와 `PlayerPhoto`가
 *   진다 — 사진이 없는 선수는 등번호로 떨어진다.
 */
export function LineupPitch({ home, away, homeTeam, awayTeam, marks }: LineupPitchProps) {
  const homeSpots = buildPitchSpots(home.starters, "home");
  const awaySpots = buildPitchSpots(away.starters, "away");
  if (homeSpots.length === 0 && awaySpots.length === 0) return null;

  /*
   * ⚠ **사진이 뜨기 전에 연결을 열어 둔다.** 전부 `loading="lazy"`라 뷰포트에 들어와야
   *   요청이 나가는데, 그 시점에 DNS 3ms + TCP 33ms + TLS 40ms = **첫 바이트 전 75ms**
   *   (콜드 165ms)가 통째로 붙는다(실측) — 스크롤한 순간 빈 원이 그만큼 남는다.
   * ⚠ **라인업이 실제로 그려질 때만 부른다.** 사진이 없는 화면에서 열면 쓰지 않을 연결이다.
   */
  // ⚠ 사진을 끈 설정에서는 그 호스트로 요청이 하나도 나가지 않는다 — 미리 연결할 이유도 없다
  if (env.showPlayerPhotos) preconnect(PHOTO_ORIGIN);

  return (
    <section className="mt-6" aria-labelledby="lineup-heading">
      {/*
       * ⚠ **이름 없는 `<section>`은 스크린리더에게 그냥 `div`다.** 형제인 후보 명단·경기 기록은
       *   `<h2>`를 갖는데 여기만 없어서 라인업 블록이 목차에서 통째로 빠졌다.
       *   화면에는 팀 줄이 이미 맥락을 주므로 `sr-only`로 둔다(선례: `post-form`의 `h1`).
       */}
      <h2 id="lineup-heading" className="sr-only">
        선발 라인업
      </h2>
      <TeamRow team={homeTeam} lineup={home} />

      {/*
       * ⚠ 세로로 긴 비율이라야 22명이 겹치지 않는다. 430px 프레임에서 3:4는 약 573px인데,
       *   한 줄에 최대 5명이 서므로 자리당 폭이 86px로 이름 두 어절이 들어간다.
       */}
      <div className="relative mt-2 aspect-[3/4] overflow-hidden rounded-[14px] border border-hairline-cool bg-canvas-soft">
        {/* 하프라인 · 센터서클 — 피치라는 것을 형태로만 말한다 */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-hairline-cool" aria-hidden />
        <div
          className="absolute left-1/2 top-1/2 size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline-cool"
          aria-hidden
        />
        {/* 페널티 박스 — 정적 배치라 표준 유틸을 쓴다(애니메이션·트랜지션이 없다) */}
        <div
          className="absolute left-1/2 top-0 h-[12%] w-[46%] -translate-x-1/2 rounded-b-[4px] border border-t-0 border-hairline-cool"
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-1/2 h-[12%] w-[46%] -translate-x-1/2 rounded-t-[4px] border border-b-0 border-hairline-cool"
          aria-hidden
        />

        {/*
         * ⚠ **팀별로 그룹을 나눈다 — 안 나누면 낭독 순서가 팀과 어긋난다.** 한때 두 팀을 한
         *   배열로 이어 그려서 `홈 팀 줄 → 홈 11명 + 원정 11명 → 원정 팀 줄` 순서가 됐고,
         *   **원정 선수 전원이 원정 팀 이름보다 먼저 읽혔다.** 그룹에 이름을 주면 절대배치를
         *   그대로 두고도 순서가 뜻을 갖는다.
         */}
        {[
          { spots: homeSpots, team: homeTeam },
          { spots: awaySpots, team: awayTeam },
        ].map(({ spots, team }) => (
          <div key={team.code} role="group" aria-label={`${team.shortName} 선발`}>
            {spots.map(({ player, leftPct, topPct }) => (
          <div
            key={player.playerId}
            // ⚠ 런타임에 계산된 비율이라 `style`이 허용되는 자리다(`styling.md`).
            //   클래스로는 확정할 수 없다 — 값이 포메이션마다 달라진다.
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            className="absolute flex w-[19%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
          >
            <PlayerMarker
              externalId={player.externalId}
              rating={player.rating}
              marks={marks.get(player.playerId)}
            />
            {/*
             * ⚠ **자르지 않고 두 줄로 접는다.** 한 줄 `truncate`로 뒀더니 "크리스티안 모…"가
             *   되는데, **잘린 이름은 누구인지 알 수 없다** — 팀 약칭을 예측 버튼에 쓰는
             *   이유와 같은 문제이고, 여기서는 약칭이라는 대안이 없다.
             * ⚠ `break-keep`이라야 한국어가 어절 안에서 끊기지 않는다(공백에서만 접힌다).
             *   세 줄까지 가면 아래 줄과 겹치므로 두 줄에서 멈춘다.
             */}
            {/*
             * ⚠ **등번호를 이름 줄에 둔다.** 사진 위에 배지로 얹었더니 36px 원 주위에 배지가
             *   셋(번호·평점·사건)이 되어 얼굴을 덮었다 — 참고 화면도 번호를 이름 앞에 둔다.
             *   얼굴만으로는 누군지 고를 수 없으므로 번호 자체는 반드시 남아야 한다.
             */}
            <span className="line-clamp-2 w-full break-keep text-center text-[11px] leading-tight text-ink-secondary">
              {player.shirtNumber !== null ? (
                <span className="font-mono tabular-nums text-ink-mute">{player.shirtNumber} </span>
              ) : null}
              {player.name}
            </span>
          </div>
            ))}
          </div>
        ))}
      </div>

      <TeamRow team={awayTeam} lineup={away} align="end" />
    </section>
  );
}

/** 팀 이름 + 포메이션 + 감독 — 피치 위아래에 한 줄씩 */
function TeamRow({
  team,
  lineup,
  align = "start",
}: {
  team: Team;
  lineup: MatchLineup;
  align?: "start" | "end";
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-2 text-[13px]",
        align === "end" ? "mt-2 justify-end" : "justify-start",
      )}
    >
      <span className="font-semibold text-ink">{team.shortName}</span>
      {lineup.formation ? (
        <span className="font-mono text-[12px] tabular-nums text-ink-mute">{lineup.formation}</span>
      ) : null}
      {lineup.coachName ? (
        <span className="truncate text-[12px] text-ink-mute-2">감독 {lineup.coachName}</span>
      ) : null}
    </div>
  );
}

/**
 * 선수 사진 + 평점.
 *
 * ⚠ **등번호는 여기 없다 — 이름 줄이 갖는다.** 사진 폴백도 실루엣이라(`PlayerPhoto`)
 *   번호가 두 번 찍히지 않는다.
 *
 * ⚠ **평점에 색 구간을 두지 않는다.** 참고 화면은 초록·주황·빨강으로 나누지만, 그러면 한
 *   화면에 색 배지가 22개 생겨 팔레트 규약이 무너진다. 숫자 자체가 이미 정보를 지고 있어
 *   "색이 정보를 혼자 지지 않는다"도 만족한다.
 */
function PlayerMarker({
  externalId,
  rating,
  marks,
}: {
  externalId: string | null;
  rating: number | null;
  marks?: PlayerMarks;
}) {
  return (
    <span className="relative flex size-9 items-center justify-center">
      <PlayerPhoto externalId={externalId} size={36} />
      {rating !== null ? (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-[3px] bg-ink px-1 font-mono text-[10px] leading-[14px] tabular-nums text-canvas">
          {rating.toFixed(1)}
        </span>
      ) : null}
      {/*
       * 득점·카드·교체 — 원의 **오른쪽에 세로로** 쌓는다.
       * ⚠ 오른쪽 **위**에 두면 윗줄 선수의 이름을 침범한다(실측: 잭슨의 교체 화살표가
       *   부엔디아 이름 위에 겹쳤다) → 원의 세로 폭(36px) 안에 가둔다.
       */}
      {marks ? (
        <span className="absolute -right-2 top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5">
          <PlayerBadges marks={marks} />
        </span>
      ) : null}
    </span>
  );
}

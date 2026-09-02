import { ArrowUp } from "lucide-react";
import type { PlayerMarks } from "../lib/player-marks";
import type { LineupPlayer, MatchLineup, Team } from "../model/types";
import { PlayerBadges } from "./player-badges";
import { PlayerPhoto } from "./player-photo";

interface LineupBenchProps {
  home: MatchLineup;
  away: MatchLineup;
  homeTeam: Team;
  awayTeam: Team;
  /** 선수별 표시 — 피치와 **같은 맵**을 받는다(같은 사실이 두 모양으로 나가지 않게) */
  marks: Map<number, PlayerMarks>;
}

/**
 * 후보 선수 — 두 팀을 좌우로 나란히.
 *
 * ⚠ **`"use client"`를 붙이지 않는다**(`LineupPitch`와 같은 판단·같은 단서 — 지금 소비자는
 *   클라이언트 뷰 하나라 실제로는 클라이언트로 내려간다).
 *
 * ⚠ **출전하지 않은 선수를 숨기지 않는다.** 명단 자체가 정보라(누가 벤치에 앉아 있었는가)
 *   빼면 "이 팀은 교체 카드가 넷뿐이었다"로 읽힌다. 대신 평점이 없어 자연히 옅어진다.
 */
export function LineupBench({ home, away, homeTeam, awayTeam, marks }: LineupBenchProps) {
  if (home.bench.length === 0 && away.bench.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="bench-heading">
      <h2 id="bench-heading" className="text-center text-[14px] font-semibold text-ink">
        후보 선수
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-x-3 border-t border-hairline-cool pt-3">
        <BenchColumn team={homeTeam} players={home.bench} marks={marks} />
        <BenchColumn team={awayTeam} players={away.bench} marks={marks} />
      </div>
    </section>
  );
}

function BenchColumn({
  team,
  players,
  marks,
}: {
  team: Team;
  players: LineupPlayer[];
  marks: Map<number, PlayerMarks>;
}) {
  return (
    <div>
      <h3 className="truncate text-[13px] font-semibold text-ink">{team.shortName}</h3>
      {players.length === 0 ? (
        <p className="mt-2 text-[12px] text-ink-mute-2">명단이 없어요</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {players.map((player) => {
            const mark = marks.get(player.playerId);
            return (
              <li key={player.playerId} className="flex items-start gap-2">
                {/*
                 * 사진 — 없으면 등번호가 그 자리를 진다(`PlayerPhoto`의 폴백).
                 * ⚠ 사진이 떠도 등번호를 따로 그린다 — 얼굴만으로는 누군지 고를 수 없고,
                 *   참고 화면도 번호를 함께 둔다.
                 */}
                <PlayerPhoto externalId={player.externalId} size={24} />
                <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-[12px] tabular-nums text-ink-mute">
                  {player.shirtNumber ?? "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    {/*
                     * 투입된 선수만 화살표를 갖는다 — 명단에 남은 선수와 형태로 갈린다.
                     * ⚠ 색을 쓰지 않는다(참고 화면은 초록이다) — 방향이 이미 뜻을 진다.
                     */}
                    {mark?.inFor ? (
                      <span className="flex shrink-0 items-center">
                        <ArrowUp size={11} strokeWidth={2.5} className="text-ink" aria-hidden />
                        {/* ⚠ 아웃 화살표는 "N분 교체"를 낭독하는데 여기만 없었다 */}
                        <span className="sr-only">교체 투입</span>
                      </span>
                    ) : null}
                    {/*
                     * ⚠ 자르지 않고 두 줄로 접는다 — 사진이 가로를 먹으면서 "크리스티안
                     *   모스케…"가 다시 잘렸다. **잘린 이름은 누구인지 알 수 없다**(피치와
                     *   같은 판단이고, 팀과 달리 약칭이라는 대안이 없다).
                     */}
                    <span className="line-clamp-2 min-w-0 break-keep text-[12px] leading-tight text-ink-secondary">
                      {player.name}
                    </span>
                    {mark ? <PlayerBadges marks={mark} /> : null}
                  </span>
                  {/*
                   * "누구와 몇 분에" — 참고 화면의 그 줄이다.
                   * ⚠ 대신한 선수 이름이 없을 수 있다(제공자가 특정하지 못하는 경우) →
                   *   그때는 분만 말한다. "— 71'"처럼 빈 이름을 그리면 데이터가 깨진 것처럼 보인다.
                   */}
                  {mark?.inFor ? (
                    <span className="mt-0.5 line-clamp-2 block break-keep text-[11px] leading-tight text-ink-mute-2">
                      {mark.inFor.name ? `${mark.inFor.name} ` : ""}
                      {mark.inFor.minute}&#39;
                    </span>
                  ) : null}
                </span>
                {/*
                 * ⚠ 평점이 `null`인 것은 **출전하지 않았다**는 뜻이다(0점이 아니다).
                 *   자리를 비워 두면 줄이 흔들리므로 옅은 대시로 폭을 잡는다.
                 */}
                <span className="w-8 shrink-0 pt-px text-right font-mono text-[12px] tabular-nums text-ink-mute">
                  {player.rating !== null ? player.rating.toFixed(1) : "–"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

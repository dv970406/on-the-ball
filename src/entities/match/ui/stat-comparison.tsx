import { barPercent, type StatRow } from "../lib/stat-rows";
import type { Team } from "../model/types";

interface StatComparisonProps {
  /**
   * 그릴 행. ⚠ **원본 `MatchStat[]`가 아니라 조립된 행을 받는다** — 호출부가 "그릴 게 있는가"를
   *   같은 함수(`buildStatRows`)로 판정해야 출처 문구가 표와 갈리지 않는다.
   */
  rows: StatRow[];
  homeTeam: Team;
  awayTeam: Team;
}

/**
 * 팀 스탯 비교 — 항목마다 가운데 라벨, 양쪽으로 뻗는 막대.
 *
 * ⚠ **`"use client"`를 붙이지 않는다**(라인업과 같은 판단·같은 단서 — 지금 소비자는
 *   클라이언트 뷰 하나라 실제로는 클라이언트로 내려간다).
 *
 * ⚠⚠ **`<table>`이다.** 한때 `ul/li`로 그렸는데, 그러면 팀 이름이 리스트 **바깥의 이름 없는
 *   `div`** 에 남아 낭독이 "39% 볼점유율 61%"로 흘렀다 — **어느 숫자가 어느 팀인지 좌/우라는
 *   시각 정보로만** 결정되어 14행 내내 위치로 추론해야 했다. 이건 본질적으로 2열 비교표이고,
 *   `<th scope="col">`이면 그 연결을 브라우저가 공짜로 준다.
 *   (`shared/ui/markdown.tsx`가 표를 다루는 선례가 있다.)
 *
 * ⚠ **막대에 팀 색을 쓰지 않는다.** 참고 화면은 클럽 컬러를 쓰지만 우리 `team`에는 색이 없고,
 *   넣더라도 한 화면에 색 막대가 28개 생긴다. 좌우 위치가 이미 어느 팀인지 말하므로
 *   **홈은 진한 잉크, 원정은 옅은 잉크**로 가른다 — 형태가 아니라 농도로 구분하는 셈이다.
 *
 * ⚠ **`RatioBar`를 쓰지 않는다.** 그쪽은 한 줄을 비율로 나누는 컴포넌트인데 여기는 가운데를
 *   기준으로 좌우가 **각자 자라는** 형태라 모양이 다르다(중복이 아니라 다른 물건이다).
 */
export function StatComparison({ rows, homeTeam, awayTeam }: StatComparisonProps) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="text-center text-[14px] font-semibold text-ink">
        경기 기록
      </h2>
      <table className="mt-3 w-full table-fixed border-collapse">
        <thead>
          <tr className="text-[12px] text-ink-mute">
            {/* 막대 칸은 헤더에서 이름을 갖지 않는다 — 값 칸이 팀을 대표한다 */}
            <th className="w-[26%] p-0" />
            <th scope="col" className="w-[12%] py-1 text-right font-normal">
              <span className="block truncate">{homeTeam.shortName}</span>
            </th>
            <th scope="col" className="w-[24%] py-1 text-center font-normal">
              항목
            </th>
            <th scope="col" className="w-[12%] py-1 text-left font-normal">
              <span className="block truncate">{awayTeam.shortName}</span>
            </th>
            <th className="w-[26%] p-0" />
          </tr>
        </thead>
        <tbody className="border-t border-hairline-cool">
          {rows.map((row) => {
            const format = (v: number) => `${v.toFixed(row.decimals)}${row.unit}`;
            return (
              <tr key={row.key}>
                <td className="py-1 pr-2 align-middle">
                  <span className="block h-1.5 overflow-hidden rounded-[2px] bg-canvas-soft">
                    {/*
                     * ⚠ 런타임에 계산된 비율이라 `style`이 허용되는 자리다(`styling.md`).
                     * ⚠ 홈 막대는 **오른쪽 끝에서 왼쪽으로** 자란다 — 가운데 라벨을 향해
                     *   두 막대가 마주 보아야 비교로 읽힌다.
                     */}
                    <span
                      style={{ width: `${barPercent(row.home, row.away)}%` }}
                      className="ml-auto block h-full rounded-[2px] bg-ink"
                    />
                  </span>
                </td>
                <td className="py-1 text-right font-mono text-[12px] tabular-nums text-ink">
                  {format(row.home)}
                </td>
                {/* ⚠ 행 머리글이라 `th scope="row"` — 낭독이 항목과 값을 함께 읽는다 */}
                <th scope="row" className="py-1 text-center text-[12px] font-normal text-ink-mute">
                  {row.label}
                </th>
                <td className="py-1 text-left font-mono text-[12px] tabular-nums text-ink">
                  {format(row.away)}
                </td>
                <td className="py-1 pl-2 align-middle">
                  <span className="block h-1.5 overflow-hidden rounded-[2px] bg-canvas-soft">
                    <span
                      style={{ width: `${barPercent(row.away, row.home)}%` }}
                      className="block h-full rounded-[2px] bg-ink-mute"
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

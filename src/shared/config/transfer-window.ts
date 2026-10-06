import windowsJson from "../../../scripts/lib/transfer/windows.json";

/** 한 리그의 창 — UTC ISO */
interface LeagueWindow {
  opensAt: string;
  closesAt: string;
}

/**
 * 이적 창 하나 — 5대 리그 일정을 합친 **기간**이다.
 * `opensAt`은 가장 먼저 여는 리그, `closesAt`은 가장 늦게 닫는 리그의 시각이다.
 */
export interface TransferWindow {
  key: string;
  label: string;
  opensAt: string;
  closesAt: string;
}

/** 리그별 일정 → 합친 기간. ⚠ 파생(`derive-deals.mjs`의 `loadWindows`)과 같은 규칙이다 */
function span(leagues: Record<string, LeagueWindow>): { opensAt: string; closesAt: string } {
  const all = Object.values(leagues);
  const earliest = all.reduce((a, b) => (Date.parse(b.opensAt) < Date.parse(a.opensAt) ? b : a));
  const latest = all.reduce((a, b) => (Date.parse(b.closesAt) > Date.parse(a.closesAt) ? b : a));
  return { opensAt: earliest.opensAt, closesAt: latest.closesAt };
}

/**
 * 이적 창 일정의 **단일 소스는 `scripts/lib/transfer/windows.json`**이다.
 *
 * ⚠ 파이프라인(`scripts/*.mjs`)은 이 TS를 import할 수 없어(Node가 TS를 그대로 읽지 못한다) JSON이
 *   원본이고 이 파일이 그것을 그대로 읽는다 — 창 일정을 스크립트와 화면이 다른 값으로 보는 사고를
 *   막는다(`team-names-ko.json`·`club-presets.json`과 같은 형태). **시즌마다 사람이 갱신한다.**
 * ⚠ **시간순으로 정렬돼 있어야 한다.** 이 모듈은 재정렬하지 않는다 — JSON 자체가 계약이다.
 */
const TRANSFER_WINDOWS: readonly TransferWindow[] = windowsJson.windows.map((w) => ({
  key: w.key,
  label: w.label,
  ...span(w.leagues),
}));

/**
 * 지금 열려 있는 창 — 헤더의 "마감까지" 카운트다운은 **이 값이 있을 때만** 그린다.
 * 가장 먼저 여는 리그가 열린 순간부터 가장 늦게 닫는 리그가 닫히기 전까지다. 창과 창 사이에는 `null`이다.
 */
export function openTransferWindow(nowMs: number): TransferWindow | null {
  return (
    TRANSFER_WINDOWS.find(
      (w) => Date.parse(w.opensAt) <= nowMs && nowMs < Date.parse(w.closesAt),
    ) ?? null
  );
}

/**
 * 보드가 추적하는 창 — `opensAt <= now`인 **가장 최근** 창(창 사이에는 방금 닫힌 창).
 * 헤더의 창 이름(`2026 여름`)과 보드 범위의 시작이 이 창을 본다. 창 사이에 나온 루머도 보드에 남긴다.
 *
 * ⚠ 모든 창이 아직 열리지 않았으면(첫 창이 시작되기 전) 가장 이른 창이다 — 그 이전에는 정의상
 *   이적 소식이 없으므로 보드가 비는 결과는 같다.
 */
export function trackedTransferWindow(nowMs: number): TransferWindow {
  let started: TransferWindow | undefined;
  for (const w of TRANSFER_WINDOWS) {
    if (Date.parse(w.opensAt) <= nowMs) started = w;
  }
  return started ?? TRANSFER_WINDOWS[0];
}

/** 보드에 실을 딜의 하한 시각(ms) — 추적 중인 창의 개장 시각(가장 먼저 여는 리그) */
export function boardScopeStartMs(nowMs: number): number {
  return Date.parse(trackedTransferWindow(nowMs).opensAt);
}

/**
 * 예측의 회차 — `closesAt > now`인 **가장 이른** 창(창이 열려 있으면 그 창, 창 사이에는 다음 창). 다음 창 일정이
 * 아직 없으면 `null`이다(그동안은 예측을 받지 않는다 — 시즌마다 사람이 `windows.json`을 갱신한다).
 *
 * ⚠ **DB 트리거(`transfer_deal_prediction_open`)와 같은 판정이다** — 표의 회차는 DB가 정하고, 화면은 이 값으로
 *   "어느 창의 예측인가"를 그리고 낙관적 갱신의 자리를 고른다. 마감 순간의 1초 차이로 갈려도 저장값은 DB의 것이고
 *   다음 조회가 맞춘다.
 */
export function predictionRound(nowMs: number): TransferWindow | null {
  return TRANSFER_WINDOWS.find((w) => nowMs < Date.parse(w.closesAt)) ?? null;
}

/** 창 키(`2027-winter`)로 창을 찾는다 — 지난 회차의 이름을 그릴 때. 일정에서 빠진 키면 `null` */
export function transferWindowByKey(key: string): TransferWindow | null {
  return TRANSFER_WINDOWS.find((w) => w.key === key) ?? null;
}

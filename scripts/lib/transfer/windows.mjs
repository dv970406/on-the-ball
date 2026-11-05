/**
 * 이적 창 일정(`windows.json`) 읽기 — 파생(`derive-deals.mjs`)과 판정 요청(`judge-prompt.mjs`)이 함께 쓴다.
 * 순수 모듈이다(다른 파이프라인 모듈을 import하지 않는다 — 판정과 파생 사이의 순환 import를 막는다). 잎 모듈인 `util.mjs`만 쓴다.
 */
import { DAY_MS, readJson } from "./util.mjs";

/**
 * 창 일정 — 리그별 일정을 **합친 기간**으로 돌려준다(개장 = 가장 먼저 여는 리그, 마감 = 가장 늦게 닫는 리그).
 * ⚠ 화면(`src/shared/config/transfer-window.ts`의 `span`)과 같은 규칙이다 — 같은 JSON을 읽는다.
 */
export function windowSpan(w) {
  const all = Object.values(w.leagues);
  const opensAt = all.reduce((a, b) => (Date.parse(b.opensAt) < Date.parse(a.opensAt) ? b : a)).opensAt;
  const closesAt = all.reduce((a, b) => (Date.parse(b.closesAt) > Date.parse(a.closesAt) ? b : a)).closesAt;
  return { key: w.key, label: w.label, opensAt, closesAt };
}

export function loadWindows() {
  const url = new URL("./windows.json", import.meta.url);
  const file = readJson(url);
  try {
    return file.windows.map(windowSpan);
  } catch (e) {
    throw new Error(`${url.pathname}를 읽지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 지금 추적하는 창의 키 — `opensAt <= now`인 마지막 창(창 사이에는 방금 닫힌 창). 아직 아무 창도 열리지 않았거나 일정이 없으면 ''.
 * 알림 기록(`transfer_deal_push_log.round_key`)이 쓴다 — 같은 딜의 같은 상태도 창이 바뀌면 다시 알린다(같은 선수의 다음 창 이적).
 * ⚠ 아래 보드 범위의 시작(`boardScopeStartMs`)과 같은 "열린 마지막 창" 판정이다.
 */
export function trackedWindowKey(nowMs, windows = loadWindows()) {
  const opened = [...windows].filter((w) => Date.parse(w.opensAt) <= nowMs).sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt));
  return opened.at(-1)?.key ?? "";
}

/** 보드 범위 시작보다 이만큼 앞선 보도까지 본다 — 창 직전의 "합의" 보도가 창 안의 오피셜과 한 이야기다 */
const SCOPE_SLACK_MS = 14 * DAY_MS;

/**
 * 보드 범위의 시작 — `opensAt <= now`인 마지막 창의 개장 시각. 아직 아무 창도 열리지 않았으면 첫 창.
 * ⚠ 화면(`shared/config/transfer-window.ts`의 `boardScopeStartMs`)과 같은 판정이어야 한다 — 같은 JSON을 읽는다.
 */
export function boardScopeStartMs(nowMs, windows) {
  const sorted = [...windows].sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt));
  const opened = sorted.filter((w) => Date.parse(w.opensAt) <= nowMs);
  return Date.parse((opened.at(-1) ?? sorted[0]).opensAt);
}
export const derivationStartMs = (nowMs, windows) => boardScopeStartMs(nowMs, windows) - SCOPE_SLACK_MS;

/**
 * 이적 창 일정(`windows.json`) 읽기 — 파생(`derive-deals.mjs`)과 판정 요청(`judge-prompt.mjs`)이 함께 쓴다.
 * 순수 모듈이다(다른 파이프라인 모듈을 import하지 않는다 — 판정과 파생 사이의 순환 import를 막는다).
 */
import { readFileSync } from "node:fs";

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
  try {
    return JSON.parse(readFileSync(url, "utf8")).windows.map(windowSpan);
  } catch (e) {
    throw new Error(`${url.pathname}를 읽지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
  }
}

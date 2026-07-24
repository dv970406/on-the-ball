import type { LineupCell } from "../model/types";

/**
 * lineups.rows jsonb 안전 파서 — poll의 readXxxMeta(option-meta.ts)와 대칭.
 * 계약 밖 값(비배열·누락·타입 불일치)은 버려서 raw 캐스팅의 런타임 undefined 유입을 막는다.
 */
export function readLineupRows(raw: unknown): LineupCell[][] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) =>
    Array.isArray(row)
      ? row.filter(
          (c): c is LineupCell =>
            typeof c?.pos === "string" && typeof c?.flag === "string",
        )
      : [],
  );
}

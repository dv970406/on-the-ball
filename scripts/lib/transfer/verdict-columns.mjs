/**
 * 판정의 값 컬럼 — 파생의 읽기(`ROW_COLUMNS`) · 옛 판정 지키기(`PREV_COLUMNS`) · 재생의 대조(`REPLAY_COLUMNS`)가 **같은 목록**을 쓴다.
 * 판정 필드를 더할 때 한 곳이라도 빠지면 조용히 어긋난다 — 읽기에서 빠지면 파생이 그 값을 못 보고, 재생 대조에서 빠지면 재생이 변화를 못 본다.
 * ⚠ 잎 모듈이다(아무것도 import하지 않는다) — 판정과 파생이 함께 쓴다. 지시문을 건드리지 않아 지문과 무관하다.
 */
export const VERDICT_VALUE_COLUMNS = [
  "verdict",
  "verdict_player",
  "verdict_player_name",
  "verdict_evidence",
  "verdict_from",
  "verdict_to",
  "verdict_suitors",
  "verdict_stage",
  "verdict_fee_amount",
  "verdict_fee_currency",
  "verdict_fee_kind",
  "verdict_form",
  "verdict_loan_owner",
  "verdict_loan_club",
  "verdict_loan_clause",
];

/**
 * 국적 코드(FIFA 3글자) → 국기 이모지.
 *
 * ⚠ **없는 코드는 이모지 없이 코드만 그린다** — 거짓 국기보다 빈 칸이 낫다("틀린 칸보다 빈 칸").
 *   `transfer_deal.nationality`는 `^[A-Z]{3}$`만 강제하고 목록을 갖지 않으므로 여기가 곧 표기 사전이다.
 *   운영 사전(`scripts/lib/transfer/players-ko.json`)에 국적이 늘면 여기도 함께 늘린다.
 * ⚠ ENG·SCO·WAL은 **태그 시퀀스**(🏴 + 지역 태그)라 일부 기기·폰트에서 검은 깃발 하나로 보인다
 *   — 표기 옆에 코드가 항상 함께 있어 그 경우에도 뜻은 잃지 않는다.
 * ⚠ 이모지는 국기만 쓴다 — 다른 자리에 이모지를 더하지 않는다.
 */
const FLAG: Record<string, string> = {
  BRA: "🇧🇷",
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  SWE: "🇸🇪",
  KOR: "🇰🇷",
  ESP: "🇪🇸",
  CMR: "🇨🇲",
  NGA: "🇳🇬",
  TUR: "🇹🇷",
  POR: "🇵🇹",
  ARG: "🇦🇷",
  NED: "🇳🇱",
  // 운영 사전에 있는 것
  AUT: "🇦🇹",
  JAM: "🇯🇲",
  GEO: "🇬🇪",
  // 5대 리그에 흔한 국적 — 사전에 들어올 가능성이 높은 순서로 미리 둔다
  FRA: "🇫🇷",
  GER: "🇩🇪",
  ITA: "🇮🇹",
  BEL: "🇧🇪",
  CRO: "🇭🇷",
  DEN: "🇩🇰",
  NOR: "🇳🇴",
  SUI: "🇨🇭",
  POL: "🇵🇱",
  SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  IRL: "🇮🇪",
  URU: "🇺🇾",
  COL: "🇨🇴",
  MEX: "🇲🇽",
  USA: "🇺🇸",
  CAN: "🇨🇦",
  JPN: "🇯🇵",
  AUS: "🇦🇺",
  SEN: "🇸🇳",
  EGY: "🇪🇬",
  MAR: "🇲🇦",
  ALG: "🇩🇿",
  GHA: "🇬🇭",
  CIV: "🇨🇮",
  MLI: "🇲🇱",
  SRB: "🇷🇸",
  UKR: "🇺🇦",
  CZE: "🇨🇿",
  SVK: "🇸🇰",
  SVN: "🇸🇮",
  HUN: "🇭🇺",
  GRE: "🇬🇷",
  ECU: "🇪🇨",
  CHI: "🇨🇱",
  PAR: "🇵🇾",
};

/** 국기 이모지 — 모르는 코드면 `null`(호출부가 코드만 그린다) */
export function flagEmoji(code: string): string | null {
  return FLAG[code] ?? null;
}

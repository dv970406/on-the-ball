import type { Database } from "@/types/database.types";

export type TransferDealRow = Database["public"]["Tables"]["transfer_deal"]["Row"];
export type TransferClubRow = Database["public"]["Tables"]["transfer_club"]["Row"];
export type TransferNewsRow = Database["public"]["Tables"]["transfer_news"]["Row"];
export type TransferDealWatchRow = Database["public"]["Tables"]["transfer_deal_watch"]["Row"];

/**
 * 'rumour' | 'talks' | … | 'collapsed' | 'denied' | 'unknown' — DB enum에서 생성된 타입이라 손으로 적지 않는다.
 * ⚠ `unknown`은 `transfer_news`에만 있는 값이다 — `transfer_deal.stage`는 CHECK가 그 값을 거부한다.
 *   그래도 타입은 enum 그대로라 `Record<TransferStage, …>` 맵이 그 키를 **`null`로** 채운다
 *   (`never`로 막으면 enum에 값이 늘 때 컴파일 에러가 나는 장치가 함께 죽는다).
 */
export type TransferStage = Database["public"]["Enums"]["transfer_stage"];

/**
 * 보드의 구간 — 순서·라벨은 `lib/stage.ts`가 갖는다.
 * ⚠ 단계(`TransferStage`)와 다르다. 단계 9개를 화면의 다섯 구간으로 접은 것이다.
 */
export type TransferGroupKey = "official" | "hwg" | "prog" | "rumor" | "dead";

/**
 * 상태 뱃지의 톤 — 단계를 일곱 가지 표시로 접은 것(`합의 임박`·`협상 중`이 여러 단계를 담는다).
 * ⚠ 구간(`TransferGroupKey`)과도 다르다 — `prog` 구간 안에 `imminent`·`talks` 두 톤, `dead` 구간 안에 `dead`(결렬)·`denied`(부인) 두 톤이 있다.
 */
export type TransferStatus = "official" | "hwg" | "imminent" | "talks" | "rumor" | "dead" | "denied";

/** 보드 정렬 — URL `?sort=`가 소유한다. 해석은 `lib/league.ts`의 `parseTransferSort` */
export type TransferSort = "latest" | "fee";

/**
 * 5대 리그 — `transfer_club.league`의 CHECK와 **글자 하나까지 같아야 한다**
 * (마이그레이션 20260925000001). DB 컬럼이 enum이 아니라 `text + check`라 생성 타입에서
 * 뽑을 수 없어 여기 손으로 적는다 — 그래서 아래 배열과 이 유니온을 서로 대조한다.
 */
export type TransferLeague = "프리미어리그" | "분데스리가" | "라리가" | "세리에 A" | "리그 1";

/**
 * 리그 시트에 노출하는 순서.
 * ⚠ `as const satisfies`가 **없는 값**을 막고, 아래 망라성 가드가 **빠뜨린 값**을 막는다
 *   (`api-and-db.md`의 노출 순서 배열 + 망라성 가드 형태).
 */
export const TRANSFER_LEAGUES = [
  "프리미어리그",
  "라리가",
  "분데스리가",
  "세리에 A",
  "리그 1",
] as const satisfies readonly TransferLeague[];

/** ⚠ **타입 별칭만 선언하면 아무것도 검사하지 못한다** — 실제 값에 할당해야 컴파일러가 대조한다 */
const _LEAGUES_EXHAUSTIVE: Exclude<TransferLeague, (typeof TRANSFER_LEAGUES)[number]> extends never
  ? true
  : never = true;

export interface TransferClub {
  /** 엠블럼 파일명(`/crests/{code}.png`)이 이 값에서 유도된다 — `team.code`와 같은 판단 */
  code: TransferClubRow["code"];
  /** 정식명 — 한국어 표기가 있으면 한국어, 없으면 영문(`team.name`과 같은 규약) */
  name: TransferClubRow["name"];
  /** 약칭 — 목록 행·미니 카드·경로 블록이 쓴다. 정식명은 상세의 경로 카드만 */
  shortName: TransferClubRow["short_name"];
  /** 5대 리그 밖은 `null` — 리그 필터는 출발 **또는** 도착이 일치하면 통과시킨다 */
  league: TransferLeague | null;
}

/**
 * 보도 한 건 — `transfer_news`의 공개 컬럼만 담는다.
 * ⚠ `body`(원문 전문)는 없다. anon·authenticated에 grant된 컬럼이 아니라 select에 실을 수 없다
 *   (`api-and-db.md` 이적 소식 절). 화면이 쓰는 요지는 `body_excerpt`(280자)다.
 */
export interface TransferReport {
  id: TransferNewsRow["id"];
  dealId: TransferNewsRow["deal_id"];
  /** 소스 id(`tg:romano`·`rss:bbc-football`…) — 보도 주체·매체 표기는 `lib/reporter.ts`가 푼다 */
  sourceId: TransferNewsRow["source_id"];
  /** 계정·핸들(`fabrizioromano`) — 확증된 저자. 없으면 매체 피드다 */
  attributedTo: TransferNewsRow["attributed_to"];
  /** 수집기의 소스 등급 1·2(귀속·미러 판정에 쓴다). 화면의 출처 표시는 이 값이 아니라 `credibilityOf`다 */
  tier: TransferNewsRow["tier"];
  stage: TransferStage;
  feeAmount: TransferNewsRow["fee_amount"];
  feeCurrency: TransferNewsRow["fee_currency"];
  feeText: TransferNewsRow["fee_text"];
  publishedAt: TransferNewsRow["published_at"];
  /**
   * "원문" 링크 — **원저자의 주소를 우선한다**(`provenance_url` → 없으면 `url`).
   * 미러 채널(`tg:romano`)의 `url`은 미러 게시물이고 `provenance_url`이 기자의 원글이다.
   * 판정은 매퍼가 한 곳에서 한다 — 화면이 두 컬럼을 각자 고르지 않는다.
   */
  originalUrl: string | null;
  /**
   * 요지 — 한국어 요약(`summary_ko`, LLM)이 있으면 그것, 없으면 영문 원문 앞 280자(`body_excerpt`).
   * 둘 다 없으면 `null`. **고르는 판정은 매퍼 한 곳이 한다**(`originalUrl`과 같은 이유) — 화면은
   * `lang`을 그대로 붙여 스크린리더가 영문 발췌를 영어로 읽게 한다.
   */
  gist: ReportGist | null;
}

export interface ReportGist {
  text: string;
  lang: "ko" | "en";
}

export interface TransferDeal {
  id: TransferDealRow["id"];
  /** 추출된 영문 선수명 */
  player: TransferDealRow["player"];
  /** 한국어 표기 — 운영 사전(`players-ko.json`)에 있을 때만. 표시명은 `lib/player-name.ts`의 `playerName`이 단독으로 정한다 */
  playerKo: TransferDealRow["player_ko"];
  position: TransferDealRow["position"];
  birthYear: TransferDealRow["birth_year"];
  /** `^[A-Z]{3}$` */
  nationality: TransferDealRow["nationality"];
  /** 출발·행선지 — 빈 칸의 문구(`FA`·`미확인`·`미정`·`외 N`)는 `lib/route-label.ts`가 단독으로 정한다 */
  fromClub: TransferClub | null;
  toClub: TransferClub | null;
  /**
   * 행선지 밖의 관심 구단(언급 순, `transfer_deal_suitor`) — 여러 구단이 노리는 루머에서 화면이 전부 엠블럼·이름으로 그린다.
   * `toClub`이 있으면 확실한 행선지 하나 + 그 밖의 관심 구단, 없으면 관심 구단들뿐인 루머(행선지 미정)다.
   */
  suitors: TransferClub[];
  stage: TransferStage;
  /** 최신 보도의 이적료 — 단위는 **백만**(`€95M`의 95). 셋은 함께 있거나 함께 없다(DB CHECK) */
  feeAmount: TransferDealRow["fee_amount"];
  feeCurrency: TransferDealRow["fee_currency"];
  feeText: TransferDealRow["fee_text"];
  /** 같은 통화의 **직전 다른** 보도 이적료 — 변동폭(`FeeDelta`)의 기준. 없으면 `null` */
  prevFeeAmount: TransferDealRow["prev_fee_amount"];
  /** 같은 통화 보도의 최소·최대 — 상세의 "보도 범위" */
  feeLowAmount: TransferDealRow["fee_low_amount"];
  feeHighAmount: TransferDealRow["fee_high_amount"];
  addOnAmount: TransferDealRow["add_on_amount"];
  /** `'2030.06'` 또는 `'5년'` */
  contractText: TransferDealRow["contract_text"];
  /** `'£250k'` — 원문 표기 그대로(원화 환산은 하지 않는다) */
  wageText: TransferDealRow["wage_text"];
  firstReportedAt: TransferDealRow["first_reported_at"];
  /** 정렬·범위 기준 — "N분 전"도 이 값이다 */
  latestReportedAt: TransferDealRow["latest_reported_at"];
  reportCount: TransferDealRow["report_count"];
  /**
   * 보도 문장에서 **자유계약을 확인했다**(이적료가 있으면 늘 false — DB CHECK).
   * ⚠ 이적료가 비었다는 것만으로 FA가 아니다 — 대개 금액이 보도되지 않은 것이다(`feeLabel`).
   */
  isFreeAgent: TransferDealRow["is_free_agent"];
  /**
   * 내가 관심 등록했는가.
   * ⚠ `transfer_deal_watch`의 SELECT 정책이 "내 행만"이라 **임베딩 배열 길이가 곧 이 값**이다
   *   (남의 관심이 새는 사고가 구조적으로 불가능하다).
   *   비로그인은 정책이 `to authenticated`라 빈 배열 → `false`.
   * ⚠ 목록과 상세 **둘 다** 이 값을 갖는다 — 상세의 토글이 이 값을 읽고 낙관적으로 뒤집는다.
   */
  isWatched: boolean;
}

/**
 * 목록의 딜 — 최신 보도 1건이 함께 온다.
 * ⚠ `latestReport`는 목록 select의 임베딩(`order published_at desc limit 1`)이라 상세에는 없다 —
 *   상세는 타임라인 전체(`useTransferReportsQuery`)를 따로 받는다.
 * ⚠ `null`일 수 있다 — 딜은 보도에서 파생되므로 원칙적으로 항상 있지만, 재파생이 `deal_id`를
 *   되돌린 뒤 딜 행이 남는 창이 있다(딜은 삭제하지 않고 다시 파생한다 — `api-and-db.md`).
 */
export interface TransferDealListItem extends TransferDeal {
  latestReport: TransferReport | null;
}

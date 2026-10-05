import type {
  TransferClub,
  TransferClubRow,
  TransferDeal,
  TransferDealListItem,
  TransferDealRow,
  TransferDealWatchRow,
  TransferLeague,
  TransferNewsRow,
  TransferReport,
} from "../model/types";
import { TRANSFER_LEAGUES } from "../model/types";

/**
 * 상한·창 상수.
 *
 * ⚠ **`api/queries.ts`가 아니라 여기 있다** — 그 파일은 `"use client"`라 서버가 import할 수
 *   없는데, SSR 프리페치가 같은 값을 써야 한다.
 */
/**
 * 보드에 싣는 딜 상한. 범위(현재/직전 창 개장~지금) 안의 딜을 **전부** 내려 뷰가 리그·정렬을
 * 클라이언트에서 계산한다 — 필터를 쿼리 키에 넣으면 `initialData`가 키와 어긋나는 사고가 생긴다.
 * 한 창의 딜이 이 값을 넘으면 그때 서버 필터로 옮긴다(화면이 잘림을 안내한다).
 */
export const TRANSFER_DEAL_LIMIT = 200;
/** "최근 3일 소식" 캐러셀의 창 */
export const RUMOR_CAROUSEL_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const CLUB_COLUMNS = "code, name, short_name, league";
const DEAL_COLUMNS =
  "id, player, player_ko, position, birth_year, nationality, stage, fee_amount, fee_currency, fee_text, fee_kind, prev_fee_amount, fee_low_amount, fee_high_amount, add_on_amount, contract_text, wage_text, first_reported_at, latest_reported_at, report_count, is_free_agent";
/**
 * ⚠ **`body`가 없다.** anon·authenticated에는 `body`를 뺀 컬럼만 grant돼 있어 `select=*`도
 *   `body`도 42501이다(`api-and-db.md` 이적 소식 절) — 그래서 컬럼을 나열한다.
 */
const REPORT_COLUMNS =
  "id, deal_id, source_id, attribution, attributed_to, tier, stage, fee_amount, fee_currency, fee_text, published_at, url, provenance_url, body_excerpt, summary_ko";

/**
 * PostgREST select 문자열의 단일 소스 — 스키마가 바뀌면 여기 한 곳만 고친다.
 *
 * ⚠ **`transfer_club!컬럼명` 형태로 경로를 못박는다.** `transfer_deal → transfer_club` 경로가
 *   출발·도착 둘이라 그냥 `transfer_club(...)`은 PGRST201이다.
 * ⚠ `transfer_deal_watch(user_id)` 임베딩은 SELECT 정책이 "내 행만"이라 **배열 길이가 곧
 *   "내가 관심 등록했는가"** 다. 목록에도 실려야 행이 관심 표시를 그릴 수 있다.
 * ⚠ `suitors:transfer_deal_suitor(...)`는 딜의 관심 구단 자식 행이다 — 화면이 전부 그리므로 코드가 아니라 구단 행을 임베딩한다.
 * ⚠ `latest:transfer_news!deal_id(...)`는 **최신 1건만** 받는다 — 정렬·상한은 select 문자열이
 *   아니라 `list-query.ts`가 `.order(…, { referencedTable })`·`.limit(1, { referencedTable })`로
 *   건다(임베딩 정렬은 select 안에 적을 수 없다).
 * ⚠ **문자열을 `+`로 잇지 않는다** — 리터럴 타입이 `string`으로 넓어지면 추론이 통째로
 *   `GenericStringError`가 된다(실측). 한 템플릿 리터럴로 둔다.
 */
export const DEAL_LIST_SELECT =
  `${DEAL_COLUMNS}, from:transfer_club!from_club_code(${CLUB_COLUMNS}), to:transfer_club!to_club_code(${CLUB_COLUMNS}), suitors:transfer_deal_suitor(position, club:transfer_club(${CLUB_COLUMNS})), transfer_deal_watch(user_id), latest:transfer_news!deal_id(${REPORT_COLUMNS})` as const;

/**
 * 상세 select — 최신 보도 임베딩이 **없다.** 상세는 타임라인 전체를 따로 받으므로
 * (`REPORT_SELECT`) 같은 행을 두 번 받을 이유가 없다.
 */
export const DEAL_DETAIL_SELECT =
  `${DEAL_COLUMNS}, from:transfer_club!from_club_code(${CLUB_COLUMNS}), to:transfer_club!to_club_code(${CLUB_COLUMNS}), suitors:transfer_deal_suitor(position, club:transfer_club(${CLUB_COLUMNS})), transfer_deal_watch(user_id)` as const;

/** 상세의 보도 타임라인 — 딜에 묶인 보도 전부(정렬은 `list-query.ts`) */
export const REPORT_SELECT = `${REPORT_COLUMNS}` as const;

/** 구단 목록 — 응원 구단을 고르는 화면이 5대 리그 구단을 이 모양으로 받는다(범위는 `list-query.ts`) */
export const CLUB_LIST_SELECT = `${CLUB_COLUMNS}` as const;

/**
 * 내 응원 구단 — 자식 행(`transfer_club_follow`)에 구단 행을 임베딩한다.
 * ⚠ SELECT 정책이 "내 행만"이라 **필터 없이도 내 것만 온다**(관심 임베딩과 같은 구조 — 필터를 잊어 남의 행이 새는 길이 없다).
 */
export const FOLLOWED_CLUB_SELECT = `club:transfer_club(${CLUB_COLUMNS})` as const;

type ClubSelectRow = Pick<TransferClubRow, "code" | "name" | "short_name" | "league">;

/**
 * DB의 `league`는 `text`(CHECK로 5개 값만)라 생성 타입이 `string | null`이다 → 여기서 유니온으로
 * 좁힌다. CHECK 밖의 값은 들어올 수 없지만, 들어와도 `null`(5대 리그 밖)로 접는 편이
 * 화면이 모르는 리그명을 시트에 그리는 것보다 낫다.
 */
function toLeague(value: string | null): TransferLeague | null {
  return (TRANSFER_LEAGUES as readonly string[]).includes(value ?? "")
    ? (value as TransferLeague)
    : null;
}

export function buildClub(row: ClubSelectRow | null): TransferClub | null {
  if (!row) return null;
  return {
    code: row.code,
    name: row.name,
    shortName: row.short_name,
    league: toLeague(row.league),
  };
}

/** 구단을 화면에 늘어놓는 순서 — 정식명 가나다순. 목록·응원 구단·낙관적 갱신이 같은 순서를 써야 항목이 튀지 않는다 */
export function compareClubs(a: TransferClub, b: TransferClub): number {
  return a.name.localeCompare(b.name, "ko");
}

/**
 * 구단 목록 → 5대 리그 구단(정식명순).
 * ⚠ 조회가 이미 리그 있는 행만 받지만 여기서 한 번 더 거른다 — CHECK 밖의 리그명은 `toLeague`가 `null`로 접는데,
 *   그런 구단이 리그 없는 채로 고르는 화면에 섞이면 어느 묶음에도 들지 못한다.
 */
export function buildClubList(rows: ClubSelectRow[]): TransferClub[] {
  return rows
    .flatMap((row) => buildClub(row) ?? [])
    .filter((club) => club.league !== null)
    .sort(compareClubs);
}

/** `FOLLOWED_CLUB_SELECT`가 돌려주는 행 */
export interface FollowedClubSelectRow {
  club: ClubSelectRow | null;
}

/** 내 응원 구단(정식명순) */
export function buildFollowedClubs(rows: FollowedClubSelectRow[]): TransferClub[] {
  return rows.flatMap((row) => buildClub(row.club) ?? []).sort(compareClubs);
}

/** `REPORT_COLUMNS`가 돌려주는 행 — 컬럼 타입은 생성 타입에서 뽑는다 */
export type ReportSelectRow = Pick<
  TransferNewsRow,
  | "id"
  | "deal_id"
  | "source_id"
  | "attribution"
  | "attributed_to"
  | "tier"
  | "stage"
  | "fee_amount"
  | "fee_currency"
  | "fee_text"
  | "published_at"
  | "url"
  | "provenance_url"
  | "body_excerpt"
  | "summary_ko"
>;

export function buildReport(row: ReportSelectRow): TransferReport {
  return {
    id: row.id,
    dealId: row.deal_id,
    sourceId: row.source_id,
    attribution: row.attribution,
    attributedTo: row.attributed_to,
    tier: row.tier,
    stage: row.stage,
    feeAmount: row.fee_amount,
    feeCurrency: row.fee_currency,
    feeText: row.fee_text,
    publishedAt: row.published_at,
    // 원저자 주소 우선 — 사유는 `TransferReport.originalUrl` 주석
    originalUrl: row.provenance_url ?? row.url,
    // 한국어 요약 우선 — 요약 단계가 아직 돌지 않았거나 버린 행은 영문 발췌로 대신한다
    gist: row.summary_ko
      ? { text: row.summary_ko, lang: "ko" }
      : row.body_excerpt
        ? { text: row.body_excerpt, lang: "en" }
        : null,
  };
}

/** `DEAL_DETAIL_SELECT`가 돌려주는 행 */
export interface DealSelectRow {
  id: TransferDealRow["id"];
  player: TransferDealRow["player"];
  player_ko: TransferDealRow["player_ko"];
  position: TransferDealRow["position"];
  birth_year: TransferDealRow["birth_year"];
  nationality: TransferDealRow["nationality"];
  stage: TransferDealRow["stage"];
  fee_amount: TransferDealRow["fee_amount"];
  fee_currency: TransferDealRow["fee_currency"];
  fee_text: TransferDealRow["fee_text"];
  fee_kind: TransferDealRow["fee_kind"];
  prev_fee_amount: TransferDealRow["prev_fee_amount"];
  fee_low_amount: TransferDealRow["fee_low_amount"];
  fee_high_amount: TransferDealRow["fee_high_amount"];
  add_on_amount: TransferDealRow["add_on_amount"];
  contract_text: TransferDealRow["contract_text"];
  wage_text: TransferDealRow["wage_text"];
  first_reported_at: TransferDealRow["first_reported_at"];
  latest_reported_at: TransferDealRow["latest_reported_at"];
  report_count: TransferDealRow["report_count"];
  is_free_agent: TransferDealRow["is_free_agent"];
  from: ClubSelectRow | null;
  to: ClubSelectRow | null;
  /** 관심 구단(자식 행) — 임베딩 순서는 보장되지 않아 `position`으로 매퍼가 정렬한다 */
  suitors: { position: number; club: ClubSelectRow | null }[] | null;
  /** SELECT 정책이 "내 행만"이라 길이가 0 또는 1이다 */
  transfer_deal_watch: Pick<TransferDealWatchRow, "user_id">[] | null;
}

export function buildDeal(row: DealSelectRow): TransferDeal {
  return {
    id: row.id,
    player: row.player,
    playerKo: row.player_ko,
    position: row.position,
    birthYear: row.birth_year,
    nationality: row.nationality,
    fromClub: buildClub(row.from),
    toClub: buildClub(row.to),
    stage: row.stage,
    feeAmount: row.fee_amount,
    feeCurrency: row.fee_currency,
    feeText: row.fee_text,
    feeKind: row.fee_kind,
    prevFeeAmount: row.prev_fee_amount,
    feeLowAmount: row.fee_low_amount,
    feeHighAmount: row.fee_high_amount,
    addOnAmount: row.add_on_amount,
    contractText: row.contract_text,
    wageText: row.wage_text,
    firstReportedAt: row.first_reported_at,
    latestReportedAt: row.latest_reported_at,
    reportCount: row.report_count,
    isFreeAgent: row.is_free_agent,
    suitors: [...(row.suitors ?? [])].sort((a, b) => a.position - b.position).flatMap((s) => buildClub(s.club) ?? []),
    // 정책이 "내 행만"이라 임베딩 결과에 남의 관심이 섞일 수 없다
    isWatched: (row.transfer_deal_watch?.length ?? 0) > 0,
  };
}

/** `DEAL_LIST_SELECT`가 돌려주는 행 — 상세 행 + 최신 보도 1건(배열이다: `limit 1`이라 0~1개) */
export interface DealListSelectRow extends DealSelectRow {
  latest: ReportSelectRow[] | null;
}

export function buildDealListItem(row: DealListSelectRow): TransferDealListItem {
  const latest = row.latest?.[0];
  return {
    ...buildDeal(row),
    latestReport: latest ? buildReport(latest) : null,
  };
}

/**
 * 목록에서 **내 관심 표시만** 지운다 — 다른 사용자로 그린 목록을 잠시 보여 줄 때 쓴다.
 *
 * ⚠ 개인화가 항목마다 흩어진 목록이라, 서버가 본 사용자와 지금 사용자가 다르면 서버 목록을 그대로
 *   캐시에 넣지 않는다(`nextjs.md` 서버 프리페치 절) — 이 사본을 자리 표시로만 쓰고 새로 받는다.
 *   댓글의 `withoutMyVotes`와 같은 자리다.
 */
export function withoutWatches(deals: TransferDealListItem[]): TransferDealListItem[] {
  return deals.map((deal) => (deal.isWatched ? { ...deal, isWatched: false } : deal));
}

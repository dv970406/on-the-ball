import type {
  TransferClub,
  TransferClubRow,
  TransferDeal,
  TransferDealListItem,
  TransferDealRow,
  TransferDealWatchRow,
  TransferDay,
  TransferDayDeal,
  TransferDayEntry,
  TransferDaySummary,
  TransferLeague,
  TransferLatestReport,
  TransferNewsRow,
  TransferReport,
  ReportGist,
} from "../model/types";
import { TRANSFER_LEAGUES } from "../model/types";
// ⚠ 직접 경로 — 이 파일은 서버가 import하는 서버 안전 파일이라 `"use client"`를 담은 배럴을 거치지 않는다
import { kstDateKey } from "@/shared/lib/date-key";

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
  "id, player, player_ko, position, birth_year, nationality, stage, form, loan_clause, loan_fee_text, fee_amount, fee_currency, fee_text, fee_kind, prev_fee_amount, fee_low_amount, fee_high_amount, add_on_amount, contract_text, wage_text, latest_reported_at, report_count, is_free_agent";
/**
 * ⚠ **`body`가 없다.** anon·authenticated에는 `body`를 뺀 컬럼만 grant돼 있어 `select=*`도
 *   `body`도 42501이다(`api-and-db.md` 이적 소식 절) — 그래서 컬럼을 나열한다.
 */
const REPORT_COLUMNS =
  "id, deal_id, source_id, attribution, attributed_to, tier, stage, fee_amount, fee_currency, fee_text, published_at, url, provenance_url, body_excerpt, summary_ko";
/**
 * 목록의 최신 보도 — 목록이 그리는 것(출처 표기·공신력 · 게시 시각 · 요지)만 받는다. 딜마다 한 건씩 상한만큼 실리므로
 * 타임라인 컬럼을 통째로 실으면 그 무게가 목록 응답 전체에 곱해진다.
 * ⚠ 컬럼을 더하면 `LatestReportSelectRow`·`TransferLatestReport`도 함께 넓힌다 — 좁은 타입이 목록에서 없는 필드를 읽는
 *   코드를 컴파일 에러로 막는 장치다.
 */
const LATEST_REPORT_COLUMNS = "source_id, attribution, attributed_to, published_at, body_excerpt, summary_ko";

/**
 * PostgREST select 문자열의 단일 소스 — 스키마가 바뀌면 여기 한 곳만 고친다.
 *
 * ⚠ **`transfer_club!컬럼명` 형태로 경로를 못박는다.** `transfer_deal → transfer_club` 경로가
 *   출발·도착·임대 구단 셋이라 그냥 `transfer_club(...)`은 PGRST201이다.
 * ⚠ `transfer_deal_watch(user_id)` 임베딩은 SELECT 정책이 "내 행만"이라 **배열 길이가 곧
 *   "내가 관심 등록했는가"** 다. 목록에도 실려야 행이 관심 표시를 그릴 수 있다.
 * ⚠ `suitors:transfer_deal_suitor(...)`는 딜의 관심 구단 자식 행이다 — 화면이 전부 그리므로 코드가 아니라 구단 행을 임베딩한다.
 * ⚠ `latest:transfer_news!deal_id(...)`는 **최신 1건만**, 목록이 그리는 컬럼만(`LATEST_REPORT_COLUMNS`) 받는다 — 정렬·상한은 select 문자열이
 *   아니라 `list-query.ts`가 `.order(…, { referencedTable })`·`.limit(1, { referencedTable })`로
 *   건다(임베딩 정렬은 select 안에 적을 수 없다).
 * ⚠ **문자열을 `+`로 잇지 않는다** — 리터럴 타입이 `string`으로 넓어지면 추론이 통째로
 *   `GenericStringError`가 된다(실측). 한 템플릿 리터럴로 둔다.
 */
export const DEAL_LIST_SELECT =
  `${DEAL_COLUMNS}, from:transfer_club!from_club_code(${CLUB_COLUMNS}), to:transfer_club!to_club_code(${CLUB_COLUMNS}), loan:transfer_club!loan_club_code(${CLUB_COLUMNS}), suitors:transfer_deal_suitor(position, club:transfer_club(${CLUB_COLUMNS})), transfer_deal_watch(user_id), latest:transfer_news!deal_id(${LATEST_REPORT_COLUMNS})` as const;

/**
 * 상세 select — 최신 보도 임베딩이 **없다.** 상세는 타임라인 전체를 따로 받으므로
 * (`REPORT_SELECT`) 같은 행을 두 번 받을 이유가 없다.
 */
export const DEAL_DETAIL_SELECT =
  `${DEAL_COLUMNS}, from:transfer_club!from_club_code(${CLUB_COLUMNS}), to:transfer_club!to_club_code(${CLUB_COLUMNS}), loan:transfer_club!loan_club_code(${CLUB_COLUMNS}), suitors:transfer_deal_suitor(position, club:transfer_club(${CLUB_COLUMNS})), transfer_deal_watch(user_id)` as const;

/**
 * 날짜별 소식 — 그 날의 보도 + 보도가 속한 딜. 딜 쪽에서 보도를 임베딩하지 않고 **보도 쪽에서 딜을** 임베딩한다 —
 * 하루의 경계는 보도의 게시 시각이라 그 조건을 부모 행에 걸어야 한다(임베딩 필터는 부모 행을 거르지 않는다).
 * ⚠ 관심 임베딩(`transfer_deal_watch`)이 **없다** — 날짜별 화면은 공개 화면이라 익명으로 받는다(`TransferDayDeal`).
 * ⚠ `transfer_deal!deal_id` — 보도 → 딜 경로를 못박는다(딜 쪽의 `latest:transfer_news!deal_id`와 같은 FK).
 */
export const DAY_REPORT_SELECT =
  `${REPORT_COLUMNS}, deal:transfer_deal!deal_id(${DEAL_COLUMNS}, from:transfer_club!from_club_code(${CLUB_COLUMNS}), to:transfer_club!to_club_code(${CLUB_COLUMNS}), loan:transfer_club!loan_club_code(${CLUB_COLUMNS}), suitors:transfer_deal_suitor(position, club:transfer_club(${CLUB_COLUMNS})))` as const;

/** 날짜 목록·이웃 날 — 시각과 딜만(날마다 보도·딜 수를 센다) */
export const DAY_STAMP_SELECT = "published_at, deal_id" as const;

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

/** 한국어 요약 우선 — 요약 단계가 아직 돌지 않았거나 버린 행은 영문 발췌로 대신한다(타임라인·목록이 같은 판정) */
function buildGist(row: Pick<TransferNewsRow, "summary_ko" | "body_excerpt">): ReportGist | null {
  if (row.summary_ko) return { text: row.summary_ko, lang: "ko" };
  if (row.body_excerpt) return { text: row.body_excerpt, lang: "en" };
  return null;
}

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
    // ⚠ `&amp;`를 푼다 — 수집기가 RSS 링크의 엔티티를 풀지 않던 때의 행이 남아 있고(수집 컬럼은 트리거가 고정해 고칠 수
    //   없다), 그대로 그리면 React가 다시 이스케이프해 `&amp;amp;` 주소가 된다. URL에 `&amp;`가 글자 그대로 있을 일은 없다
    originalUrl: (row.provenance_url ?? row.url)?.replaceAll("&amp;", "&") ?? null,
    gist: buildGist(row),
  };
}

/** `LATEST_REPORT_COLUMNS`가 돌려주는 행 */
export type LatestReportSelectRow = Pick<
  TransferNewsRow,
  "source_id" | "attribution" | "attributed_to" | "published_at" | "body_excerpt" | "summary_ko"
>;

function buildLatestReport(row: LatestReportSelectRow): TransferLatestReport {
  return {
    sourceId: row.source_id,
    attribution: row.attribution,
    attributedTo: row.attributed_to,
    publishedAt: row.published_at,
    gist: buildGist(row),
  };
}

/**
 * 딜을 **대표하는 보도** — 한국어 요약이 있는 보도 중 최신 `count`건, 그런 보도가 하나도 없을 때만 최신 `count`건.
 *
 * 공유 카드·검색 결과의 한 줄(상세 `generateMetadata`)과 보드 오른쪽 판의 "최신 보도"가 이 판정을 함께 쓴다 —
 * 호출부가 각자 고르지 않는다(`gist`를 매퍼가 고르는 것과 같은 이유).
 * - 요약(`summary_ko`)은 LLM이 "이동"으로 판정한 보도에만 있다. 판정 전·이동 아님 보도가 가장 최근이면 그 영문 발췌가
 *   대표가 되어, 이적 보도도 아닌 목록 기사("Top 10 highest-paid teenagers …")가 공유 카드 설명으로 나갔다.
 * - 요약 있는 보도가 하나도 없으면 지금까지처럼 최신 보도(영문 발췌)다 — 판정이 아직 돌지 않은 딜도 무언가를 말한다.
 * ⚠ **문구만** 고른다 — "업데이트 N분 전"(`latestReportedAt`)·정렬·타임라인은 최신 보도 그대로다.
 * ⚠ 입력 순서를 가정하지 않는다(시각으로 다시 정렬한다). 비교는 `sortReports`의 `latest`와 같다 — 문자열 비교는 소수 초를
 *   생략한 표기를 뒤집는다. 원본 배열을 바꾸지 않는다(쿼리 캐시의 배열이 그대로 들어온다).
 * ⚠ 서버(상세 page)가 직접 경로로 가져가므로 이 파일에 둔다 — `"use client"`가 없는 서버 안전 파일이다.
 */
export function headlineReports<T extends Pick<TransferReport, "publishedAt" | "gist">>(
  reports: readonly T[],
  count: number,
): T[] {
  const latestFirst = reports.slice().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const summarized = latestFirst.filter((r) => r.gist?.lang === "ko");
  return (summarized.length > 0 ? summarized : latestFirst).slice(0, count);
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
  form: TransferDealRow["form"];
  loan_clause: TransferDealRow["loan_clause"];
  loan_fee_text: TransferDealRow["loan_fee_text"];
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
  latest_reported_at: TransferDealRow["latest_reported_at"];
  report_count: TransferDealRow["report_count"];
  is_free_agent: TransferDealRow["is_free_agent"];
  from: ClubSelectRow | null;
  to: ClubSelectRow | null;
  /** 지금 임대로 뛰는 구단 */
  loan: ClubSelectRow | null;
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
    form: row.form,
    loanClub: buildClub(row.loan),
    loanClause: row.loan_clause,
    loanFeeText: row.loan_fee_text,
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
  latest: LatestReportSelectRow[] | null;
}

export function buildDealListItem(row: DealListSelectRow): TransferDealListItem {
  const latest = row.latest?.[0];
  return {
    ...buildDeal(row),
    latestReport: latest ? buildLatestReport(latest) : null,
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

/**
 * 하루에 싣는 보도 상한 — 한 건 더 받아(`+1`) 잘렸는지를 **정확히** 판정한다(댓글 목록과 같은 방식).
 * ⚠ 응답 크기가 이 값을 정한다 — 보도마다 딜(구단 셋 + 관심 구단)을 임베딩해 한 행이 약 2KB다(로컬 실측: 35건 70KB).
 *   Next Data Cache는 2MB를 넘는 응답을 캐시하지 않아, 넘으면 익명 요청마다 DB로 간다(빌드도 화면도 멀쩡해 드러나지 않는다).
 *   400건이면 약 0.8MB다. 값을 올리려면 응답 크기를 다시 재거나, 딜을 따로 받아 합치는 모양으로 바꾼다.
 */
export const TRANSFER_DAY_REPORT_LIMIT = 400;
/** 날짜 목록에 싣는 날 수 — 오늘을 포함해 최근 이만큼(소식이 없는 날은 빠진다) */
export const TRANSFER_DAY_LIST_DAYS = 30;
/**
 * 날짜 목록이 한 번에 받는 보도 시각 수 — PostgREST `max_rows`와 같은 값이다(더 크게 걸어도 응답은 조용히 이 수에서 잘린다).
 * 이 크기로 페이지를 넘겨 받는다(`queryDaySummaries`).
 */
export const TRANSFER_DAY_STAMP_PAGE = 1_000;
/**
 * 날짜 목록이 받는 페이지 수 상한 — 성수기에 하루 수백 건이어도 30일을 담는다. 여기 닿으면 가장 오래된 날은 일부만 받은 것이라
 * 그 날을 목록에서 뺀다(`buildDaySummaries`) — 건수가 거짓이 되지 않게.
 */
export const TRANSFER_DAY_STAMP_MAX_PAGES = 10;

/** `DAY_REPORT_SELECT`가 돌려주는 행 — 보도 + 딜(관심 임베딩 없음) */
export interface DayReportSelectRow extends ReportSelectRow {
  deal: Omit<DealSelectRow, "transfer_deal_watch"> | null;
}

/** `DAY_STAMP_SELECT`가 돌려주는 행 */
export type DayStampSelectRow = Pick<TransferNewsRow, "published_at" | "deal_id">;

function buildDayDeal(row: Omit<DealSelectRow, "transfer_deal_watch">): TransferDayDeal {
  // 관심 표시만 걷는다 — 나머지는 상세·목록과 같은 매퍼다(필드가 갈리지 않게)
  const { isWatched, ...deal } = buildDeal({ ...row, transfer_deal_watch: null });
  return deal;
}

/**
 * 하루의 보도 행 → 딜마다 묶은 소식.
 * - 행은 최신순으로 들어온다(`buildDayReportsQuery`) — 딜의 순서는 그 딜이 그 날 처음 보인 자리(= 그 날 가장 늦은 보도)다.
 * - 상한보다 한 건 더 받았으면 잘린 것이다 — 마지막 행을 버리고 `truncated`를 세운다.
 * - 딜이 없는 행(배정이 풀린 직후)은 버린다 — 조회가 `deal_id`로 거르지만 임베딩이 비는 순간이 있다.
 * - ⚠ `nowMs`보다 늦은 보도는 버린다 — 날짜 목록(`buildDaySummaries`)과 같은 셈이어야 한다(DB CHECK가 수집 시각 +1일까지
 *   받는다). 조건에 싣지 않고 여기서 거른다(조건에 지금 시각을 실으면 캐시 키가 요청마다 달라진다).
 */
export function buildTransferDay(
  dateKey: string,
  rows: DayReportSelectRow[],
  neighbors: { prev: string | null; next: string | null },
  nowMs: number,
): TransferDay {
  const truncated = rows.length > TRANSFER_DAY_REPORT_LIMIT;
  const kept = truncated ? rows.slice(0, TRANSFER_DAY_REPORT_LIMIT) : rows;
  const byDeal = new Map<number, TransferDayEntry>();
  let reportCount = 0;
  for (const row of kept) {
    if (!row.deal || !(Date.parse(row.published_at) <= nowMs)) continue;
    reportCount += 1;
    const entry = byDeal.get(row.deal.id);
    if (entry) entry.reports.push(buildReport(row));
    else byDeal.set(row.deal.id, { deal: buildDayDeal(row.deal), reports: [buildReport(row)] });
  }
  return {
    dateKey,
    entries: [...byDeal.values()],
    reportCount,
    truncated,
    prevKey: neighbors.prev,
    nextKey: neighbors.next,
  };
}

/**
 * 보도 시각 → 날짜 목록(최신 날 먼저). 날짜는 한국 시각이다(`kstDateKey`).
 * ⚠ `nowMs`보다 늦은 보도는 세지 않는다 — 미래 날짜가 목록·사이트맵에 실리면 그 주소는 404다.
 * ⚠ 상한에 닿았으면(`truncated`) **가장 오래된 날을 뺀다** — 그 날은 일부만 받아 건수가 거짓이다.
 */
export function buildDaySummaries(
  rows: DayStampSelectRow[],
  { nowMs, truncated }: { nowMs: number; truncated: boolean },
): TransferDaySummary[] {
  const days = new Map<string, { reports: number; deals: Set<number>; latestMs: number; latestAt: string }>();
  for (const row of rows) {
    const ms = Date.parse(row.published_at);
    if (row.deal_id === null || !(ms <= nowMs)) continue;
    const key = kstDateKey(ms);
    const day = days.get(key);
    if (day) {
      day.reports += 1;
      day.deals.add(row.deal_id);
      if (ms > day.latestMs) Object.assign(day, { latestMs: ms, latestAt: row.published_at });
    } else {
      days.set(key, { reports: 1, deals: new Set([row.deal_id]), latestMs: ms, latestAt: row.published_at });
    }
  }
  // 키가 `YYYY-MM-DD`라 문자열 순서가 곧 날짜 순서다
  const keys = [...days.keys()].sort().reverse();
  if (truncated) keys.pop();
  return keys.flatMap((key) => {
    const day = days.get(key);
    return day ? [{ dateKey: key, reportCount: day.reports, dealCount: day.deals.size, latestAt: day.latestAt }] : [];
  });
}

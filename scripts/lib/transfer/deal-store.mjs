/**
 * 딜 파생의 DB 층 — 보도 행 읽기(`loadRows`) → 파생·이름 조회·판정 호출의 조립(`runDerivation`) → 바뀐 값만 쓰기(`writeDeals`).
 * 순수 파생은 `derive-deals.mjs`에 있고 이 파일이 그것을 부른다(반대 방향 import는 순환이 된다 — `derive-deals.mjs`는 여기를 다시 내보내지 않는다).
 * `DEAL_COLUMNS`는 파생이 만드는 딜 컬럼과, `loadRows`의 필터는 `isCandidate`·`isSoftCandidate`의 앞 조건과 함께 바뀐다.
 */
import { readAll, upsertRows } from "../sync-db.mjs";
import { MIN_RELEVANCE, clubRowsToWrite, createExtractMemo, deriveDeals, isSettledFormChange, summarize } from "./derive-deals.mjs";
import { JUDGE_MAX_PER_RUN } from "./judge-parse.mjs";
import { replayJudgements } from "./judge.mjs";
import { buildNameBook, loadNameCache, lookupAndCache, lookupCurrentClubs, missingNames, overlayNameRows, syncDictionaryNames } from "./names-ko.mjs";
import { chunks } from "./util.mjs";
import { VERDICT_VALUE_COLUMNS } from "./verdict-columns.mjs";
import { derivationStartMs, loadWindows } from "./windows.mjs";

// ── DB ────────────────────────────────────────────────────────────────

const NEWS = "transfer_news";
const DEALS = "transfer_deal";
const CLUBS = "transfer_club";
const SUITORS = "transfer_deal_suitor";

/**
 * 범위 안에서 파생이 볼 행 — id 키셋으로 끝까지 읽는다(`max_rows`에 기대지 않는다 — pipeline.mjs와 같은 이유).
 *
 * ⚠ **후보가 될 수 없는 행은 DB에서 거른다** — 범위 안 보도 대부분은 이적 단계가 없거나 관련성이 낮은 일반 기사인데,
 *   그것까지 본문째 매시간 받던 것을 줄인다. 거르는 조건은 `isCandidate`의 앞 두 조건(단계 · 관련성)과 **같아야**
 *   한다 — 이 필터를 통과하지 못한 행은 `isCandidate`도 통과하지 못하므로 파생 결과가 달라지지 않는다.
 *   넓힌 후보(`isSoftCandidate`)는 "단계 없음 + 선수 있음"까지만 DB에서 거르고 이적 낱말은 본문을 봐야 해서 `deriveDeals`가 본다.
 *   선수·가십 모음 판정은 본문을 봐야 해서 지금처럼 `deriveDeals`가 한다.
 * ⚠ **이미 딜에 묶인 행(`deal_id`)은 후보가 아니어도 함께 읽는다** — 재처리로 단계를 잃은 행의 배정을 푸는
 *   판정(`writeDeals`의 해제)이 이 행들을 봐야 한다. 빼면 그 행이 옛 딜을 계속 가리킨다.
 * ⚠ 걸러진 행은 `skipped`의 "단계 없음"·"관련성 미달" 집계에서도 빠진다(로그 숫자만 줄고 판정은 같다).
 * ⚠ `attribution`·`attributed_to`는 판정 뒤 접기(`foldEchoes` — 같은 신문을 인용한 항목·원보도 우선)가 읽는다. 빠지면 테스트 픽스처에서만 돌고 운영에서는 조용히 꺼진다.
 */
/** 파생이 저장된 딜에서 보는 값(`existingKeys`) — 운영 파생과 이름 정비(`names-todo`)가 같은 판단을 하게 한 곳에 둔다 */
export const storedDealSnapshot = (d) => ({ stage: d.stage, settled_at: d.settled_at, form: d.form, loan_clause: d.loan_clause });

export const ROW_COLUMNS = `id, source_id, external_id, url, stage, players, clubs, body, published_at, relevance, deal_id, attribution, attributed_to, ${VERDICT_VALUE_COLUMNS.join(", ")}, verdict_at, verdict_model, verdict_prompt, verdict_input, verdict_article_chars, verdict_attempts, summary_ko`;

/**
 * @param {{ fullRaw?: boolean }} [opts] `fullRaw` — 원출력 값까지 읽는다(재생 `--replay`만 쓴다)
 *
 * ⚠ **원출력(`verdict_raw`, 최대 2000자)은 평소 읽지 않는다** — 파생은 "있는가"만 본다(금액까지 읽는 형식으로 판정된 행인가). 값까지
 *   매시간 받으면 판정된 행 수 × 수백 자가 그대로 전송된다. 그래서 본 조회에서는 빼고, 같은 조건으로 **원출력이 있는 행의 id만**
 *   한 번 더 읽어 `has_raw` 표지를 단다(text 컬럼 자리에 다른 타입을 넣지 않는다 — `hasRawVerdict`)(컬럼이 text라 PostgREST select로 "있는가"만 뽑을 수 없다). 값이 필요한 것은 재생뿐이다.
 */
async function loadRows(supabase, startMs, { fullRaw = false } = {}) {
  const page = async (columns, extra, lastId, limit) => {
    let q = supabase
      .from(NEWS)
      .select(columns)
      .gte("published_at", new Date(startMs).toISOString())
      .or(`deal_id.not.is.null,and(stage.neq.unknown,relevance.gte.${MIN_RELEVANCE}),and(stage.eq.unknown,players.neq.{})`);
    if (extra) q = extra(q);
    return q.gt("id", lastId).order("id").limit(limit);
  };
  const rows = [];
  let lastId = 0;
  for (;;) {
    const { data, error } = await page(fullRaw ? `${ROW_COLUMNS}, verdict_raw` : ROW_COLUMNS, null, lastId, 500);
    if (error) throw new Error(`보도 행 조회 실패: ${error.message}`);
    if (!data.length) break;
    rows.push(...data);
    lastId = data.at(-1).id;
  }
  if (fullRaw) return rows;
  const withRaw = new Set();
  lastId = 0;
  for (;;) {
    const { data, error } = await page("id", (q) => q.not("verdict_raw", "is", null), lastId, 1000);
    if (error) throw new Error(`원출력 표지 조회 실패: ${error.message}`);
    if (!data.length) break;
    for (const r of data) withRaw.add(r.id);
    lastId = data.at(-1).id;
  }
  for (const r of rows) r.has_raw = withRaw.has(r.id);
  return rows;
}

/** 파생이 쓰는 딜 컬럼 — 바뀌었는지 대조할 대상(`id`·`updated_at` 제외) */
const DEAL_COLUMNS = [
  "deal_key", "player", "player_ko", "position", "birth_year", "nationality", "from_club_code", "to_club_code", "stage",
  "fee_amount", "fee_currency", "fee_text", "fee_kind", "prev_fee_amount", "fee_low_amount", "fee_high_amount", "add_on_amount",
  "contract_text", "wage_text", "is_free_agent", "first_reported_at", "latest_reported_at", "report_count", "settled_at",
  "form", "loan_club_code", "loan_clause", "loan_fee_text",
];
const CLUB_COLUMNS = ["code", "canonical", "name", "short_name", "league"];
const TIME_COLUMNS = new Set(["first_reported_at", "latest_reported_at", "settled_at"]);
const NUMERIC_COLUMNS = new Set(["fee_amount", "prev_fee_amount", "fee_low_amount", "fee_high_amount", "add_on_amount"]);

/**
 * 저장된 값과 새로 파생한 값이 **같은가** — 같으면 그 행은 쓰지 않는다.
 * ⚠ **"같다"고 판정하는 쪽만 엄격하면 된다.** 다르다고 잘못 보면 한 번 더 쓸 뿐이지만(지금까지 매시간 하던 일이다),
 *   같다고 잘못 보면 바뀐 값이 저장되지 않는다. 그래서 정규화는 **표기 차이만** 접는다:
 *   - 시각: DB는 `+00:00`·마이크로초, 파생은 `…Z`·밀리초 → 같은 순간인지로 본다.
 *   - 금액: `numeric`이 JSON 숫자로 온다 → 숫자로 같은지 본다(반올림하지 않는다 — 소수 셋째 자리 값은 DB가
 *     반올림해 저장하므로 매번 "다름"이 되어 다시 쓰일 뿐이다).
 *   - `undefined`는 `null`과 같다(파생은 없는 값을 `null`로 둔다).
 */
function sameValue(column, stored, next) {
  const a = stored ?? null;
  const b = next ?? null;
  if (a === null || b === null) return a === b;
  if (TIME_COLUMNS.has(column)) return Date.parse(a) === Date.parse(b);
  if (NUMERIC_COLUMNS.has(column)) return Number(a) === Number(b);
  return a === b;
}
const sameRow = (columns, stored, next) => columns.every((c) => sameValue(c, stored[c], next[c]));


/**
 * 어떤 보도 행도 가리키지 않는 딜 — 이번에 파생되지 않은 딜 중에서 찾는다.
 * ⚠ **딜마다 따로 세지 않는다.** 범위 밖으로 나간 옛 창의 딜은 옛 보도가 계속 가리켜 지워지지 않으므로 창이 지날수록
 *   쌓이는데, 그 전부를 매시간 한 건씩 세면 1월 이후 실행당 딜 수만큼 왕복이 붙는다. 딜 목록을 페이지로 읽으면서
 *   참조 보도를 **최대 1건만** 임베딩해 보고(`transfer_news_deal_published_idx`를 탄다) 빈 딜만 고른다.
 * ⚠ 임베딩은 `limit 1`이라 결과가 잘려도 판정이 틀리지 않는다 — 1건이라도 오면 "참조됨", 0건이면 정말 0건이다.
 * ⚠ 보도 행을 사람이 지워 생긴 빈 딜도 여기서 잡힌다(이번 실행에 배정이 바뀐 딜만 보면 그 경로를 놓친다).
 * ⚠ **댓글·예측이 걸린 딜은 지우지 않는다**(`kept`로 따로 돌려준다). 두 FK가 `on delete restrict`라 지우려 하면
 *   23503으로 실패하고, 그렇게 두면 매시간 같은 실패가 종료 코드 1로 남는다. 보도가 끊긴 딜이 보드에 남는 것은
 *   사용자가 쓴 글·예측 기록을 잃는 것보다 싸다고 판단했다(`api-and-db.md` "삭제 규칙"). 댓글·예측도 같은 방식으로 1건만 본다.
 * @returns {{ orphans: object[], kept: object[] }}
 */
async function findOrphanDeals(supabase, keep) {
  const deals = await readAll(
    supabase,
    DEALS,
    "id, deal_key, player, refs:transfer_news!deal_id(id), comments:transfer_deal_comment!deal_id(id), predictions:transfer_deal_prediction!deal_id(deal_id)",
    "id",
    (q) =>
      q
        .limit(1, { referencedTable: "refs" })
        .limit(1, { referencedTable: "comments" })
        .limit(1, { referencedTable: "predictions" }),
  );
  const empty = deals.filter((d) => !keep.has(d.deal_key) && d.refs.length === 0);
  const userData = (d) => d.comments.length > 0 || d.predictions.length > 0;
  return {
    orphans: empty.filter((d) => !userData(d)),
    kept: empty.filter(userData),
  };
}

/**
 * 저장된 딜 전부(`id` + 파생이 쓰는 컬럼) — 파생의 `existingKeys`(저장된 단계·결과 시각)가 쓴다.
 * ⚠ `writeDeals`의 대조에는 **넘기지 않는다** — 실행 초반에 읽은 값이라 판정 단계(수 분) 동안 다른 쓰기(사람이 돌린 `--derive-only`
 *   등 — 정기 실행의 동시성 가드 밖이다)가 끼면 낡는다. 낡은 값과 대조하면 바뀐 딜이 "같다"로 보여 저장되지 않고, 알림의 옛 단계도
 *   어긋난다. `writeDeals`는 쓰기 직전에 다시 읽는다.
 * @returns {Promise<Map<string, object>>} deal_key → 저장된 행
 */
async function loadStoredDeals(supabase) {
  return new Map((await readAll(supabase, DEALS, `id, ${DEAL_COLUMNS.join(", ")}`, "deal_key")).map((d) => [d.deal_key, d]));
}

/**
 * 파생 결과를 쓴다 — 구단 → 딜 → 보도 행의 `deal_id` 순서(FK 방향).
 * ⚠ 행 단위 실패도 실패다(종료 코드 1) — 읽는 화면이 없어 종료 코드가 유일한 신호다.
 * 돌려주는 값은 저장 통계와 `changes`(이번 실행이 만든 새 딜·단계가 바뀐 딜 — 알림 단계가 읽는다)다.
 * ⚠ **값이 바뀐 구단·딜만 쓴다.** 매시간 전량을 upsert하면 값이 그대로인 행까지 트리거·인덱스 다섯 개가 갱신되고
 *   죽은 행 버전이 쌓인다 — 그리고 한 행만 실패해도 `upsertRows`가 **전량을 한 건씩** 다시 보낸다. 대조 기준은
 *   파생이 쓰는 컬럼 전부다(`DEAL_COLUMNS`·`CLUB_COLUMNS`). 그래서 `updated_at`은 "마지막으로 값이 바뀐 시각"이다
 *   (화면·사이트맵은 이 컬럼을 읽지 않는다 — `api-and-db.md`).
 */
export async function writeDeals(supabase, derived, rows, opts = {}) {
  const log = opts.log ?? console;
  const now = new Date().toISOString();
  const stats = { clubs: 0, deals: 0, unchanged: 0, suitors: 0, linked: 0, unlinked: 0, deleted: 0, failed: 0 };

  const storedClubs = new Map();
  for (const codes of chunks(derived.clubs.map((c) => c.code))) {
    const { data, error } = await supabase.from(CLUBS).select(CLUB_COLUMNS.join(", ")).in("code", codes);
    if (error) throw new Error(`구단 조회 실패: ${error.message}`);
    for (const c of data) storedClubs.set(c.code, c);
  }
  const clubRows = derived.clubs.filter((c) => !storedClubs.has(c.code) || !sameRow(CLUB_COLUMNS, storedClubs.get(c.code), c));
  const clubUp = await upsertRows(supabase, CLUBS, clubRows.map((c) => ({ ...c, updated_at: now })), { onConflict: "code" }, { log });
  stats.clubs = clubUp.saved.length;
  stats.failed += clubUp.failed.length;
  if (clubUp.aborted) throw new Error("계통적 실패로 구단 저장을 중단했다");

  // 저장된 딜(파생이 쓰는 컬럼 + id) — 바뀌었는지 대조하고, 바뀌지 않은 딜의 id도 여기서 얻는다.
  // ⚠ 쓰기 직전에 늘 다시 읽는다 — 실행 초반에 읽은 값(`loadStoredDeals`)은 판정 단계 동안 낡는다(그 함수 주석)
  const stored = new Map();
  for (const keys of chunks(derived.deals.map((d) => d.deal_key))) {
    const { data, error } = await supabase.from(DEALS).select(`id, ${DEAL_COLUMNS.join(", ")}`).in("deal_key", keys);
    if (error) throw new Error(`딜 조회 실패: ${error.message}`);
    for (const d of data) stored.set(d.deal_key, d);
  }
  const dealRows = derived.deals.map(({ rowIds: _rowIds, suitorCodes: _suitorCodes, contextOnly: _contextOnly, ...d }) => d);
  const changedDeals = dealRows.filter((d) => !stored.has(d.deal_key) || !sameRow(DEAL_COLUMNS, stored.get(d.deal_key), d));
  const dealUp = await upsertRows(supabase, DEALS, changedDeals.map((d) => ({ ...d, updated_at: now })), { onConflict: "deal_key" }, { log });
  stats.deals = dealUp.saved.length;
  stats.unchanged = dealRows.length - changedDeals.length;
  stats.failed += dealUp.failed.length;
  if (dealUp.aborted) throw new Error("계통적 실패로 딜 저장을 중단했다");
  // 이번 파생이 DB에 있다고 보증하는 딜 = 바뀌지 않은 딜 + 이번에 저장한 딜(저장 실패한 딜은 빠진다)
  const changedKeys = new Set(changedDeals.map((d) => d.deal_key));
  const savedKeys = new Set([...dealRows.filter((d) => !changedKeys.has(d.deal_key)).map((d) => d.deal_key), ...dealUp.saved.map((d) => d.deal_key)]);
  // 이번에 저장하지 못한 딜(행 단위 실패) — 저장된 옛 딜이 있으면 그대로 둔다(아래 배정·빈 딜 정리 둘 다 이 딜을 건드리지 않는다)
  const unsavedKeys = new Set([...changedKeys].filter((k) => !savedKeys.has(k)));

  // deal_key → id. 바뀌지 않은 딜은 위에서 읽은 값을 쓰고, 이번에 저장한 딜만 다시 읽는다
  // (upsert는 id를 돌려주지 않는다 — 배치·행 단위 폴백 어느 경로로 저장됐든 여기서 한 번에 읽는다)
  const idByKey = new Map();
  for (const key of savedKeys) if (!changedKeys.has(key)) idByKey.set(key, stored.get(key).id);
  for (const keys of chunks(dealUp.saved.map((d) => d.deal_key))) {
    const { data, error } = await supabase.from(DEALS).select("id, deal_key").in("deal_key", keys);
    if (error) throw new Error(`딜 id 조회 실패: ${error.message}`);
    for (const d of data) idByKey.set(d.deal_key, d.id);
  }

  /*
   * 이번 실행이 바꾼 것 — **새 딜과 단계가 바뀐 딜**. 알림 단계(`notify.mjs`)가 이 목록에서만 알림을 만든다
   * (저장된 값과의 차이가 곧 "소식"이다 — 기록만 보고 만들면 처음 켠 날 보드 전체가 알림이 된다).
   * 구단 약칭·최신 보도 요약처럼 알림 문구에 쓸 값을 여기서 함께 풀어 둔다 — 그 단계가 딜 파생의 내부 모양을 몰라도 되게.
   */
  const clubShort = new Map(derived.clubs.map((c) => [c.code, c.short_name]));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const derivedByKey = new Map(derived.deals.map((d) => [d.deal_key, d]));
  const changes = [];
  for (const saved of dealUp.saved) {
    const prev = stored.get(saved.deal_key) ?? null;
    const prevStage = prev?.stage ?? null;
    const dealId = idByKey.get(saved.deal_key);
    if (dealId == null) continue;
    const deal = derivedByKey.get(saved.deal_key);
    const formChanged = isSettledFormChange(prev, deal);
    if (prevStage === saved.stage && !formChanged) continue;
    const destinations = [deal.to_club_code, ...deal.suitorCodes].filter(Boolean);
    const latestSummary = deal.rowIds
      .map((id) => rowById.get(id))
      .filter((r) => r?.summary_ko)
      .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0]?.summary_ko;
    changes.push({
      dealId,
      prevStage,
      stage: deal.stage,
      player: deal.player,
      playerKo: deal.player_ko ?? null,
      fromShort: deal.from_club_code ? (clubShort.get(deal.from_club_code) ?? null) : null,
      toShorts: destinations.flatMap((code) => clubShort.get(code) ?? []),
      isFreeAgent: deal.is_free_agent === true,
      form: deal.form ?? null,
      formChanged,
      contextOnly: deal.contextOnly === true,
      clubCodes: [...new Set([deal.from_club_code, ...destinations, deal.loan_club_code].filter(Boolean))],
      latestReportedAt: deal.latest_reported_at,
      summary: latestSummary ?? null,
    });
  }

  /*
   * ⚠ **여기서부터의 실패는 변화 목록을 에러에 실어 던진다.** 딜은 이미 새 단계로 저장됐다 — 뒤 단계(관심 구단 · 보도 배정 ·
   *   빈 딜 정리)가 던져 목록이 버려지면 다음 실행에는 차이가 없어 그 알림이 영영 나가지 않는다. 호출부(`sync-transfer-news.mjs`)가
   *   에러의 `changes`로 알림을 마저 보낸다.
   */
  async function finishWrite() {
    // 관심 구단(자식 행) — 딜마다 저장된 집합과 대조해 바뀐 딜만 지우고 다시 넣는다(유력한 순 position)
    const dealIds = [...idByKey.values()];
    const storedSuitors = new Map();
    for (const ids of chunks(dealIds)) {
      const { data, error } = await supabase.from(SUITORS).select("deal_id, club_code, position").in("deal_id", ids);
      if (error) throw new Error(`관심 구단 조회 실패: ${error.message}`);
      for (const r of data) (storedSuitors.get(r.deal_id) ?? storedSuitors.set(r.deal_id, []).get(r.deal_id)).push(r);
    }
    for (const deal of derived.deals) {
      const id = idByKey.get(deal.deal_key);
      if (id == null) continue;
      const want = deal.suitorCodes.map((club_code, position) => ({ deal_id: id, club_code, position }));
      const have = (storedSuitors.get(id) ?? []).sort((a, b) => a.position - b.position);
      if (JSON.stringify(have.map((r) => [r.club_code, r.position])) === JSON.stringify(want.map((r) => [r.club_code, r.position]))) continue;
      const { error: delErr } = await supabase.from(SUITORS).delete().eq("deal_id", id);
      if (delErr) { stats.failed++; log.error(`✗ 관심 구단 정리 실패(${deal.player}): ${delErr.message}`); continue; }
      if (want.length) {
        const { error: insErr } = await supabase.from(SUITORS).insert(want);
        if (insErr) { stats.failed++; log.error(`✗ 관심 구단 저장 실패(${deal.player}): ${insErr.message}`); continue; }
      }
      stats.suitors += 1;
    }

    // 보도 행 → 딜. 이미 같은 값이면 건너뛴다(쓰기를 아낀다)
    const assigned = new Set();
    const current = new Map(rows.map((r) => [r.id, r.deal_id ?? null]));
    for (const deal of derived.deals) {
      const id = idByKey.get(deal.deal_key);
      // 저장 실패한 딜 — 행은 옛 배정을 유지한다. ⚠ 배정한 것으로 센다 — 안 세면 아래 해제가 그 행들의 `deal_id`를 비우고,
      //   보도가 끊긴 옛 딜을 빈 딜 정리가 지웠다(관심은 cascade로 사라지고, 다음 실행에 새 id로 다시 생겨 "새 이적설"로 알려졌다)
      for (const rowId of deal.rowIds) assigned.add(rowId);
      if (id == null) continue;
      const changed = deal.rowIds.filter((rowId) => current.get(rowId) !== id);
      for (const ids of chunks(changed)) {
        const { error } = await supabase.from(NEWS).update({ deal_id: id }).in("id", ids);
        if (error) { stats.failed += ids.length; log.error(`✗ deal_id 배정 실패(${deal.player}): ${error.message}`); continue; }
        stats.linked += ids.length;
      }
    }
    // 범위 안인데 이번 파생에서 어느 딜에도 속하지 않은 행은 배정을 푼다(범위 밖 행은 건드리지 않는다 — 그 딜을 지우지 않기 위해서다)
    const stale = rows.filter((r) => r.deal_id != null && !assigned.has(r.id)).map((r) => r.id);
    for (const ids of chunks(stale)) {
      const { error } = await supabase.from(NEWS).update({ deal_id: null }).in("id", ids);
      if (error) { stats.failed += ids.length; log.error(`✗ deal_id 해제 실패: ${error.message}`); continue; }
      stats.unlinked += ids.length;
    }

    // 어떤 보도 행도 가리키지 않는 딜만 지운다(관심은 cascade, 댓글·예측이 걸린 딜은 남긴다 — findOrphanDeals 주석)
    const { orphans, kept } = await findOrphanDeals(supabase, new Set([...savedKeys, ...unsavedKeys]));
    for (const d of kept) log.warn(`⚠ 보도가 끊겼지만 댓글·예측이 있어 남긴 딜: ${d.player} (${d.deal_key})`);
    for (const d of orphans) {
      const { error: delErr } = await supabase.from(DEALS).delete().eq("id", d.id);
      // 판정과 삭제 사이에 댓글·예측이 달렸다(두 FK restrict) — 실패가 아니라 "남긴 딜"이다
      if (delErr?.code === "23503" && /transfer_deal_(comment|prediction)/.test(`${delErr.message} ${delErr.details ?? ""}`)) { log.warn(`⚠ 삭제하려던 사이 댓글·예측이 달려 남긴 딜: ${d.player} (${d.deal_key})`); continue; }
      if (delErr) { stats.failed++; log.error(`✗ 딜 삭제 실패(${d.player}): ${delErr.message}`); continue; }
      stats.deleted++;
      log.warn(`⚠ 보도 행이 하나도 남지 않은 딜을 지웠다: ${d.player} (${d.deal_key})`);
    }
    return { ...stats, changes };
  }

  try {
    return await finishWrite();
  } catch (e) {
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { changes });
  }
}

/**
 * 조회 → 파생 → 이름 조회 → LLM 판정·요약 → (dryRun이 아니면) 쓰기.
 * `rejudgeStalePrompt`(지금 지시문의 지문)를 주면 다른 지문으로 난 판정만 다시 묻고, `judgeLimit`은 판정 상한이다(판정 함수에 넘긴 값과 같게).
 * `loanOnly`는 `rejudgeStalePrompt`와 함께 — 지시문이 바뀐 판정 중 임대를 말하는 보도만 다시 묻는다(`mentionsLoan`).
 * @param {{ dryRun?: boolean, rejudge?: boolean, rejudgeStalePrompt?: string | null, loanOnly?: boolean, judgeLimit?: number, nowMs?: number, log?: Console, fetchImpl?: typeof fetch, lookupNames?: boolean,
 *   judge?: ((needs: object[], names: object) => Promise<{ updates: object[] }>) | null }} opts
 *   `judge`는 판정 함수(`judge.mjs`의 `runJudgements`를 호출부가 감싸 넘긴다). 없으면(키가 없다) 판정하지 않는다 —
 *   판정이 없는 **새** 딜은 열리지 않고 이미 있는 딜은 남는다. `rejudge`는 저장된 판정을 무시하고 전부 다시 묻는다.
 * @returns {{ summary: object, warnings: string[], skipped: object, write: object | null, lookup: object | null, judged: object | null }}
 */
export async function runDerivation(supabase, opts = {}) {
  const log = opts.log ?? console;
  const nowMs = opts.nowMs ?? Date.now();
  const windows = loadWindows();
  const rows = await loadRows(supabase, derivationStartMs(nowMs, windows), { fullRaw: Boolean(opts.replay && !opts.dryRun) });
  /*
   * 이름 사전 — 캐시 표는 한 번 읽고, 이번 실행이 **무엇을 썼는지 아는** 쓰기(사전 맞춤·위키데이터 조회)는 쓴 행을 덧입혀 사전을 다시 만든다
   * (`overlayNameRows`). 무엇을 썼는지 모르는 쓰기(판정·재생의 이름 쓰기)만 표를 다시 읽는다.
   */
  let nameCache = await loadNameCache(supabase);
  let names = buildNameBook(nameCache);
  const applyNames = (written) => {
    if (!written?.length) return;
    nameCache = overlayNameRows(nameCache, written);
    names = buildNameBook(nameCache);
  };
  const reloadNames = async () => {
    nameCache = await loadNameCache(supabase);
    names = buildNameBook(nameCache);
  };
  // 사람 사전이 캐시와 갈린 표기를 맞춘다(캐시·요약) — 한 번 맞추면 다시 대상이 되지 않는다. 드라이런은 쓰지 않는다
  let nameSync = null;
  if (!opts.dryRun) {
    nameSync = await syncDictionaryNames(supabase, names);
    applyNames(nameSync.written.map((w) => ({ kind: "player", key: w.key, name_ko: w.name_ko })));
  }
  /*
   * 재생 — 저장된 원출력(`verdict_raw`)을 지금의 해석으로 다시 읽는다(API를 부르지 않는다). 해석·구단 확인·요약 손질을 고친 뒤
   * 사람이 한 번 돌린다(`--replay`). 달라진 행만 쓰고 메모리의 행에 입혀 이어서 파생한다.
   */
  let replayed = null;
  if (opts.replay && !opts.dryRun) {
    replayed = await replayJudgements(supabase, rows, { names, fetchImpl: opts.fetchImpl, nowMs, log });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const { id, ...fields } of replayed.updates) Object.assign(byId.get(id) ?? {}, fields);
    if (replayed.namesWritten) await reloadNames();
  }
  // 이미 저장된 딜 — 판정이 없어도 남기고(판정이 멎은 시간에 보드가 통째로 비지 않게), 판정이 덜 찬 딜은 저장된 단계·결과 시각을 지킨다.
  // ⚠ `writeDeals`의 대조에는 넘기지 않는다 — 판정 단계 동안 낡는다(`loadStoredDeals` 주석)
  const storedDeals = await loadStoredDeals(supabase);
  const existingKeys = new Map([...storedDeals].map(([k, d]) => [k, storedDealSnapshot(d)]));
  // 이름을 찾아 다시 파생할 때 추출을 되풀이하지 않도록 메모를 여러 번의 파생이 나눠 쓴다
  const memo = createExtractMemo();
  const derive = (rejudge = false) => deriveDeals(rows, {
    nowMs, windows, names, memo, requireVerified: true, requireVerdict: true, upgradeVerdicts: true, rejudge, existingKeys,
    rejudgeStalePrompt: opts.rejudgeStalePrompt ?? null, loanOnly: Boolean(opts.loanOnly), judgeLimit: opts.judgeLimit,
  });
  let derived = derive(Boolean(opts.rejudge));

  /*
   * 이름 사전 채우기 — 딜에 오른 이름 중 한국어 표기가 없는 것만 위키데이터에서 찾아 캐시에 쓴다.
   * 새로 찾은 것이 있으면 **다시 파생**한다(순수 함수라 싸다) — 같은 실행에서 화면·요약이 한국어가 된다.
   * 드라이런은 찾지 않는다(캐시에 쓰는 일이다). 조회 실패는 경고일 뿐이다 — 사전이 비어도 영문으로 그린다.
   */
  let lookup = null;
  const lookupMissing = async () => {
    const missing = missingNames(derived.nameNeeds, names, nowMs);
    if (!missing.length) return;
    const r = await lookupAndCache(supabase, missing, { fetchImpl: opts.fetchImpl, book: names });
    lookup = lookup ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? [...lookup[k], ...v] : lookup[k] + v])) : r;
    // 못 찾은 이름도 덧입힌다 — 그래야 판정 뒤의 두 번째 조회가 같은 이름을 다시 찾지 않는다(`RECHECK_MS`)
    applyNames(r.written);
    if (r.found > 0 || r.verified > 0) derived = derive(Boolean(opts.rejudge));
  };
  if (!opts.dryRun && opts.lookupNames !== false) await lookupMissing();

  /*
   * 출발 구단 폴백 — 보도가 소속을 말하지 않는 딜의 선수는 현 소속을 위키데이터(P54)에서 찾아 캐시하고 **다시 파생**한다
   * (같은 실행에서 출발 구단이 채워진다). 이름 조회와 같은 모델이다 — 드라이런은 찾지 않고, 실패는 경고다.
   */
  let clubLookup = null;
  const lookupClubs = async () => {
    if (!derived.clubNeeds.length) return;
    const r = await lookupCurrentClubs(supabase, derived.clubNeeds, { fetchImpl: opts.fetchImpl, book: names });
    clubLookup = clubLookup ? { ...r, tried: clubLookup.tried + r.tried, found: clubLookup.found + r.found, notFound: clubLookup.notFound + r.notFound, failed: clubLookup.failed + r.failed, warnings: [...clubLookup.warnings, ...r.warnings] } : r;
    applyNames(r.written);
    if (r.found > 0) derived = derive(Boolean(opts.rejudge));
  };
  if (!opts.dryRun && opts.lookupNames !== false) await lookupClubs();

  /*
   * LLM 판정 — 5대 리그 구단이 걸린 후보 중 물어야 할 것만 묻는다(`deriveDeals`의 `judgeNeeds` — 딜에 든 보도 + 선수 없이 묻는 보도).
   * 이름 조회 **뒤**에 돈다(조회로 확인된 선수의 보도도 같은 실행에서 판정받게). 결과를 메모리의 행에 입혀 **다시 파생**하고,
   * 모델이 새로 읽은 선수·확인한 구단이 있으면 이름 사전을 다시 읽고 한 번 더 찾는다(그 선수가 같은 실행에서 확인되게).
   * 드라이런은 묻지 않는다(비용이 들고 DB에 쓴다) — 저장된 판정만으로 파생한다.
   */
  let judged = null;
  // 이번 실행에 물을 대상의 모양(실행 요약) — 판정 뒤 다시 파생하면 judgeNeeds가 바뀌므로 묻기 전에 센다
  const limit = opts.judgeLimit ?? JUDGE_MAX_PER_RUN;
  const asked = derived.judgeNeeds.slice(0, limit);
  const needStats = {
    total: derived.judgeNeeds.length,
    asked: asked.length,
    summaryOnly: asked.filter((x) => x.mode === "summary").length,
    explore: asked.filter((x) => x.playerKey == null).length,
    deferred: Math.max(0, derived.judgeNeeds.length - limit),
  };
  if (!opts.dryRun && opts.judge && derived.judgeNeeds.length) {
    judged = await opts.judge(derived.judgeNeeds, names);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const { id, ...fields } of judged.updates) Object.assign(byId.get(id) ?? {}, fields);
    if (judged.namesWritten) await reloadNames();
    if (judged.updates.length) {
      derived = derive();
      if (opts.lookupNames !== false) {
        await lookupMissing();
        await lookupClubs();
      }
    }
  }

  // 구단 표에는 프리셋 구단 전부를 함께 쓴다(`clubRowsToWrite`) — 요약의 구단 수는 이번 파생에 나온 것만 센다
  const write = opts.dryRun
    ? null
    : await writeDeals(supabase, { ...derived, clubs: clubRowsToWrite(derived.clubs, names) }, rows, { log });
  return {
    summary: summarize(derived),
    warnings: [...derived.warnings, ...(nameSync?.warnings ?? []), ...(lookup?.warnings ?? []), ...(clubLookup?.warnings ?? []), ...(replayed?.warnings.filter((w) => !w.includes("판정 불가")) ?? []), ...(judged?.warnings ?? [])],
    skipped: derived.skipped,
    deals: derived.deals,
    needStats,
    repeatedFailures: derived.repeatedFailures,
    write,
    lookup,
    clubLookup,
    judged,
    nameSync,
    replayed,
  };
}

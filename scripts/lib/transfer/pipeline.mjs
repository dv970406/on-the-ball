/**
 * 이적 소식 동기화 파이프라인 — 수집 → 추출·귀속 → `transfer_news` 저장.
 *
 * ⚠ **멱등해야 한다.** 정기 실행이 같은 피드를 반복해서 읽으므로 두 번 돌려서 행이 늘면
 *   그 순간 쓸 수 없게 된다 → 저장은 `(source_id, external_id)` 충돌 시 무시다.
 * ⚠ **소스 하나가 죽어도 나머지는 계속 간다.** 소스는 언젠가 죽는다는 것이 이 기능의 상수다.
 */
import { clampCp, isoOrNull, str, upsertRows } from "../sync-db.mjs";
import { resolveAttribution, clusterKey } from "./attribution.mjs";
import { extractTransfer } from "./extract.mjs";
import { MAX_ITEM_AGE_DAYS, findSource } from "./registry.mjs";
import { itemExternalId, parseRoundupItems } from "./roundup.mjs";
import { COLLECTOR_UA, createAdapter } from "./sources.mjs";
import { ITEM_MARK, isRoundup } from "./story.mjs";

const TABLE = "transfer_news";
const CONFLICT = "source_id,external_id";

/**
 * 게시 시각이 수집 시각보다 이만큼 넘게 미래면 받지 않는다.
 *
 * ⚠ **미래 시각 한 건이 그 소스를 잠근다.** 커서가 저장된 행의 max(published_at)이고 어댑터는
 *   `커서 이전`을 전부 버리므로, 2027년 날짜 글 하나가 저장되면 그때까지 새 글이 모두 "이미 본
 *   것"이 된다(QA에서 재현: 다음 실행 신규 0건, 결과는 OK). 원문이 트리거로 고정돼 있어 행을
 *   지우지 않고는 풀 수 없다. Bluesky의 createdAt은 클라이언트가 정하는 값이라 실제로 들어올 수 있다.
 * ⚠ 시계 오차·타임존 표기 흔들림을 받아 줄 여유만 둔다.
 */
const FUTURE_SLACK_MS = 10 * 60_000;

/**
 * 소스별 커서 — 그 소스에서 저장한 가장 최신 게시 시각.
 * ⚠ 커서 테이블을 따로 두지 않는 이유는 마이그레이션 20260924000001 머리말에.
 * ⚠ `nowIso` 이하로 좁힌다 — 위 방어 이전에 들어온 미래 시각 행이 있어도 커서를 잠그지 않게.
 */
async function readCursor(supabase, sourceId, nowIso) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("published_at")
    .eq("source_id", sourceId)
    .lte("published_at", nowIso)
    .order("published_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`커서 조회 실패: ${error.message}`);
  return data.length ? new Date(data[0].published_at) : null;
}

/**
 * 이미 저장된 external_id — 저장 전에 걸러 **새 항목만** 넣는다.
 *
 * ⚠ 충돌 무시 upsert만으로도 행은 늘지 않지만, 충돌한 행마다 identity 값이 소모되고 쓰기가 나간다.
 *   RSS는 커서를 쓰지 않아 매 실행 피드 전체(실행당 200여 건)가 그 경로를 탔다.
 * ⚠ 조회를 조각낸다 — `in.(…)`이 URL에 실리므로 Bluesky의 긴 at:// id 수백 개를 한 번에 보내면 한도를 넘는다.
 */
async function existingIds(supabase, sourceId, ids) {
  const found = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("external_id")
      .eq("source_id", sourceId)
      .in("external_id", ids.slice(i, i + 50));
    if (error) throw new Error(`기존 항목 조회 실패: ${error.message}`);
    for (const r of data) found.add(r.external_id);
  }
  return found;
}

/**
 * 같은 소스에 이미 저장된 URL — 항목 키가 달라도 URL이 같으면 같은 기사다.
 * ⚠ 개정 번호를 걷기 전(`canonicalGuid`)에 저장된 행은 키가 옛 해시라 키만으로는 걸러지지 않는다 — 규칙을 바꾼 첫
 *   수집에서 피드에 남아 있던 기사가 전부 한 번 더 들어온다. URL로 한 번 더 거른다.
 * ⚠ 같은 URL을 계속 고쳐 쓰는 라이브 블로그는 첫 판만 남는다 — 여러 선수가 섞인 글이라 딜의 근거로 쓰지 않는다.
 */
async function existingUrls(supabase, sourceId, urls) {
  const found = new Set();
  const list = [...new Set(urls.filter(Boolean))];
  for (let i = 0; i < list.length; i += 50) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("url")
      .eq("source_id", sourceId)
      .in("url", list.slice(i, i + 50));
    if (error) throw new Error(`기존 URL 조회 실패: ${error.message}`);
    for (const r of data) found.add(r.url);
  }
  return found;
}

async function countRows(supabase, sourceId) {
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  if (error) throw new Error(`행 수 조회 실패: ${error.message}`);
  return count ?? 0;
}

function httpUrlOrNull(v) {
  return typeof v === "string" && /^https?:\/\//.test(v) && v.length <= 2048 ? v : null;
}

/**
 * Postgres text가 받지 못하는 것을 걷어낸다 — NUL(22P05)과 짝 없는 서로게이트(22P02).
 * ⚠ 이 둘은 행 하나를 통째로 거부시키고, 그 글이 소스의 최신 글이면 **매 실행 같은 실패**가 된다.
 */
function pgSafe(v) {
  return typeof v === "string" ? v.replace(/\u0000/g, "").toWellFormed() : v;
}

/**
 * 보이는 글자가 하나라도 있는가 — DB `public.has_visible_char`와 **같거나 더 엄격해야** 한다.
 *
 * ⚠ `str()`(sync-db.mjs)는 이 판정에 못 쓴다 — 그쪽 문자 집합이 DB보다 좁아서, 양방향 제어문자
 *   (U+202A–202E)·C0/C1 제어문자만 있는 본문을 통과시키고 DB가 23514로 거부한다(QA 퍼징).
 *   DB보다 **넓게** 거르는 쪽은 안전하다 — 그래서 DB가 받아들이는 채움 문자(U+115F·U+1160·
 *   U+3164·U+FFA0, 화면에 아무것도 안 그린다)도 여기서 함께 버린다.
 * ⚠ DB 함수의 클래스를 고치면 여기도 고친다(마이그레이션 20260802000001).
 */
const INVISIBLE_ONLY =
  /^[\u0000-\u0020\u007f-\u00a0\u00ad\u034f\u061c\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f\u2060-\u2064\u206a-\u206f\u3000\ufeff\u115f\u1160\u3164\uffa0]*$/u;

function hasVisibleText(v) {
  return typeof v === "string" && !INVISIBLE_ONLY.test(v);
}

/**
 * 어댑터 항목을 **저장할 모양으로** 다듬는다.
 * ⚠ 추출·귀속은 이 결과로 판정한다 — 절단 전 원문으로 판정하면, 재처리(저장된 값으로 판정)가
 *   방금 넣은 행의 판정을 뒤집을 수 있다.
 */
function normalizeItem(item) {
  const author = pgSafe(item.authorHandle);
  return {
    externalId: pgSafe(item.externalId),
    url: httpUrlOrNull(item.url),
    provenanceUrl: httpUrlOrNull(item.provenanceUrl),
    authorHandle: hasVisibleText(author) ? clampCp(author.trim(), 200) : null,
    text: typeof item.text === "string" ? clampCp(pgSafe(item.text), 20000) : "",
    publishedAt: item.publishedAt,
  };
}

/**
 * 추출 컬럼 — 수집과 재처리가 **같은 함수**로 만든다.
 * ⚠ 둘이 각자 조립하면 재처리한 행과 새로 들어온 행의 판정이 갈린다.
 */
function derive(def, item) {
  const att = resolveAttribution(def, item);
  if (!att) return null;
  const ex = extractTransfer(item.text);
  // ⚠ 0.005m 미만("€0m")은 numeric(6,2)에서 0이 되어 `fee_amount > 0` CHECK에 걸리고 **행 전체가**
  //   거부된다 — 이적료만 비우면 될 일이다. 추출기는 원본과 같은 값을 내도록 그대로 둔다.
  const hasFee = ex.feeAmount != null && ex.feeAmount >= 0.005 && ex.feeText != null && ex.feeCurrency != null;
  return {
    attribution: att.attribution,
    attributed_to: att.attributedTo ? clampCp(att.attributedTo, 200) : null,
    tier: att.tier,
    stage: ex.stage,
    players: ex.players.slice(0, 20),
    clubs: ex.clubs.slice(0, 20),
    fee_text: hasFee ? clampCp(ex.feeText, 40) : null,
    fee_amount: hasFee ? ex.feeAmount : null,
    fee_currency: hasFee ? ex.feeCurrency : null,
    cluster_key: clusterKey(ex.players, ex.clubs, item.text),
    relevance: Math.round(ex.relevance * 100) / 100,
  };
}

/**
 * 어댑터 항목 → 행. 저장할 수 없는 항목이면 사유 문자열을 돌려준다.
 */
function toRow(def, raw, { floorMs, nowMs }) {
  const item = normalizeItem(raw);
  const publishedAt = isoOrNull(item.publishedAt);
  if (!publishedAt) return "날짜";
  const t = new Date(publishedAt).getTime();
  if (t < floorMs) return "오래됨";
  if (t > nowMs + FUTURE_SLACK_MS) return "미래 시각";
  // ⚠ 보이는 글자가 없으면 DB의 has_visible_char CHECK가 거부한다 — 배치를 흔들기 전에 거른다
  if (!hasVisibleText(item.text)) return "빈 본문";
  if (!str(item.externalId)) return "키";

  const derived = derive(def, item);
  if (!derived) return "저자 미상";

  return {
    source_id: def.id,
    external_id: clampCp(item.externalId, 300),
    url: item.url,
    provenance_url: item.provenanceUrl,
    author_handle: item.authorHandle,
    body: item.text,
    published_at: publishedAt,
    ...derived,
  };
}

/**
 * 소스 하나를 동기화한다.
 * @param {{ dryRun?: boolean, log?: Console, nowMs?: number }} opts
 */
async function syncSource(supabase, def, opts = {}) {
  const log = opts.log ?? console;
  const nowMs = opts.nowMs ?? Date.now();
  const floorMs = nowMs - MAX_ITEM_AGE_DAYS * 86_400_000;
  const started = Date.now();
  const result = { sourceId: def.id, ok: false, fetched: 0, rows: 0, inserted: 0, skipped: {}, warnings: [], error: null, ms: 0 };

  try {
    /*
     * ⚠ **RSS에는 커서를 쓰지 않는다.** 매체 피드는 시간순이 아니다 — 녹화한 실제 피드에서 BBC는
     *   84건 중 36곳, Google News는 100건 중 45~51곳에서 순서가 뒤집혀 있었다. 커서 이전 시각으로
     *   **늦게 올라온** 기사는 `published <= since`에서 영구히 버려진다(QA 재현: 부분 수집 뒤
     *   62건 유실 — 원본 크롤러도 정확히 같은 62건을 잃었다). RSS는 한 페이지뿐이라 커서가 줄여
     *   주는 요청도 없다 → 매번 피드 전체를 싣고 중복은 `(source_id, external_id)`가 버린다.
     * ⚠ Bluesky·텔레그램은 커서를 유지한다 — 게시 순서가 곧 id 순서라 역전이 없고, 커서가
     *   페이지네이션의 멈출 지점을 정한다.
     */
    const since = opts.dryRun || def.kind === "rss" ? null : await readCursor(supabase, def.id, new Date(nowMs).toISOString());
    const { items, warnings } = await createAdapter(def)(since);
    result.fetched = items.length;
    result.warnings = warnings;

    const rows = [];
    for (const item of items) {
      const r = toRow(def, item, { floorMs, nowMs });
      if (typeof r === "string") result.skipped[r] = (result.skipped[r] ?? 0) + 1;
      else rows.push(r);
    }
    result.rows = rows.length;

    if (opts.dryRun) {
      result.preview = rows;
    } else if (rows.length) {
      const seen = await existingIds(supabase, def.id, rows.map((r) => r.external_id));
      const byKey = rows.filter((r) => !seen.has(r.external_id));
      if (seen.size) result.skipped["이미 있음"] = seen.size;
      // 키는 새것이지만 URL이 이미 있는 항목(같은 기사의 개정판) — 매체 RSS만 본다(게시글은 URL이 곧 키다)
      const seenUrls = def.kind === "rss" ? await existingUrls(supabase, def.id, byKey.map((r) => r.url)) : new Set();
      // 같은 배치 안의 같은 URL도 한 번만 넣는다(피드가 같은 기사를 두 번 싣는다)
      const batchUrls = new Set();
      const fresh = byKey.filter((r) => {
        if (!r.url || def.kind !== "rss") return true;
        if (seenUrls.has(r.url) || batchUrls.has(r.url)) return false;
        batchUrls.add(r.url);
        return true;
      });
      if (byKey.length > fresh.length) result.skipped["같은 URL(개정판)"] = byKey.length - fresh.length;
      if (!fresh.length) {
        result.ok = true;
        result.ms = Date.now() - started;
        return result;
      }
      const before = await countRows(supabase, def.id);
      // ⚠ 충돌 무시는 그대로 둔다 — 조회와 저장 사이에 다른 실행이 같은 항목을 넣을 수 있다
      const up = await upsertRows(supabase, TABLE, fresh, { onConflict: CONFLICT, ignoreDuplicates: true }, { log });
      result.inserted = (await countRows(supabase, def.id)) - before;
      if (up.aborted) throw new Error("계통적 실패로 저장을 중단했다");
      // ⚠ 행 단위 실패도 실패다 — 경고로만 남기면 그 글은 영구히 빠지는데 정기 실행은 초록으로
      //   지나간다. 읽는 화면이 없어 종료 코드가 유일한 신호다.
      if (up.failed.length) throw new Error(`저장 실패 ${up.failed.length}건 — ${up.failed[0].message}`);
    }
    result.ok = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  result.ms = Date.now() - started;
  return result;
}

/**
 * 여러 소스를 동시성 제한을 두고 돌린다.
 * ⚠ 소스마다 다른 호스트지만 동시성을 낮게 유지해 상대 서버를 배려한다.
 */
export async function syncSources(supabase, defs, opts = {}) {
  const queue = [...defs];
  const results = [];
  const concurrency = Math.min(opts.concurrency ?? 3, queue.length || 1);
  async function worker() {
    for (let def = queue.shift(); def; def = queue.shift()) {
      results.push(await syncSource(supabase, def, opts));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

/**
 * 저장된 원문을 다시 추출한다(재수집 없음).
 *
 * 추출 규칙은 계속 바뀐다 — 크롤러에서 "never in doubt" 오분류를 고치면서 규칙을 갈아엎었다.
 * 그때마다 소스를 다시 긁으면 상대 서버에 민폐이고, 이미 지워진 글은 되찾을 수도 없다.
 *
 * ⚠ **추출 컬럼만 바꾼다.** 수집 컬럼은 읽은 값을 그대로 되싣고, 트리거
 *   (`transfer_news_freeze_collected`)가 하나라도 달라지면 거부한다.
 * ⚠ 삭제 후 재삽입이 아니라 upsert다 — 그 사이에 읽는 사람이 빈 목록을 보지 않게.
 */
export async function reprocessAll(supabase, opts = {}) {
  const log = opts.log ?? console;
  const stats = { read: 0, updated: 0, lostAttribution: [], unknownSource: 0, failed: 0 };

  /*
   * ⚠ **offset이 아니라 id 키셋으로 넘긴다.** `range(from, …)` + "1000행 미만이면 끝"은 서버의
   *   `max_rows`가 1000이라는 가정에 기대는데, 원격 설정이 더 작으면 첫 페이지에서 조용히 멈춰
   *   일부만 재처리된다. 키셋은 빈 페이지에서만 멈추므로 상한이 얼마든 끝까지 간다.
   */
  const PAGE = 500;
  let lastId = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, source_id, external_id, url, provenance_url, author_handle, body, published_at, fetched_at")
      .gt("id", lastId)
      .order("id")
      .limit(PAGE);
    if (error) throw new Error(`재처리 조회 실패: ${error.message}`);
    if (!data.length) break;
    stats.read += data.length;
    lastId = data[data.length - 1].id;

    const rows = [];
    for (const { id, ...row } of data) {
      const def = findSource(row.source_id);
      if (!def) {
        stats.unknownSource++;
        continue;
      }
      const derived = derive(def, { authorHandle: row.author_handle, provenanceUrl: row.provenance_url, text: row.body });
      /*
       * ⚠ 규칙이 좁아져 귀속을 잃은 행은 **지우지 않지만 실패로 알린다.** 그 행은 옛 저자 표기를
       *   단 채 공개 상태로 남아 "확증 못 한 항목은 행이 없다"는 불변식을 깬다 — 지우는 것은
       *   되돌릴 수 없는 결정이라 사람이 id를 보고 판단한다(삭제는 트리거가 막지 않는다).
       */
      if (!derived) {
        stats.lostAttribution.push(id);
        continue;
      }
      // id는 싣지 않는다 — generated always라 upsert의 insert 경로가 거부한다
      rows.push({ ...row, ...derived });
    }

    const up = await upsertRows(supabase, TABLE, rows, { onConflict: CONFLICT }, { log });
    stats.updated += up.saved.length;
    stats.failed += up.failed.length;
    if (up.aborted) throw new Error("계통적 실패로 재처리를 중단했다");
  }
  return stats;
}

/** 가십 칼럼을 싣는 소스 — 이 소스의 칼럼만 항목으로 나눈다(`story.mjs`의 `isRoundup`과 같은 소스) */
const ROUNDUP_SOURCES = ["rss:bbc-gossip", "rss:bbc-football", "rss:sky-transfers"];
/** 실행당 받는 칼럼 상한 — 첫 실행(최근 14일 백필)이나 페이지 구조가 바뀐 날에도 요청이 몰리지 않게 */
export const ROUNDUP_MAX_PER_RUN = 20;
const ROUNDUP_TIMEOUT_MS = 10_000;

/** 칼럼 HTML 받기 — 실패하면 null(다음 실행이 다시 받는다). 던지지 않는다 */
async function fetchRoundupHtml(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": COLLECTOR_UA }, signal: AbortSignal.timeout(ROUNDUP_TIMEOUT_MS), redirect: "follow" });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/**
 * 가십 칼럼을 항목 행으로 나눠 저장한다(`roundup.mjs` 머리말).
 *
 * 최근 `MAX_ITEM_AGE_DAYS`일의 칼럼 중 **항목 행이 아직 없는 것**만 받는다 — 칼럼마다 한 번이다.
 * 새로 수집한 칼럼과 이 기능 이전에 저장된 칼럼(백필)을 같은 경로가 맡는다.
 *
 * ⚠ 항목 행은 칼럼 행과 **같은 `toRow`** 로 만든다 — 귀속·추출·저장 검사가 새로 수집한 행과 갈리지 않는다.
 *   수집 컬럼(URL·게시 시각·작성자)은 칼럼 행의 값을 물려받는다.
 * ⚠ 받지 못한 칼럼(403·시간 초과·구조 변경으로 항목 0개)은 경고만 남기고 다음 실행이 다시 받는다 —
 *   칼럼 행은 그대로라 잃는 것이 없다.
 * @param {{ dryRun?: boolean, nowMs?: number, fetchImpl?: typeof fetch, limit?: number }} opts
 */
export async function expandRoundups(supabase, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const limit = opts.limit ?? ROUNDUP_MAX_PER_RUN;
  const floorMs = nowMs - MAX_ITEM_AGE_DAYS * 86_400_000;
  const floorIso = new Date(floorMs).toISOString();
  const stats = { columns: 0, fetched: 0, items: 0, inserted: 0, failed: [], deferred: 0, preview: [] };

  const { data: rows, error } = await supabase
    .from(TABLE)
    .select("source_id, external_id, url, provenance_url, author_handle, body, published_at")
    .in("source_id", ROUNDUP_SOURCES)
    .gte("published_at", floorIso)
    .not("external_id", "like", `%${ITEM_MARK}%`)
    .order("published_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`가십 칼럼 조회 실패: ${error.message}`);
  const columns = rows.filter((r) => isRoundup(r) && r.url);
  stats.columns = columns.length;
  if (!columns.length) return stats;

  // 이미 나눈 칼럼 — 항목 행의 external_id 앞부분이 칼럼의 external_id다
  const { data: done, error: e2 } = await supabase
    .from(TABLE)
    .select("source_id, external_id")
    .in("source_id", ROUNDUP_SOURCES)
    .gte("published_at", floorIso)
    .like("external_id", `%${ITEM_MARK}%`)
    .limit(10_000);
  if (e2) throw new Error(`가십 항목 조회 실패: ${e2.message}`);
  const expanded = new Set(done.map((r) => `${r.source_id}|${r.external_id.split(ITEM_MARK)[0]}`));
  // 최신 칼럼부터 — 상한에 걸리면 오래된 칼럼이 다음 실행으로 밀린다
  const todo = columns.filter((c) => !expanded.has(`${c.source_id}|${c.external_id}`));
  stats.deferred = Math.max(0, todo.length - limit);

  for (const col of todo.slice(0, limit)) {
    const def = findSource(col.source_id);
    if (!def) continue;
    const html = await fetchRoundupHtml(col.url, fetchImpl);
    const texts = html ? parseRoundupItems(html) : [];
    if (!texts.length) {
      stats.failed.push(col.url);
      continue;
    }
    stats.fetched += 1;
    const itemRows = [];
    for (const text of texts) {
      const r = toRow(
        def,
        { externalId: itemExternalId(col.external_id, text), url: col.url, provenanceUrl: col.provenance_url, authorHandle: col.author_handle, text, publishedAt: col.published_at },
        { floorMs, nowMs },
      );
      if (typeof r !== "string") itemRows.push(r);
    }
    stats.items += itemRows.length;
    if (opts.dryRun) {
      stats.preview.push({ column: col.body.split("\n")[0], items: itemRows.map((r) => ({ stage: r.stage, players: r.players, body: r.body })) });
      continue;
    }
    if (!itemRows.length) continue;
    const up = await upsertRows(supabase, TABLE, itemRows, { onConflict: CONFLICT, ignoreDuplicates: true });
    if (up.aborted) throw new Error("계통적 실패로 가십 항목 저장을 중단했다");
    if (up.failed.length) throw new Error(`가십 항목 저장 실패 ${up.failed.length}건 — ${up.failed[0].message}`);
    stats.inserted += up.saved.length;
  }
  return stats;
}

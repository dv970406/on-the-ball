/**
 * 딜 파생 — `transfer_news`(보도 행)에서 선수 단위 이적 건(`transfer_deal`)을 만든다.
 *
 * 보드는 어드민 큐레이션이 없다 — 이 파생이 유일한 원천이다. 그래서 **틀린 칸보다 빈 칸**이 규칙이다:
 * 방향·이적료·계약·주급은 그 선수가 나오는 문장에서만 읽고, 못 읽으면 null로 둔다(compose.mjs와 같은 판단).
 *
 * 두 층으로 나뉜다.
 *   - `deriveDeals(rows, opts)` — **순수 함수**. 행 배열 → 딜·구단·행 배정. 회귀 테스트(`test-transfer-derive.mjs`)가
 *     DB 없이 이것만 돌린다.
 *   - `runDerivation(supabase, opts)` — 조회 → 파생 → 쓰기. `sync-transfer-news.mjs`의 마지막 단계다.
 *
 * ⚠ **멱등하다.** 딜 키가 선수명 해시라 다시 돌려도 같은 딜에 upsert되고(`id` 보존 — 관심 FK가 id를 본다),
 *   보도 행의 `deal_id`는 매번 다시 배정된다.
 * ⚠ **삭제하지 않는다** — 범위 밖으로 나간 딜은 화면의 범위 필터가 가린다. 지우는 것은 **어떤 보도 행도
 *   더는 가리키지 않는 딜**뿐이다(앵커 규칙이 바뀌어 그 선수가 안 잡히게 된 경우).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { clampCp, slugify, upsertRows } from "../sync-db.mjs";
import { clubCode, clubDisplay } from "./club-display.mjs";
import { contractText, parseContract } from "./contract.mjs";
import { DEST, FORMER, FROM, LEFT_FREE, addVotes, collectVotes, topVote } from "./direction.mjs";
import { extractTransfer } from "./extract.mjs";
import { createNameBook, loadGlossary, loadNameBook, loadPlayerDictionary, lookupAndCache, missingNames } from "./names-ko.mjs";
import { RANK, RENEWAL, cleanBody, isRoundup, mentionRe, sentencesOf } from "./story.mjs";

/** 이적 관련성 하한 — 그 아래는 경기 리뷰·부상 소식이 단계 규칙에 스친 것이다 */
export const MIN_RELEVANCE = 0.3;
/** 보드 범위 시작보다 이만큼 앞선 보도까지 본다 — 창 직전의 "합의" 보도가 창 안의 오피셜과 한 이야기다 */
export const SCOPE_SLACK_MS = 14 * 86_400_000;

function readJson(rel) {
  const url = new URL(rel, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch (e) {
    throw new Error(`${url.pathname}를 읽지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
  }
}
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
export const loadWindows = () => readJson("./windows.json").windows.map(windowSpan);

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

/** 선수명 정규형 — 딜 키와 사전(`players-ko.json`) 키가 이걸로 만들어진다 */
export function normalizePlayer(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
/** ⚠ 16자리 소문자 hex — `transfer_deal.deal_key`의 CHECK와 한 쌍이다. 영구 계약(관심이 이 딜의 id를 본다) */
export const dealKey = (normalized) => createHash("sha1").update(normalized).digest("hex").slice(0, 16);

const ts = (r) => Date.parse(r.published_at);
const tokens = (normalized) => normalized.split(" ");

/**
 * 후보 행 — 선수가 잡혔고 이적 단계가 있는 보도. 가십 모음은 뺀다(한 선수의 이야기로 읽으면 남의 구단·금액이 섞인다).
 */
function isCandidate(r, startMs) {
  return (
    r.stage !== "unknown" &&
    Array.isArray(r.players) && r.players.length > 0 &&
    Number(r.relevance) >= MIN_RELEVANCE &&
    !isRoundup(r) &&
    ts(r) >= startMs
  );
}

/**
 * 행을 선수별로 묶는다. 키는 `players[0]`의 정규형.
 * ⚠ 한 토큰 이름("Isak")은 같은 범위의 두 토큰 이름("Alexander Isak")의 **마지막 토큰**과 같으면 그 딜로 합친다.
 *   두 토큰 이름끼리는 합치지 않는다(동성이인). 마지막 토큰이 같은 두 토큰 이름이 여럿이면 어느 쪽인지
 *   알 수 없어 합치지 않는다.
 */
function groupByPlayer(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = normalizePlayer(r.players[0]);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const multi = [...groups.keys()].filter((k) => tokens(k).length >= 2);
  for (const k of [...groups.keys()]) {
    if (tokens(k).length !== 1) continue;
    const owners = multi.filter((m) => tokens(m).at(-1) === k);
    if (owners.length !== 1) continue;
    groups.get(owners[0]).push(...groups.get(k));
    groups.delete(k);
  }
  for (const list of groups.values()) list.sort((a, b) => ts(a) - ts(b) || a.id - b.id);
  return groups;
}

/** 표시할 영문명 — 가장 자주 쓰인 표기, 동률이면 긴 쪽(성만 쓴 행보다 풀네임) */
function displayName(rows, key) {
  const count = new Map();
  for (const r of rows) {
    for (const p of r.players) {
      const n = normalizePlayer(p);
      if (n === key || (tokens(n).length === 1 && tokens(key).at(-1) === n)) count.set(p, (count.get(p) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || tokens(normalizePlayer(b[0])).length - tokens(normalizePlayer(a[0])).length || b[0].length - a[0].length)[0][0];
}

/**
 * 그 선수에게 해당하는 단계 — 추출기가 그 선수만 잡은 행이 아니면 선수가 나오는 문장만으로 다시 판정한다
 * (곁들여 나온 선수가 기사 주인공의 단계를 받는 것을 막는다 — compose.mjs의 `stageFor`와 같은 규칙).
 */
function stageFor(r, mentions) {
  if (r.players.every((p) => mentions.test(p))) return r.stage;
  let best = "unknown";
  for (const s of sentencesOf(cleanBody(r)).filter((x) => mentions.test(x))) {
    const st = extractTransfer(s).stage;
    if (st === "collapsed") return "collapsed";
    if (RANK.indexOf(st) > RANK.indexOf(best)) best = st;
  }
  return best;
}

/** 그 행에서 그 선수의 이적료 — 행의 `fee_*`가 아니라 **선수가 나오는 문장**에서 다시 읽는다(다선수 기사에서 남의 금액이 섞인다) */
function feeOf(storySentences) {
  for (const s of [...storySentences].reverse()) {
    const ex = extractTransfer(s);
    if (ex.feeText && ex.feeAmount >= 0.005) return { amount: ex.feeAmount, currency: ex.feeCurrency, text: ex.feeText };
  }
  return null;
}
function firstOf(storySentences, pick) {
  for (const s of [...storySentences].reverse()) {
    const v = pick(extractTransfer(s));
    if (v != null) return v;
  }
  return null;
}

/** 방향 — 딜의 모든 행을 시간순으로 투표에 태운다(최신 행 2배). 선수가 나오는 문장만 본다 */
/**
 * 자유계약을 **확인하는** 표현 — 이적료가 비었다는 것만으로는 자유계약이 아니다(대개 금액 미보도).
 * ⚠ 그 선수가 나오는 문장에서만 본다(`it.sentences`) — 한 기사에 다른 선수의 자유계약이 섞인다.
 */
const FREE_AGENT_RE = /\b(?:free agent|free transfer|on a free)\b/i;

function resolveDirection(items, player) {
  const free = new Map(), from = new Map(), dest = new Map(), former = new Map();
  const last = items.at(-1);
  let anyFreeAgent = false;
  for (const it of items) {
    const w = it === last ? 2 : 1;
    addVotes(free, collectVotes(it.sentences, LEFT_FREE, player, w));
    addVotes(from, collectVotes(it.sentences, FROM, player, w));
    addVotes(dest, collectVotes(it.sentences, DEST, player, w));
    // 전 소속("former West Ham striker")은 이름 없이 쓰이는 일이 많아 단독 선수 기사 전체에서 읽는다
    addVotes(former, collectVotes(it.storySentences, FORMER, player, w));
    if (it.sentences.some((s) => FREE_AGENT_RE.test(s))) anyFreeAgent = true;
  }
  const freeClub = topVote(free);
  const fromClub = freeClub ?? topVote(from);
  const destClub = topVote(dest);
  const isFree = Boolean(freeClub) || anyFreeAgent;
  // 같은 구단이 양쪽에 오면 어느 쪽도 믿지 않는다(compose.mjs와 같은 판단)
  const origin = fromClub && fromClub !== destClub ? fromClub : null;
  const destination = destClub && destClub !== fromClub ? destClub : null;
  // 소속을 못 읽었으면 전 소속이 출발 구단이다 — 자유 계약("former Real Madrid defender")도 그 구단을 떠나온 것이다
  const formerClub = origin ? null : topVote(former);
  return { from: origin ?? (formerClub && formerClub !== destination ? formerClub : null), to: destination, isFree };
}

/** 대표 단계 — 진전 최대. 단 무산 보도가 그 진전 보도보다 **나중**이면 무산. 공식 발표는 뒤집히지 않는다 */
function resolveStage(items) {
  const progressed = items.filter((it) => it.stage !== "collapsed");
  if (!progressed.length) return "collapsed";
  let best = progressed[0];
  for (const it of progressed) if (RANK.indexOf(it.stage) >= RANK.indexOf(best.stage)) best = it;
  if (best.stage === "official") return "official";
  const collapsedLater = items.some((it) => it.stage === "collapsed" && ts(it.row) > ts(best.row));
  return collapsedLater ? "collapsed" : best.stage;
}

/** 이적료 — 최신 보도의 값 + 같은 통화의 직전 다른 값 + 같은 통화 보도 범위 */
function resolveFee(items) {
  const withFee = items.filter((it) => it.fee);
  if (!withFee.length) return { fee: null, prev: null, low: null, high: null };
  const latest = withFee.at(-1).fee;
  const same = withFee.map((it) => it.fee).filter((f) => f.currency === latest.currency);
  const prev = [...same].reverse().slice(1).find((f) => f.amount !== latest.amount)?.amount ?? null;
  const amounts = same.map((f) => f.amount);
  return { fee: latest, prev, low: Math.min(...amounts), high: Math.max(...amounts) };
}

/**
 * `transfer_club` 행 — 프리셋(엠블럼·한국어)이 있으면 그 코드, 없으면 slugify(정규 영문명)로 파일 없는 코드.
 * 표기는 이름 사전(`names-ko.mjs` — 프리셋 → 사람 → 위키데이터 캐시)이 정하고, 없으면 정규 영문명 그대로다.
 */
export function clubRecord(canonical, names = createNameBook()) {
  const code = clubCode(canonical) ?? slugify(canonical);
  if (!code) return null;
  const ko = names.club(canonical);
  // 길이는 transfer_club의 CHECK(canonical·name ≤120 · short_name ≤40)에 맞춘다 — 사전 밖 구단명은 원문 구절이다
  return {
    code,
    canonical: clampCp(canonical, 120),
    name: clampCp(ko?.name ?? canonical, 120),
    short_name: clampCp(ko?.short ?? canonical, 40),
    league: clubDisplay(canonical).league,
  };
}

/**
 * @param {object[]} rows  transfer_news 행(id, source_id, stage, players, body, published_at, relevance)
 * @param {{ nowMs: number, windows?: object[], names?: ReturnType<typeof createNameBook> }} opts
 *   `names`가 없으면 사람이 고친 JSON만으로 만든 사전을 쓴다(자동 캐시 없음 — 테스트가 이 경로다).
 * @returns {{ deals: object[], clubs: object[], assignments: Map<number, string>, nameNeeds: object[], warnings: string[], skipped: Record<string, number>, startMs: number }}
 *   `nameNeeds`는 딜마다 선수 키·구단 정규명 — 이름 사전에서 빠진 것을 찾는 데 쓴다(저장하지 않는다).
 */
export function deriveDeals(rows, opts) {
  const windows = opts.windows ?? loadWindows();
  const names = opts.names ?? createNameBook({ players: loadPlayerDictionary(), clubs: loadGlossary().clubs });
  const startMs = derivationStartMs(opts.nowMs, windows);
  const warnings = [];
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };

  const candidates = rows.filter((r) => {
    if (isCandidate(r, startMs)) return true;
    skip(r.stage === "unknown" ? "단계 없음" : !r.players?.length ? "선수 없음" : Number(r.relevance) < MIN_RELEVANCE ? "관련성 미달" : isRoundup(r) ? "가십 모음" : "범위 밖");
    return false;
  });

  const deals = [];
  const clubs = new Map();
  const assignments = new Map();
  const missingKo = [];
  const nameNeeds = [];

  for (const [key, group] of groupByPlayer(candidates)) {
    const player = displayName(group, key);
    const surname = tokens(key).at(-1);
    // 성이 짧으면(≤2) 풀네임으로만 찾는다 — 두 글자 성은 다른 단어에 너무 자주 나온다
    const mentions = new RegExp(`${mentionRe(player).source}${surname.length > 2 && tokens(key).length > 1 ? `|${mentionRe(surname).source}` : ""}`, "iu");

    const items = [];
    for (const r of group) {
      const stage = stageFor(r, mentions);
      if (stage === "unknown") { skip("그 선수의 단계 없음"); continue; }
      const all = sentencesOf(cleanBody(r));
      const sentences = all.filter((s) => mentions.test(s));
      // 계약·이적료·주급은 추출기가 **그 선수 한 명만** 잡은 기사라면 기사 전체에서 읽는다 — 로마노는 둘째 문장을
      // "Former … centre back signs a one year deal until June 2027"처럼 이름 없이 쓴다
      const single = r.players.every((p) => mentions.test(p));
      const storySentences = single ? all : sentences;
      items.push({ row: r, stage, sentences, storySentences, fee: feeOf(storySentences) });
    }
    if (!items.length) continue;

    const dir = resolveDirection(items, player);
    // 소속·행선지를 못 읽었는데 재계약·첫 프로 계약 표현이면 이적이 아니다(compose.mjs와 같은 판정) —
    // 유스 선수의 "first professional contract" 공지가 오피셜 딜로 잡혔다(실측)
    if (!dir.from && !dir.to && !dir.isFree && items.some((it) => it.storySentences.some((s) => RENEWAL.test(s)))) {
      skip("재계약·첫 프로 계약");
      continue;
    }
    const stage = resolveStage(items);
    const { fee, prev, low, high } = resolveFee(items);
    const addOn = fee ? firstOf(items.flatMap((it) => it.storySentences), (ex) => (ex.addOnAmount != null && ex.addOnCurrency === fee.currency ? ex.addOnAmount : null)) : null;
    const wage = firstOf(items.flatMap((it) => it.storySentences), (ex) => ex.wageText);
    const contract = contractText(parseContract(items.flatMap((it) => it.storySentences)));

    const fromClub = dir.from ? clubRecord(dir.from, names) : null;
    let toClub = dir.to ? clubRecord(dir.to, names) : null;
    if (fromClub && toClub && fromClub.code === toClub.code) toClub = null; // CHECK from <> to
    for (const c of [fromClub, toClub]) if (c) clubs.set(c.code, c);

    const playerKo = names.playerKo(key);
    const info = names.playerInfo(key);
    if (!playerKo) missingKo.push(player);
    nameNeeds.push({ player, playerKey: key, fromCanonical: fromClub ? dir.from : null, toCanonical: toClub ? dir.to : null });

    const times = items.map((it) => ts(it.row));
    deals.push({
      deal_key: dealKey(key),
      player: clampCp(player, 120),
      player_ko: playerKo,
      position: info?.position ?? null,
      birth_year: info?.birthYear ?? null,
      nationality: info?.nationality ?? null,
      from_club_code: fromClub?.code ?? null,
      to_club_code: toClub?.code ?? null,
      stage,
      fee_amount: fee?.amount ?? null,
      fee_currency: fee?.currency ?? null,
      fee_text: fee ? clampCp(fee.text, 40) : null,
      prev_fee_amount: fee ? prev : null,
      fee_low_amount: fee ? low : null,
      fee_high_amount: fee ? high : null,
      add_on_amount: addOn,
      contract_text: contract ? clampCp(contract, 20) : null,
      wage_text: wage ? clampCp(wage, 20) : null,
      // ⚠ 이적료가 확인되면 자유계약이 아니다(DB CHECK `transfer_deal_free_agent_no_fee`) — 화면은
      //   이적료가 있으면 금액, 없고 이 값이 켜졌으면 "FA(자유 계약)", 둘 다 아니면 "미공개"를 그린다
      is_free_agent: dir.isFree && !fee,
      first_reported_at: new Date(Math.min(...times)).toISOString(),
      latest_reported_at: new Date(Math.max(...times)).toISOString(),
      report_count: items.length,
      rowIds: items.map((it) => it.row.id),
    });
    for (const it of items) assignments.set(it.row.id, dealKey(key));
  }

  if (missingKo.length) warnings.push(`한국어 표기가 없는 선수 ${missingKo.length}명(사람 사전·위키데이터 모두 없음) — 영문명으로 그려진다: ${missingKo.join(", ")}`);
  deals.sort((a, b) => b.latest_reported_at.localeCompare(a.latest_reported_at));
  return { deals, clubs: [...clubs.values()], assignments, nameNeeds, warnings, skipped, startMs };
}

/** 요약(로그·드라이런) */
export function summarize(derived) {
  const stages = {};
  for (const d of derived.deals) stages[d.stage] = (stages[d.stage] ?? 0) + 1;
  const n = derived.deals.length;
  const pct = (k) => (n ? `${Math.round((k / n) * 100)}%` : "—");
  return {
    deals: n,
    stages,
    withDirection: pct(derived.deals.filter((d) => d.from_club_code && d.to_club_code).length),
    withAnyClub: pct(derived.deals.filter((d) => d.from_club_code || d.to_club_code).length),
    withFee: pct(derived.deals.filter((d) => d.fee_amount != null).length),
    linkedRows: derived.assignments.size,
    clubs: derived.clubs.length,
  };
}

// ── DB ────────────────────────────────────────────────────────────────

const NEWS = "transfer_news";
const DEALS = "transfer_deal";
const CLUBS = "transfer_club";
const CHUNK = 100;

/** 범위 안의 후보 행 — id 키셋으로 끝까지 읽는다(`max_rows`에 기대지 않는다 — pipeline.mjs와 같은 이유) */
async function loadRows(supabase, startMs) {
  const rows = [];
  let lastId = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(NEWS)
      .select("id, source_id, stage, players, body, published_at, relevance, deal_id")
      .gte("published_at", new Date(startMs).toISOString())
      .gt("id", lastId)
      .order("id")
      .limit(500);
    if (error) throw new Error(`보도 행 조회 실패: ${error.message}`);
    if (!data.length) break;
    rows.push(...data);
    lastId = data.at(-1).id;
  }
  return rows;
}

const chunks = (arr) => Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, i) => arr.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * 파생 결과를 쓴다 — 구단 → 딜 → 보도 행의 `deal_id` 순서(FK 방향).
 * ⚠ 행 단위 실패도 실패다(종료 코드 1) — 읽는 화면이 없어 종료 코드가 유일한 신호다.
 */
export async function writeDeals(supabase, derived, rows, opts = {}) {
  const log = opts.log ?? console;
  const now = new Date().toISOString();
  const stats = { clubs: 0, deals: 0, linked: 0, unlinked: 0, deleted: 0, failed: 0 };

  const clubUp = await upsertRows(supabase, CLUBS, derived.clubs.map((c) => ({ ...c, updated_at: now })), { onConflict: "code" }, { log });
  stats.clubs = clubUp.saved.length;
  stats.failed += clubUp.failed.length;
  if (clubUp.aborted) throw new Error("계통적 실패로 구단 저장을 중단했다");

  const dealRows = derived.deals.map(({ rowIds: _rowIds, ...d }) => ({ ...d, updated_at: now }));
  const dealUp = await upsertRows(supabase, DEALS, dealRows, { onConflict: "deal_key" }, { log });
  stats.deals = dealUp.saved.length;
  stats.failed += dealUp.failed.length;
  if (dealUp.aborted) throw new Error("계통적 실패로 딜 저장을 중단했다");
  const savedKeys = new Set(dealUp.saved.map((d) => d.deal_key));

  // deal_key → id (upsert는 id를 돌려주지 않는다 — 배치·행 단위 폴백 어느 경로로 저장됐든 여기서 한 번에 읽는다)
  const idByKey = new Map();
  for (const keys of chunks([...savedKeys])) {
    const { data, error } = await supabase.from(DEALS).select("id, deal_key").in("deal_key", keys);
    if (error) throw new Error(`딜 id 조회 실패: ${error.message}`);
    for (const d of data) idByKey.set(d.deal_key, d.id);
  }

  // 보도 행 → 딜. 이미 같은 값이면 건너뛴다(쓰기를 아낀다)
  const assigned = new Set();
  const current = new Map(rows.map((r) => [r.id, r.deal_id ?? null]));
  for (const deal of derived.deals) {
    const id = idByKey.get(deal.deal_key);
    if (id == null) continue; // 저장 실패한 딜 — 행은 옛 배정을 유지한다
    for (const rowId of deal.rowIds) assigned.add(rowId);
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

  // 어떤 보도 행도 가리키지 않는 딜만 지운다(관심은 cascade)
  const { data: existing, error: exErr } = await supabase.from(DEALS).select("id, deal_key, player");
  if (exErr) throw new Error(`딜 목록 조회 실패: ${exErr.message}`);
  for (const d of existing.filter((x) => !savedKeys.has(x.deal_key))) {
    const { count, error } = await supabase.from(NEWS).select("id", { count: "exact", head: true }).eq("deal_id", d.id);
    if (error) { stats.failed++; log.error(`✗ 딜 참조 수 조회 실패(${d.player}): ${error.message}`); continue; }
    if (count) continue;
    const { error: delErr } = await supabase.from(DEALS).delete().eq("id", d.id);
    if (delErr) { stats.failed++; log.error(`✗ 딜 삭제 실패(${d.player}): ${delErr.message}`); continue; }
    stats.deleted++;
    log.warn(`⚠ 보도 행이 하나도 남지 않은 딜을 지웠다: ${d.player} (${d.deal_key})`);
  }
  return stats;
}

/**
 * 조회 → 파생 → (dryRun이 아니면) 쓰기.
 * @returns {{ summary: object, warnings: string[], skipped: object, write: object | null }}
 */
export async function runDerivation(supabase, opts = {}) {
  const log = opts.log ?? console;
  const nowMs = opts.nowMs ?? Date.now();
  const windows = loadWindows();
  const rows = await loadRows(supabase, derivationStartMs(nowMs, windows));
  let names = await loadNameBook(supabase);
  let derived = deriveDeals(rows, { nowMs, windows, names });

  /*
   * 이름 사전 채우기 — 딜에 오른 이름 중 한국어 표기가 없는 것만 위키데이터에서 찾아 캐시에 쓴다.
   * 새로 찾은 것이 있으면 **다시 파생**한다(순수 함수라 싸다) — 같은 실행에서 화면·요약이 한국어가 된다.
   * ⚠ 드라이런은 찾지 않는다(캐시에 쓰는 일이다). 조회 실패는 경고일 뿐이다 — 사전이 비어도 영문으로 그린다.
   */
  let lookup = null;
  if (!opts.dryRun && opts.lookupNames !== false) {
    const missing = missingNames(derived.nameNeeds, names, nowMs);
    if (missing.length) {
      lookup = await lookupAndCache(supabase, missing, { fetchImpl: opts.fetchImpl });
      if (lookup.found > 0) {
        names = await loadNameBook(supabase);
        derived = deriveDeals(rows, { nowMs, windows, names });
      }
    }
  }

  const write = opts.dryRun ? null : await writeDeals(supabase, derived, rows, { log });
  return { summary: summarize(derived), warnings: [...derived.warnings, ...(lookup?.warnings ?? [])], skipped: derived.skipped, deals: derived.deals, write, lookup };
}

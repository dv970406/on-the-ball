/**
 * 이름 사전 — 선수·구단의 한국어 표기를 **한 곳에서** 정한다. 딜 파생(`derive-deals.mjs` — 화면의 선수명·구단명)과
 * LLM 판정·요약(`judge.mjs` — 모델에 넘기는 표기)이 같은 사전을 본다. 둘이 갈리면 화면의 이름과 요약문의
 * 이름이 다르게 나온다.
 *
 * 우선순위(앞이 이긴다):
 *   선수: `players-ko.json`(사람) → 자동 캐시(`transfer_name_ko` — 판정자의 통용 표기, 없으면 위키데이터 레이블) → 없음(영문 그대로)
 *   구단: 구단 프리셋(5대 리그 — 엠블럼·리그와 한 쌍) → `glossary-ko.json`의 `clubs`(사람) → 자동 캐시 → 없음
 *
 * ⚠ **사람이 고친 값이 늘 이긴다** — 자동 값이 틀렸으면(동명이인·어색한 표기) JSON에 한 줄 적어 덮는다.
 *   JSON은 그 용도로만 쓴다 — 전부 손으로 채우지 않는다(시즌마다 끝없이 늘어난다).
 * ⚠ **선수 표기의 기준은 팬들이 쓰는 표기다**(각포·홀란드·반 다이크). 위키데이터 레이블은 외래어 표기법식(가크포·홀란·판 데이크)이라
 *   통용 표기가 없을 때의 대체값일 뿐이다 — 판정자가 통용 표기를 적으면 캐시의 레이블을 덮고(`cacheLlmNames`), 사람 사전이 그 위를 덮는다.
 *   사람 사전과 캐시가 갈리면 캐시와 이미 쓴 요약을 사전 표기로 맞춘다(`syncDictionaryNames`).
 * ⚠ **찾는 대상은 딜에 오른 이름뿐이다**(`missingNames`). 보도에 스친 모든 이름을 찾지 않는다 — 화면과 요약에
 *   나오는 것은 딜의 선수·구단뿐이다.
 */
import { readFileSync } from "node:fs";
import { clubDisplay } from "./club-display.mjs";
import { detectClubs, isKnownClub } from "./clubs.mjs";
import { currentClubOf, lookupKo } from "./wikidata.mjs";

export const NAME_TABLE = "transfer_name_ko";
/** 찾지 못한 이름을 다시 찾기까지 — 위키데이터에 표기가 새로 생긴다 */
export const RECHECK_MS = 30 * 86_400_000;
/** 한 번 실행의 조회 상한 — 백필이 한 시간에 몰리지 않게 한다(이름 하나에 요청 두 번). 남은 이름은 다음 실행이 찾는다 */
export const LOOKUP_MAX_PER_RUN = 60;
/** 현 소속(P54) 재확인 주기 — 창이 열리면 소속이 바뀌므로 이름 표기(30일)보다 짧다 */
export const CLUB_RECHECK_MS = 14 * 86_400_000;
/** 실행당 현 소속 조회 상한 — 출발 구단이 빈 딜의 선수만 대상이라 많지 않다 */
export const CLUB_LOOKUP_MAX_PER_RUN = 20;

function readJson(rel) {
  const url = new URL(rel, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch (e) {
    throw new Error(`${url.pathname}를 읽지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
  }
}
const withoutComment = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !k.startsWith("_")));

/** 사람이 고친 선수 표기(+ 포지션·생년·국적) — 키는 `normalizePlayer` 결과 */
export const loadPlayerDictionary = () => withoutComment(readJson("./players-ko.json"));
/** 사람이 고친 구단 표기(5대 리그 밖)·용어·요약 교정표 */
export function loadGlossary() {
  const g = readJson("./glossary-ko.json");
  return { clubs: withoutComment(g.clubs), terms: withoutComment(g.terms), corrections: withoutComment(g.corrections) };
}

/**
 * 구단 약칭 — 목록 카드·경로 줄에 들어간다. "왓퍼드 FC" → "왓퍼드", "인터 마이애미 CF" → "인터 마이애미".
 * 구단 형태를 나타내는 앞뒤 약어만 걷는다. 다 걷어서 비면 원래 이름이다.
 */
export function shortClubName(name) {
  const short = name.replace(/^(?:A?FC|CF|SC|AC|SSC|VfL|VfB|RB|FK|NK|SK)\s+/u, "").replace(/\s+(?:A?FC|CF|SC|FK|SK)$/u, "").trim();
  return short || name;
}

/** 통용 표기(판정자)를 캐시에 쓸 때의 `checked_at` — 위키데이터 확인 전이라는 뜻(다음 실행이 곧 찾는다) */
export const NEVER_CHECKED = "1970-01-01T00:00:00.000Z";

/**
 * 이름 사전 — 순수한 조회기. 캐시 행을 받아 만든다(DB 없이 테스트가 돈다).
 * @param {{ players?: object, clubs?: object, cache?: { kind: string, key: string, name_ko: string | null, wikidata_id?: string | null, source?: string, checked_at: string }[] }} src
 */
export function createNameBook({ players = {}, clubs = {}, cache = [] } = {}) {
  const cached = new Map(cache.map((r) => [`${r.kind}:${r.key}`, r]));
  const titleCase = (key) => key.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
  return {
    /**
     * 믿을 수 있는 선수 표기 — 사람 사전, 또는 판정자의 통용 표기(`source = 'llm'`). 위키데이터 레이블은 빠진다.
     * 판정자에게 넘기는 <표기>와 "통용 표기를 새로 받을지"의 판정이 이것을 본다(`judge.mjs`).
     */
    playerKoTrusted: (key) => players[key]?.ko ?? (cached.get(`player:${key}`)?.source === "llm" ? cached.get(`player:${key}`).name_ko : null) ?? null,
    /**
     * 그 성(정규형의 마지막 토큰)을 가진 아는 선수 — 사람 사전의 여러 토큰 이름과 확인된(위키데이터) 선수. 판정자가 성만 적은
     * 보도를 전체 이름으로 푸는 데 쓴다(`fullNameFor`). 한 명일 때만 뜻이 있다.
     * @returns {{ key: string, name: string }[]}
     */
    playersBySurname: (token) => {
      const out = new Map();
      for (const key of Object.keys(players)) if (key.includes(" ") && key.split(" ").at(-1) === token) out.set(key, { key, name: cached.get(`player:${key}`)?.name_en ?? titleCase(key) });
      for (const r of cache) if (r.kind === "player" && r.wikidata_id && r.key.includes(" ") && r.key.split(" ").at(-1) === token && !out.has(r.key)) out.set(r.key, { key: r.key, name: r.name_en ?? titleCase(r.key) });
      return [...out.values()];
    },
    /** 선수 한국어 표기 — 키는 `normalizePlayer` 결과. 사람 사전 → 캐시(판정자의 통용 표기, 없으면 위키데이터 레이블) */
    playerKo: (key) => players[key]?.ko ?? cached.get(`player:${key}`)?.name_ko ?? null,
    /**
     * 확인된 선수인가 — 사람 사전에 있거나, 위키데이터에서 현역(감독 아닌) 축구 선수로 찾았다(캐시에 `wikidata_id`가 있다).
     * 통용 표기만 있는 행(`source = 'llm'`, 항목 id 없음)은 확인이 아니다. 딜 파생의 검증 관문이 이것만 본다.
     */
    isVerifiedPlayer: (key) => Boolean(players[key]) || Boolean(cached.get(`player:${key}`)?.wikidata_id),
    /** 사전 밖 구단 이름이 위키데이터에서 축구 클럽으로 확인됐는가 — 판정자가 읊은 구단명을 받을지 가른다 */
    isVerifiedClub: (canonical) => Boolean(cached.get(`club:${canonical}`)?.wikidata_id),
    /** 캐시 행 그대로(있으면) — 캐시에 덧쓸 때 기존 값을 보존하는 데 쓴다 */
    entry: (kind, key) => cached.get(`${kind}:${key}`) ?? null,
    /**
     * 현 소속 구단(정규 영문명) — 자동 캐시(위키데이터 P54, `kind = 'player_club'`). 기사가 소속을 말하지 않을 때 파생이
     * 출발 구단으로 쓴다. 찾지 못한 행(wikidata_id null)은 없는 것이다.
     */
    currentClub: (key) => {
      const row = cached.get(`player_club:${key}`);
      return row?.wikidata_id ? row.name_en : null;
    },
    /** 현 소속을 지금 찾아야 하는가 — 캐시가 없거나 `CLUB_RECHECK_MS`가 지났다(찾지 못한 행도 그때 다시 본다) */
    needsClubLookup: (key, nowMs) => {
      const row = cached.get(`player_club:${key}`);
      return !row || nowMs - Date.parse(row.checked_at) >= CLUB_RECHECK_MS;
    },
    /** 사람이 적은 선수 정보(포지션·생년·국적) — 자동 캐시에는 없다 */
    playerInfo: (key) => players[key] ?? null,
    /** 구단 표기 — `{ name, short }`. 프리셋 구단은 프리셋, 아니면 사람 → 캐시. 없으면 `null`(영문 그대로) */
    club: (canonical) => {
      const preset = clubDisplay(canonical);
      if (preset.league) return { name: preset.name, short: preset.short };
      const ko = clubs[canonical] ?? cached.get(`club:${canonical}`)?.name_ko ?? null;
      return ko ? { name: ko, short: shortClubName(ko) } : null;
    },
    /** 이 이름을 지금 위키데이터에서 찾아야 하는가 — 캐시에 없거나, 항목을 찾지 못한 채 `RECHECK_MS`가 지났다(통용 표기만 있는 행 포함) */
    needsLookup: (kind, key, nowMs) => {
      if (kind === "player" && players[key]?.ko) return false;
      if (kind === "club" && (clubDisplay(key).league || clubs[key])) return false;
      const row = cached.get(`${kind}:${key}`);
      if (!row) return true;
      return !row.wikidata_id && nowMs - Date.parse(row.checked_at) >= RECHECK_MS;
    },
  };
}

/** 사전 전체 — 사람 JSON + DB 캐시 */
export async function loadNameBook(supabase) {
  const cache = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(NAME_TABLE).select("kind, key, name_en, name_ko, wikidata_id, source, checked_at").range(from, from + 999);
    if (error) throw new Error(`이름 사전 조회 실패: ${error.message}`);
    cache.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return createNameBook({ players: loadPlayerDictionary(), clubs: loadGlossary().clubs, cache });
}

/**
 * 판정자(LLM)가 적은 통용 표기를 캐시에 쓴다(`source = 'llm'`). 사람 사전에 있거나 이미 통용 표기가 있는 선수는 쓰지 않는다.
 * **위키데이터 레이블은 덮는다** — 팬들이 쓰는 표기가 기준이다. 기존 행의 확인 시각·항목 id는 그대로 둔다(검증 관문은 항목 id를 본다).
 * 레이블을 덮었으면 이미 쓴 요약 속 옛 표기도 함께 바꾼다(`fixSummaryNames`).
 * @param {{ key: string, name: string, ko: string }[]} entries
 * @returns {number} 쓴 행 수
 */
export async function cacheLlmNames(supabase, entries, book) {
  const rows = [];
  const renamed = [];
  for (const e of entries) {
    if ((book.playerKoTrusted ?? book.playerKo)(e.key)) continue;
    const prev = book.entry("player", e.key);
    if (prev?.name_ko && prev.name_ko !== e.ko) renamed.push({ key: e.key, from: prev.name_ko, to: e.ko });
    rows.push({ kind: "player", key: e.key, name_en: e.name.slice(0, 120), name_ko: e.ko, wikidata_id: prev?.wikidata_id ?? null, source: "llm", checked_at: prev?.checked_at ?? NEVER_CHECKED });
  }
  if (!rows.length) return 0;
  const { error } = await supabase.from(NAME_TABLE).upsert(rows, { onConflict: "kind,key" });
  if (error) throw new Error(`통용 표기 저장 실패: ${error.message}`);
  await fixSummaryNames(supabase, renamed);
  return rows.length;
}

/**
 * 사람 사전과 캐시의 선수 표기를 맞춘다 — 사전 표기가 캐시(위키데이터 레이블·옛 통용 표기)와 다르면 **캐시를 사전 표기로 고치고**
 * 이미 쓴 요약 속 옛 표기도 바꾼다. 화면의 딜 이름은 사전이 늘 이기지만, 요약은 쓴 시점의 표기로 남아 딜 제목("코디 각포")과
 * 요약("코디 가크포")이 갈린다. 캐시를 고쳐 두므로 한 번 맞춘 표기는 다시 대상이 되지 않는다.
 * @returns {{ synced: number, summariesFixed: number }}
 */
export async function syncDictionaryNames(supabase, book, players = loadPlayerDictionary()) {
  const out = { synced: 0, summariesFixed: 0 };
  for (const [key, info] of Object.entries(players)) {
    const row = book.entry("player", key);
    if (!info?.ko || !row?.name_ko || row.name_ko === info.ko) continue;
    const { error } = await supabase.from(NAME_TABLE).update({ name_ko: info.ko }).eq("kind", "player").eq("key", key);
    if (error) continue;
    out.synced += 1;
    out.summariesFixed += await fixSummaryNames(supabase, [{ key, from: row.name_ko, to: info.ko }]);
  }
  return out;
}

/**
 * 파생된 딜에서 **지금 찾아야 할 이름** — 딜의 선수와 출발·행선지 구단 중 사전에 없는 것.
 * @param {{ player: string, playerKey: string, fromCanonical: string | null, toCanonical: string | null, suitorCanonicals?: string[] }[]} deals
 * @returns {{ kind: "player" | "club", key: string, name: string }[]}
 */
export function missingNames(deals, book, nowMs) {
  const out = new Map();
  for (const d of deals) {
    if (book.needsLookup("player", d.playerKey, nowMs)) out.set(`player:${d.playerKey}`, { kind: "player", key: d.playerKey, name: d.player });
    for (const c of [d.fromCanonical, d.toCanonical, ...(d.suitorCanonicals ?? [])]) {
      if (c && book.needsLookup("club", c, nowMs)) out.set(`club:${c}`, { kind: "club", key: c, name: c });
    }
  }
  return [...out.values()];
}

/** 위키데이터 구단 레이블 → 구단 사전의 정규명(별칭이 하나로 풀리면), 아니면 레이블 그대로(사전 밖 구단 — LLM 경로와 같은 취급) */
export function canonicalClubName(label) {
  const hits = detectClubs(label);
  return hits.length === 1 ? hits[0] : label.trim();
}

/**
 * 선수의 현 소속 구단을 위키데이터(P54)에서 찾아 캐시에 쓴다 — 출발 구단 폴백의 원천(`derive-deals.mjs`).
 * `kind = 'player_club'`, key = 선수 키, name_en = 구단 정규 영문명, wikidata_id = 구단 항목. 찾지 못한 선수도 쓴다
 * (wikidata_id null · name_en은 선수 이름으로 자리를 채운다 — 매시 다시 찾지 않게, `CLUB_RECHECK_MS` 뒤 재확인).
 * 사전 밖 구단은 구단 캐시 행(`kind = 'club'`)도 함께 써서 화면이 한국어로 그린다. 항목 id가 없는 선수(사람 사전만)는 먼저 찾는다.
 * ⚠ 네트워크·HTTP 오류가 난 선수는 쓰지 않는다 — 다음 실행이 다시 찾는다.
 * @param {{ playerKey: string, player: string, wikidataId: string | null }[]} needs
 */
export async function lookupCurrentClubs(supabase, needs, { fetchImpl = fetch, limit = CLUB_LOOKUP_MAX_PER_RUN, book } = {}) {
  const out = { tried: 0, found: 0, notFound: 0, failed: 0, warnings: [] };
  const rows = [];
  const now = new Date().toISOString();
  for (const n of needs.slice(0, limit)) {
    out.tried += 1;
    try {
      const qid = n.wikidataId ?? (await lookupKo(n.player, "player", fetchImpl)).wikidataId;
      const club = qid ? await currentClubOf(qid, fetchImpl) : null;
      if (club?.nameEn) {
        const canonical = canonicalClubName(club.nameEn);
        rows.push({ kind: "player_club", key: n.playerKey, name_en: canonical.slice(0, 120), name_ko: null, wikidata_id: club.wikidataId, source: "wikidata", checked_at: now });
        if (!isKnownClub(canonical) && !clubDisplay(canonical).league && !book?.entry("club", canonical)?.wikidata_id) {
          rows.push({ kind: "club", key: canonical, name_en: canonical.slice(0, 120), name_ko: club.nameKo, wikidata_id: club.wikidataId, source: "wikidata", checked_at: now });
        }
        out.found += 1;
      } else {
        rows.push({ kind: "player_club", key: n.playerKey, name_en: n.player.slice(0, 120), name_ko: null, wikidata_id: null, source: "wikidata", checked_at: now });
        out.notFound += 1;
      }
    } catch (e) {
      out.failed += 1;
      out.warnings.push(`현 소속 조회 실패(${n.player}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (needs.length > limit) out.warnings.push(`현 소속 조회 상한(${limit}) — 남은 ${needs.length - limit}명은 다음 실행이 찾는다`);
  if (rows.length) {
    const { error } = await supabase.from(NAME_TABLE).upsert(rows, { onConflict: "kind,key" });
    if (error) {
      out.warnings.push(`현 소속 캐시 저장 실패: ${error.message}`);
      out.found = 0;
    }
  }
  return out;
}

/**
 * 이름들을 위키데이터에서 찾아 캐시에 쓴다. 찾지 못한 것도 쓴다(`name_ko` null — 매시간 다시 찾지 않게).
 * 판정자의 통용 표기(`source = 'llm'`)가 있는 행은 **표기를 그대로 두고** 항목 id만 채운다 — 위키데이터 레이블이 통용 표기를 덮지 않는다.
 * ⚠ 네트워크·HTTP 오류가 난 이름은 **쓰지 않는다** — 다음 실행이 다시 찾는다. 실패는 경고일 뿐이다
 *   (사전이 비어도 화면은 영문으로 그린다 — 파생·수집을 실패시킬 이유가 없다).
 * @param {{ fetchImpl?: typeof fetch, limit?: number, book?: ReturnType<typeof createNameBook> }} opts `book`이 있으면 기존 행의 통용 표기를 보존한다
 */
export async function lookupAndCache(supabase, names, { fetchImpl = fetch, limit = LOOKUP_MAX_PER_RUN, book } = {}) {
  // verified: 항목을 찾았다(한국어 표기가 없어도) — 검증 게이트가 열리므로 다시 파생할 이유가 된다
  const out = { tried: 0, found: 0, notFound: 0, verified: 0, failed: 0, summariesFixed: 0, warnings: [] };
  const rows = [];
  for (const n of names.slice(0, limit)) {
    out.tried += 1;
    try {
      const r = await lookupKo(n.name, n.kind, fetchImpl);
      const prev = book?.entry(n.kind, n.key);
      const keepLlm = prev?.source === "llm" && prev.name_ko;
      rows.push({ kind: n.kind, key: n.key, name_en: n.name.slice(0, 120), name_ko: keepLlm ? prev.name_ko : r.nameKo, wikidata_id: r.wikidataId, source: keepLlm ? "llm" : "wikidata", checked_at: new Date().toISOString() });
      out[r.nameKo ? "found" : "notFound"] += 1;
      if (r.wikidataId) out.verified += 1;
    } catch (e) {
      out.failed += 1;
      out.warnings.push(`이름 조회 실패(${n.kind} ${n.name}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (names.length > limit) out.warnings.push(`이름 조회 상한(${limit}) — 남은 ${names.length - limit}개는 다음 실행이 찾는다`);
  if (rows.length) {
    const { error } = await supabase.from(NAME_TABLE).upsert(rows, { onConflict: "kind,key" });
    if (error) {
      out.warnings.push(`이름 사전 저장 실패: ${error.message}`);
      out.found = 0;
      out.verified = 0;
    }
  }
  return out;
}

/** 정규식 이스케이프 */
const reEscape = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 표기 하나를 바꾼다 — 전체 이름과, 이름을 뗀 **성 부분**("판 데이크" → "반 다이크")을 함께. 요약은 성만 쓰는 일이 많다.
 * 새 표기가 옛 표기로 시작하면("홀란" → "홀란드") 이미 바뀐 글자를 또 늘리지 않는다("홀란드드"). 성 부분이 두 글자 미만이면
 * 성만으로는 바꾸지 않는다(다른 낱말과 겹친다). 받침이 달라지면 바로 뒤의 조사도 맞춘다.
 */
export function renameInSummary(text, from, to) {
  // 이름 바로 뒤의 조사는 새 표기의 받침에 맞춘다("홀란과" → "홀란드와") — 조사 뒤가 공백·문장부호일 때만(낱말의 일부가 아니다)
  const JOSA = "(?:(이|가|은|는|을|를|과|와|으로|로)(?=[\\s,.·]|$))?";
  const josaFor = (word, josa) => {
    const code = word.codePointAt(word.length - 1) - 0xac00;
    if (code < 0 || code > 11171) return josa;
    const jong = code % 28;
    const pair = { 이: ["이", "가"], 가: ["이", "가"], 은: ["은", "는"], 는: ["은", "는"], 을: ["을", "를"], 를: ["을", "를"], 과: ["과", "와"], 와: ["과", "와"] }[josa];
    if (pair) return jong ? pair[0] : pair[1];
    return jong && jong !== 8 ? "으로" : "로";
  };
  const swap = (t, a, b) => {
    if (!a || !b || a === b) return t;
    const re = new RegExp(`${reEscape(a)}${b.startsWith(a) ? `(?!${reEscape(b.slice(a.length))})` : ""}${JOSA}`, "gu");
    return t.replace(re, (_m, josa) => b + (josa ? josaFor(b, josa) : ""));
  };
  let out = swap(text, from, to);
  const tail = (x) => (x.includes(" ") ? x.slice(x.indexOf(" ") + 1) : null);
  const a = tail(from);
  const b = tail(to);
  if (a && b && [...a].length >= 2) out = swap(out, a, b);
  return out;
}

/**
 * 요약 속 옛 표기를 새 표기로 바꾼다 — 선수의 표기가 바뀌면(통용 표기가 레이블을 덮거나, 사람 사전이 고치면) 요약은 쓴 시점의
 * 표기로 남아 딜 제목과 갈린다. 그 선수로 판정된 보도의 요약에서만 바꾼다 — 요약은 추출 컬럼이라 다시 써도 된다.
 * @param {{ key: string, from: string, to: string }[]} renamed
 */
export async function fixSummaryNames(supabase, renamed) {
  let fixed = 0;
  for (const { key, from, to } of renamed) {
    const { data, error } = await supabase.from("transfer_news").select("id, summary_ko").eq("verdict_player", key).not("summary_ko", "is", null);
    if (error || !data?.length) continue;
    for (const r of data) {
      const next = renameInSummary(r.summary_ko, from, to);
      if (next === r.summary_ko || [...next].length > 160) continue;
      const { error: e2 } = await supabase.from("transfer_news").update({ summary_ko: next }).eq("id", r.id);
      if (!e2) fixed += 1;
    }
  }
  return fixed;
}

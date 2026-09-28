/**
 * 이름 사전 — 선수·구단의 한국어 표기를 **한 곳에서** 정한다. 딜 파생(`derive-deals.mjs` — 화면의 선수명·구단명)과
 * LLM 판정·요약(`judge.mjs` — 모델에 넘기는 표기)이 같은 사전을 본다. 둘이 갈리면 화면의 이름과 요약문의
 * 이름이 다르게 나온다.
 *
 * 우선순위(앞이 이긴다):
 *   선수: `players-ko.json`(사람) → 자동 캐시(`transfer_name_ko`, 위키데이터) → 없음(영문 그대로)
 *   구단: 구단 프리셋(5대 리그 — 엠블럼·리그와 한 쌍) → `glossary-ko.json`의 `clubs`(사람) → 자동 캐시 → 없음
 *
 * ⚠ **사람이 고친 값이 늘 이긴다** — 자동 값이 틀렸으면(동명이인·어색한 표기) JSON에 한 줄 적어 덮는다.
 *   JSON은 그 용도로만 쓴다 — 전부 손으로 채우지 않는다(시즌마다 끝없이 늘어난다).
 * ⚠ **찾는 대상은 딜에 오른 이름뿐이다**(`missingNames`). 보도에 스친 모든 이름을 찾지 않는다 — 화면과 요약에
 *   나오는 것은 딜의 선수·구단뿐이다.
 */
import { readFileSync } from "node:fs";
import { clubDisplay } from "./club-display.mjs";
import { lookupKo } from "./wikidata.mjs";

export const NAME_TABLE = "transfer_name_ko";
/** 찾지 못한 이름을 다시 찾기까지 — 위키데이터에 표기가 새로 생긴다 */
export const RECHECK_MS = 30 * 86_400_000;
/** 한 번 실행의 조회 상한 — 백필이 한 시간에 몰리지 않게 한다(이름 하나에 요청 두 번). 남은 이름은 다음 실행이 찾는다 */
export const LOOKUP_MAX_PER_RUN = 60;

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

/** LLM 음역을 캐시에 쓸 때의 `checked_at` — 위키데이터 확인 전이라는 뜻(다음 실행이 곧 찾는다) */
export const NEVER_CHECKED = "1970-01-01T00:00:00.000Z";

/**
 * 이름 사전 — 순수한 조회기. 캐시 행을 받아 만든다(DB 없이 테스트가 돈다).
 * @param {{ players?: object, clubs?: object, cache?: { kind: string, key: string, name_ko: string | null, wikidata_id?: string | null, source?: string, checked_at: string }[] }} src
 */
export function createNameBook({ players = {}, clubs = {}, cache = [] } = {}) {
  const cached = new Map(cache.map((r) => [`${r.kind}:${r.key}`, r]));
  return {
    /** 선수 한국어 표기 — 키는 `normalizePlayer` 결과. 사람 사전 → 캐시(위키데이터 또는 LLM 음역) */
    playerKo: (key) => players[key]?.ko ?? cached.get(`player:${key}`)?.name_ko ?? null,
    /**
     * 확인된 선수인가 — 사람 사전에 있거나, 위키데이터에서 현역(감독 아닌) 축구 선수로 찾았다(캐시에 `wikidata_id`가 있다).
     * LLM 음역만 있는 행은 확인이 아니다. 딜 파생의 검증 관문이 이것만 본다.
     */
    isVerifiedPlayer: (key) => Boolean(players[key]) || Boolean(cached.get(`player:${key}`)?.wikidata_id),
    /** 사전 밖 구단 이름이 위키데이터에서 축구 클럽으로 확인됐는가 — 판정자가 읊은 구단명을 받을지 가른다 */
    isVerifiedClub: (canonical) => Boolean(cached.get(`club:${canonical}`)?.wikidata_id),
    /** 캐시 행 그대로(있으면) — 캐시에 덧쓸 때 기존 값을 보존하는 데 쓴다 */
    entry: (kind, key) => cached.get(`${kind}:${key}`) ?? null,
    /** 사람이 적은 선수 정보(포지션·생년·국적) — 자동 캐시에는 없다 */
    playerInfo: (key) => players[key] ?? null,
    /** 구단 표기 — `{ name, short }`. 프리셋 구단은 프리셋, 아니면 사람 → 캐시. 없으면 `null`(영문 그대로) */
    club: (canonical) => {
      const preset = clubDisplay(canonical);
      if (preset.league) return { name: preset.name, short: preset.short };
      const ko = clubs[canonical] ?? cached.get(`club:${canonical}`)?.name_ko ?? null;
      return ko ? { name: ko, short: shortClubName(ko) } : null;
    },
    /** 이 이름을 지금 위키데이터에서 찾아야 하는가 — 캐시에 없거나, 항목을 찾지 못한 채 `RECHECK_MS`가 지났다(LLM 음역만 있는 행 포함) */
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
 * 판정자(LLM)의 음역을 캐시에 쓴다 — 위키데이터에 표기가 없는 선수의 임시 표기다(`source = 'llm'`).
 * 사람 사전·위키데이터 표기가 있는 이름은 쓰지 않는다. 기존 행이 있으면 확인 시각·항목 id는 그대로 두고 표기만 채운다.
 * @param {{ key: string, name: string, ko: string }[]} entries
 * @returns {number} 쓴 행 수
 */
export async function cacheLlmNames(supabase, entries, book) {
  const rows = [];
  for (const e of entries) {
    if (book.playerKo(e.key)) continue;
    const prev = book.entry("player", e.key);
    rows.push({ kind: "player", key: e.key, name_en: e.name.slice(0, 120), name_ko: e.ko, wikidata_id: prev?.wikidata_id ?? null, source: "llm", checked_at: prev?.checked_at ?? NEVER_CHECKED });
  }
  if (!rows.length) return 0;
  const { error } = await supabase.from(NAME_TABLE).upsert(rows, { onConflict: "kind,key" });
  if (error) throw new Error(`LLM 음역 저장 실패: ${error.message}`);
  return rows.length;
}

/**
 * 파생된 딜에서 **지금 찾아야 할 이름** — 딜의 선수와 출발·행선지 구단 중 사전에 없는 것.
 * @param {{ player: string, playerKey: string, fromCanonical: string | null, toCanonical: string | null }[]} deals
 * @returns {{ kind: "player" | "club", key: string, name: string }[]}
 */
export function missingNames(deals, book, nowMs) {
  const out = new Map();
  for (const d of deals) {
    if (book.needsLookup("player", d.playerKey, nowMs)) out.set(`player:${d.playerKey}`, { kind: "player", key: d.playerKey, name: d.player });
    for (const c of [d.fromCanonical, d.toCanonical]) {
      if (c && book.needsLookup("club", c, nowMs)) out.set(`club:${c}`, { kind: "club", key: c, name: c });
    }
  }
  return [...out.values()];
}

/**
 * 이름들을 위키데이터에서 찾아 캐시에 쓴다. 찾지 못한 것도 쓴다(`name_ko` null — 매시간 다시 찾지 않게).
 * LLM 음역만 있던 행은 위키데이터 표기가 있으면 그것으로 덮고, 없으면 음역을 남긴다(`source`는 그대로 llm).
 * ⚠ 네트워크·HTTP 오류가 난 이름은 **쓰지 않는다** — 다음 실행이 다시 찾는다. 실패는 경고일 뿐이다
 *   (사전이 비어도 화면은 영문으로 그린다 — 파생·수집을 실패시킬 이유가 없다).
 * @param {{ fetchImpl?: typeof fetch, limit?: number, book?: ReturnType<typeof createNameBook> }} opts `book`이 있으면 기존 행의 음역을 보존한다
 */
export async function lookupAndCache(supabase, names, { fetchImpl = fetch, limit = LOOKUP_MAX_PER_RUN, book } = {}) {
  // verified: 항목을 찾았다(한국어 표기가 없어도) — 검증 게이트가 열리므로 다시 파생할 이유가 된다
  const out = { tried: 0, found: 0, notFound: 0, verified: 0, failed: 0, warnings: [] };
  const rows = [];
  for (const n of names.slice(0, limit)) {
    out.tried += 1;
    try {
      const r = await lookupKo(n.name, n.kind, fetchImpl);
      const prev = book?.entry(n.kind, n.key);
      const keepLlm = !r.nameKo && prev?.source === "llm" && prev.name_ko;
      rows.push({ kind: n.kind, key: n.key, name_en: n.name.slice(0, 120), name_ko: r.nameKo ?? (keepLlm ? prev.name_ko : null), wikidata_id: r.wikidataId, source: keepLlm ? "llm" : "wikidata", checked_at: new Date().toISOString() });
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

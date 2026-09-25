/**
 * 이름 사전 — 선수·구단의 한국어 표기를 **한 곳에서** 정한다. 딜 파생(`derive-deals.mjs` — 화면의 선수명·구단명)과
 * 한국어 요약(`summarize.mjs` — LLM에 넘기는 표기)이 같은 사전을 본다. 둘이 갈리면 화면의 이름과 요약문의
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

/**
 * 이름 사전 — 순수한 조회기. 캐시 행을 받아 만든다(DB 없이 테스트가 돈다).
 * @param {{ players?: object, clubs?: object, cache?: { kind: string, key: string, name_ko: string | null, checked_at: string }[] }} src
 */
export function createNameBook({ players = {}, clubs = {}, cache = [] } = {}) {
  const cached = new Map(cache.map((r) => [`${r.kind}:${r.key}`, r]));
  return {
    /** 선수 한국어 표기 — 키는 `normalizePlayer` 결과 */
    playerKo: (key) => players[key]?.ko ?? cached.get(`player:${key}`)?.name_ko ?? null,
    /** 사람이 적은 선수 정보(포지션·생년·국적) — 자동 캐시에는 없다 */
    playerInfo: (key) => players[key] ?? null,
    /** 구단 표기 — `{ name, short }`. 프리셋 구단은 프리셋, 아니면 사람 → 캐시. 없으면 `null`(영문 그대로) */
    club: (canonical) => {
      const preset = clubDisplay(canonical);
      if (preset.league) return { name: preset.name, short: preset.short };
      const ko = clubs[canonical] ?? cached.get(`club:${canonical}`)?.name_ko ?? null;
      return ko ? { name: ko, short: shortClubName(ko) } : null;
    },
    /** 이 이름을 지금 찾아야 하는가 — 캐시에 없거나, 찾지 못한 채 `RECHECK_MS`가 지났다 */
    needsLookup: (kind, key, nowMs) => {
      if (kind === "player" && players[key]?.ko) return false;
      if (kind === "club" && (clubDisplay(key).league || clubs[key])) return false;
      const row = cached.get(`${kind}:${key}`);
      if (!row) return true;
      return row.name_ko === null && nowMs - Date.parse(row.checked_at) >= RECHECK_MS;
    },
  };
}

/** 사전 전체 — 사람 JSON + DB 캐시 */
export async function loadNameBook(supabase) {
  const cache = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(NAME_TABLE).select("kind, key, name_ko, checked_at").range(from, from + 999);
    if (error) throw new Error(`이름 사전 조회 실패: ${error.message}`);
    cache.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return createNameBook({ players: loadPlayerDictionary(), clubs: loadGlossary().clubs, cache });
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
 * ⚠ 네트워크·HTTP 오류가 난 이름은 **쓰지 않는다** — 다음 실행이 다시 찾는다. 실패는 경고일 뿐이다
 *   (사전이 비어도 화면은 영문으로 그린다 — 파생·수집을 실패시킬 이유가 없다).
 */
export async function lookupAndCache(supabase, names, { fetchImpl = fetch, limit = LOOKUP_MAX_PER_RUN } = {}) {
  const out = { tried: 0, found: 0, notFound: 0, failed: 0, warnings: [] };
  const rows = [];
  for (const n of names.slice(0, limit)) {
    out.tried += 1;
    try {
      const r = await lookupKo(n.name, n.kind, fetchImpl);
      rows.push({ kind: n.kind, key: n.key, name_en: n.name.slice(0, 120), name_ko: r.nameKo, wikidata_id: r.wikidataId, checked_at: new Date().toISOString() });
      out[r.nameKo ? "found" : "notFound"] += 1;
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
    }
  }
  return out;
}

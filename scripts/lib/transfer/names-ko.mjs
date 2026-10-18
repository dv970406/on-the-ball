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
import { readRange } from "../sync-db.mjs";
import { clubDisplay } from "./club-display.mjs";
export { shortKoClubName } from "./club-display.mjs";
import { detectClubs, isKnownClub } from "./clubs.mjs";
import { DAY_MS, readJson as readJsonFile } from "./util.mjs";
import { currentClubsOf, lookupKoMany } from "./wikidata.mjs";

export const NAME_TABLE = "transfer_name_ko";
/** 찾지 못한 이름을 다시 찾기까지 — 위키데이터에 표기가 새로 생긴다 */
export const RECHECK_MS = 30 * DAY_MS;
/**
 * 한 번 실행의 조회 상한 — 백필이 한 시간에 몰리지 않게 한다(이름 하나에 검색 한 번 + 후보 항목은 실행의 이름 전부를 묶어 받는다 —
 * `lookupKoMany`). 남은 이름은 다음 실행이 찾는다
 */
const LOOKUP_MAX_PER_RUN = 60;
/** 현 소속(P54) 재확인 주기 — 창이 열리면 소속이 바뀌므로 이름 표기(30일)보다 짧다 */
export const CLUB_RECHECK_MS = 14 * DAY_MS;
/** 실행당 현 소속 조회 상한 — 출발 구단이 빈 딜의 선수만 대상이라 많지 않다 */
const CLUB_LOOKUP_MAX_PER_RUN = 20;

/** 사람 JSON — 프로세스 안에서 한 번만 읽는다(`util.mjs`). 한 실행이 사전을 여러 번 다시 만들어도 파일은 다시 읽지 않는다 */
const readJson = (rel) => readJsonFile(new URL(rel, import.meta.url));
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
const NEVER_CHECKED = "1970-01-01T00:00:00.000Z";

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
    /**
     * 참고값 — 믿을 수 있는 표기(사람 사전·통용 표기)가 **없고** 위키데이터 레이블만 있을 때 그 레이블. 판정 지시문에 `≈ 참고값`으로
     * 실어 모델이 백지에서 음역하지 않게 하고, 같은 실행의 표기가 동률로 갈릴 때 고르는 기준이 된다(`pickConsensusKo`).
     * 믿을 수 있는 표기가 있으면 null — 그쪽이 `=`로 실린다.
     */
    playerKoReference: (key) => {
      if (players[key]?.ko) return null;
      const row = cached.get(`player:${key}`);
      return row && row.source !== "llm" ? (row.name_ko ?? null) : null;
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

/**
 * 이름 캐시(`transfer_name_ko`) 전체 — 키가 두 컬럼(`kind`·`key`)이라 키셋 대신 범위로 끝까지 읽는다.
 * ⚠ 정렬을 고정한다 — 정렬 없는 범위 읽기는 페이지 사이에 순서가 흔들려 행이 빠지거나 겹친다.
 */
export function loadNameCache(supabase) {
  return readRange(
    () => supabase.from(NAME_TABLE).select("kind, key, name_en, name_ko, wikidata_id, source, checked_at").order("kind").order("key"),
    "이름 사전",
  );
}

/** 캐시 행 → 사전(사람 JSON과 합친다 — JSON은 프로세스 안에서 한 번만 읽는다) */
export const buildNameBook = (cache) => createNameBook({ players: loadPlayerDictionary(), clubs: loadGlossary().clubs, cache });

/**
 * 캐시 행에 **이번 실행이 쓴 행**을 덧입힌다(같은 `kind:key`면 준 컬럼만 덮는다) — 쓴 직후 표 전체를 다시 읽지 않기 위해서다.
 * ⚠ 저장에 성공한 행만 넘긴다(`lookupAndCache`·`lookupCurrentClubs`의 `written`, `syncDictionaryNames`의 `written`). 무엇을 썼는지
 *   모르는 쓰기(판정의 이름 쓰기)는 덧입히지 말고 다시 읽는다(`loadNameCache`).
 * @param {object[]} cache
 * @param {{ kind: string, key: string }[]} rows
 */
export function overlayNameRows(cache, rows) {
  const byKey = new Map(cache.map((r) => [`${r.kind}:${r.key}`, r]));
  for (const r of rows) {
    const k = `${r.kind}:${r.key}`;
    byKey.set(k, { ...(byKey.get(k) ?? {}), ...r });
  }
  return [...byKey.values()];
}

/** 표기 비교용 — 공백 차이("에마누엘마누"·"에마누엘 마누")는 같은 표기다 */
const koShape = (ko) => ko.replace(/\s+/gu, "");

/**
 * 같은 선수에게 온 표기들 중 하나를 고른다 — 같은 실행에서도 모델이 "주앙/조앙"·"마누/마뉴"로 갈라 적는다. 먼저 온 값이 캐시를
 * 차지하지 않게 실행 끝에 모아 고른다. 다수결이고, 동률이면 참고값(위키데이터 레이블)과 같은 쪽, 그래도 갈리면 고르지 않는다
 * (틀린 표기가 캐시에 앉는 것보다 다음 실행이 다시 묻는 편이 낫다).
 * @param {string[]} candidates
 * @param {string | null} reference
 * @returns {{ ko: string | null, split: boolean, variants: number }} variants = 서로 다른 표기 수(공백 차이 제외) — 2 이상이면 갈렸던 것이다
 */
export function pickConsensusKo(candidates, reference = null) {
  const groups = new Map();
  for (const c of candidates) {
    if (typeof c !== "string" || !c.trim()) continue;
    const shape = koShape(c);
    const g = groups.get(shape) ?? { count: 0, forms: new Map() };
    g.count += 1;
    const form = c.trim().replace(/\s+/gu, " ");
    g.forms.set(form, (g.forms.get(form) ?? 0) + 1);
    groups.set(shape, g);
  }
  if (!groups.size) return { ko: null, split: false, variants: 0 };
  // 무리 안에서 가장 많이 쓴 띄어쓰기(동률이면 먼저 온 것)
  const formOf = (g) => [...g.forms].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const top = Math.max(...[...groups.values()].map((g) => g.count));
  const tied = [...groups].filter(([, g]) => g.count === top);
  if (tied.length === 1) return { ko: formOf(tied[0][1]), split: false, variants: groups.size };
  const ref = reference ? tied.find(([shape]) => shape === koShape(reference)) : null;
  if (ref) return { ko: formOf(ref[1]), split: false, variants: groups.size };
  return { ko: null, split: true, variants: groups.size };
}

/** 새로 쌓인 통용 표기 한 줄 — 사람이 보고 사전(`players-ko.json`)에 확정하거나 고친다 */
export const formatNewNameLog = ({ key, ko, reference }) => `신규 통용 표기: ${key} = ${ko} (위키데이터: ${reference ?? "없음"})`;

/**
 * 판정자(LLM)가 적은 통용 표기를 캐시에 쓴다(`source = 'llm'`). 사람 사전에 있거나 이미 통용 표기가 있는 선수는 쓰지 않는다.
 * **위키데이터 레이블은 덮는다** — 팬들이 쓰는 표기가 기준이다. 기존 행의 확인 시각·항목 id는 그대로 둔다(검증 관문은 항목 id를 본다).
 * 레이블을 덮었으면 이미 쓴 요약 속 옛 표기도 함께 바꾼다(`fixSummaryNames`).
 * 같은 선수에게 표기가 여럿 오면(한 실행의 여러 보도) `pickConsensusKo`로 하나를 고르고, 갈리면 그 선수는 쓰지 않는다(`split`).
 * @param {{ key: string, name: string, ko: string }[]} entries
 * @returns {{ written: number, added: { key: string, ko: string, reference: string | null }[], split: { key: string, candidates: string[] }[], warnings: string[] }}
 *   `added`는 새로 쓴 통용 표기(로그는 `formatNewNameLog`). `warnings`는 요약 고치기의 조회·쓰기 실패다.
 */
export async function cacheLlmNames(supabase, entries, book) {
  const trusted = book.playerKoTrusted ?? book.playerKo;
  const byKey = new Map();
  for (const e of entries) {
    if (!e?.key || !e.ko || trusted(e.key)) continue;
    const list = byKey.get(e.key) ?? [];
    list.push(e);
    byKey.set(e.key, list);
  }
  const rows = [];
  const renamed = [];
  const added = [];
  const split = [];
  for (const [key, list] of byKey) {
    const prev = book.entry("player", key);
    const reference = book.playerKoReference ? book.playerKoReference(key) : (prev && prev.source !== "llm" ? (prev.name_ko ?? null) : null);
    const pick = pickConsensusKo(list.map((e) => e.ko), reference);
    if (!pick.ko) {
      split.push({ key, candidates: list.map((e) => e.ko) });
      continue;
    }
    if (prev?.name_ko && prev.name_ko !== pick.ko) renamed.push({ key, from: prev.name_ko, to: pick.ko });
    rows.push({ kind: "player", key, name_en: list[0].name.slice(0, 120), name_ko: pick.ko, wikidata_id: prev?.wikidata_id ?? null, source: "llm", checked_at: prev?.checked_at ?? NEVER_CHECKED });
    added.push({ key, ko: pick.ko, reference });
  }
  const warnings = [];
  const result = (written, done) => ({ written, added: done, split, warnings });
  if (!rows.length) return result(0, []);
  const { error } = await supabase.from(NAME_TABLE).upsert(rows, { onConflict: "kind,key" });
  if (error) throw new Error(`통용 표기 저장 실패: ${error.message}`);
  await fixSummaryNames(supabase, renamed, warnings);
  return result(rows.length, added);
}

/**
 * 사람 사전과 캐시의 선수 표기를 맞춘다 — 사전 표기가 캐시(위키데이터 레이블·옛 통용 표기)와 다르면 **캐시를 사전 표기로 고치고**
 * 이미 쓴 요약 속 옛 표기도 바꾼다. 화면의 딜 이름은 사전이 늘 이기지만, 요약은 쓴 시점의 표기로 남아 딜 제목("코디 각포")과
 * 요약("코디 가크포")이 갈린다. 캐시를 고쳐 두므로 한 번 맞춘 표기는 다시 대상이 되지 않는다.
 * ⚠ **요약을 먼저 고치고 캐시는 그 뒤에 고친다** — 캐시를 먼저 고치면 요약 고치기가 실패해도 그 선수는 다시 대상이 되지 않아
 *   옛 표기의 요약이 영구히 남는다. 요약 하나라도 못 고쳤으면 캐시를 두고(다음 실행이 다시 맞춘다) 경고로 남긴다.
 *   이미 고친 요약은 다시 바꿀 것이 없어 되풀이해도 같다(`renameInSummary`).
 * @returns {{ synced: number, summariesFixed: number, warnings: string[], written: { key: string, name_ko: string }[] }}
 *   `written`은 캐시에 고쳐 쓴 표기 — 호출부가 사전을 다시 읽지 않고 덧입힌다
 */
export async function syncDictionaryNames(supabase, book, players = loadPlayerDictionary()) {
  const out = { synced: 0, summariesFixed: 0, warnings: [], written: [] };
  for (const [key, info] of Object.entries(players)) {
    const row = book.entry("player", key);
    if (!info?.ko || !row?.name_ko || row.name_ko === info.ko) continue;
    const fixed = await fixSummaries(supabase, [{ key, from: row.name_ko, to: info.ko }]);
    out.summariesFixed += fixed.fixed;
    if (fixed.failures.length) {
      out.warnings.push(...fixed.failures, `사전 표기 맞춤 보류(${key}): 요약을 다 고치지 못해 캐시를 그대로 둔다 — 다음 실행이 다시 맞춘다`);
      continue;
    }
    const { error } = await supabase.from(NAME_TABLE).update({ name_ko: info.ko }).eq("kind", "player").eq("key", key);
    if (error) {
      out.warnings.push(`사전 표기 맞춤 실패(${key}): ${error.message}`);
      continue;
    }
    out.synced += 1;
    out.written.push({ key, name_ko: info.ko });
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
  const out = { tried: 0, found: 0, notFound: 0, failed: 0, warnings: [], written: [] };
  const rows = [];
  const now = new Date().toISOString();
  const batch = needs.slice(0, limit);
  out.tried = batch.length;
  const failWith = (n, e) => {
    out.failed += 1;
    out.warnings.push(`현 소속 조회 실패(${n.player}): ${e instanceof Error ? e.message : String(e)}`);
  };
  // 항목 id가 없는 선수(사람 사전만)는 먼저 이름으로 찾는다 — 찾을 때 받은 선수 항목(claims)은 현 소속 조회가 다시 받지 않는다
  const unresolved = batch.filter((n) => !n.wikidataId);
  const found = unresolved.length ? await lookupKoMany(unresolved.map((n) => ({ name: n.player, kind: "player" })), fetchImpl) : { results: [], entities: {} };
  const qidOf = new Map();
  const failedNeeds = new Set();
  unresolved.forEach((n, i) => {
    const r = found.results[i];
    if (r.ok) qidOf.set(n, r.value.wikidataId);
    else {
      failedNeeds.add(n);
      failWith(n, r.error);
    }
  });
  for (const n of batch) if (n.wikidataId) qidOf.set(n, n.wikidataId);
  const clubs = await currentClubsOf([...new Set([...qidOf.values()].filter(Boolean))], fetchImpl, { known: found.entities });
  for (const n of batch) {
    if (failedNeeds.has(n)) continue;
    const qid = qidOf.get(n);
    const r = qid ? clubs.get(qid) : { ok: true, club: null };
    if (!r.ok) {
      failWith(n, r.error);
      continue;
    }
    const club = r.club;
    if (club?.nameEn) {
      const canonical = canonicalClubName(club.nameEn);
      rows.push({ kind: "player_club", key: n.playerKey, name_en: canonical.slice(0, 120), name_ko: null, wikidata_id: club.wikidataId, source: "wikidata", checked_at: now });
      if (!isKnownClub(canonical) && !clubDisplay(canonical).league && !book?.entry("club", canonical)?.wikidata_id && !rows.some((x) => x.kind === "club" && x.key === canonical)) {
        rows.push({ kind: "club", key: canonical, name_en: canonical.slice(0, 120), name_ko: club.nameKo, wikidata_id: club.wikidataId, source: "wikidata", checked_at: now });
      }
      out.found += 1;
    } else {
      rows.push({ kind: "player_club", key: n.playerKey, name_en: n.player.slice(0, 120), name_ko: null, wikidata_id: null, source: "wikidata", checked_at: now });
      out.notFound += 1;
    }
  }
  if (needs.length > limit) out.warnings.push(`현 소속 조회 상한(${limit}) — 남은 ${needs.length - limit}명은 다음 실행이 찾는다`);
  if (rows.length) {
    const { error } = await supabase.from(NAME_TABLE).upsert(rows, { onConflict: "kind,key" });
    if (error) {
      out.warnings.push(`현 소속 캐시 저장 실패: ${error.message}`);
      out.found = 0;
    } else out.written = rows;
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
  // written: 실제로 저장한 행 — 호출부가 사전을 다시 읽지 않고 이 행을 덧입힌다(`overlayNameRows`)
  const out = { tried: 0, found: 0, notFound: 0, verified: 0, failed: 0, summariesFixed: 0, warnings: [], written: [] };
  const rows = [];
  const batch = names.slice(0, limit);
  out.tried = batch.length;
  const { results } = await lookupKoMany(batch.map((n) => ({ name: n.name, kind: n.kind })), fetchImpl);
  batch.forEach((n, i) => {
    const res = results[i];
    if (!res.ok) {
      out.failed += 1;
      out.warnings.push(`이름 조회 실패(${n.kind} ${n.name}): ${res.error.message}`);
      return;
    }
    const r = res.value;
    const prev = book?.entry(n.kind, n.key);
    const keepLlm = prev?.source === "llm" && prev.name_ko;
    rows.push({ kind: n.kind, key: n.key, name_en: n.name.slice(0, 120), name_ko: keepLlm ? prev.name_ko : r.nameKo, wikidata_id: r.wikidataId, source: keepLlm ? "llm" : "wikidata", checked_at: new Date().toISOString() });
    out[r.nameKo ? "found" : "notFound"] += 1;
    if (r.wikidataId) out.verified += 1;
  });
  if (names.length > limit) out.warnings.push(`이름 조회 상한(${limit}) — 남은 ${names.length - limit}개는 다음 실행이 찾는다`);
  if (rows.length) {
    const { error } = await supabase.from(NAME_TABLE).upsert(rows, { onConflict: "kind,key" });
    if (error) {
      out.warnings.push(`이름 사전 저장 실패: ${error.message}`);
      out.found = 0;
      out.verified = 0;
    } else out.written = rows;
  }
  return out;
}

/** 정규식 이스케이프 */
const reEscape = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 이름 뒤에 붙는 조사 — 받침에 따라 모양이 바뀌는 것만 잡는다(바꿔 붙인다) */
const JOSA_PAIR = { 이: ["이", "가"], 가: ["이", "가"], 은: ["은", "는"], 는: ["은", "는"], 을: ["을", "를"], 를: ["을", "를"], 과: ["과", "와"], 와: ["과", "와"] };
/** 조사 뒤에 이어 붙는 조사("홀란과**의**"·"홀란과**도**") — 그 뒤가 낱말 끝이면 앞 조사도 이름에 딸린 조사다 */
const PARTICLE_AFTER = "(?:의|도|만|에게|에서|부터|까지)";
const WORD_END = `(?=${PARTICLE_AFTER}?(?:[^\\p{L}\\p{N}]|$))`;
const JOSA = `(?:(이|가|은|는|을|를|과|와|으로|로)${WORD_END})?`;

/** 새 표기의 받침에 맞춘 조사 */
function josaFor(word, josa) {
  const code = word.codePointAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return josa;
  const jong = code % 28;
  const pair = JOSA_PAIR[josa];
  if (pair) return jong ? pair[0] : pair[1];
  return jong && jong !== 8 ? "으로" : "로";
}

/**
 * 글 속의 `a`를 `b`로 바꾼다. `protect`(이미 새 표기인 자리 — `a`를 품은 더 긴 이름)는 건드리지 않는다: "마누 코네" → "에마누엘 마누 코네"를
 * 바꾼 뒤 성 "코네" → "마누 코네"를 또 바꾸면 "마누 마누 코네"가 된다. `short`면 앞뒤가 낱말 경계일 때만 바꾼다("네투" ≠ "네투어").
 */
function swapName(text, a, b, protect, short) {
  if (!a || !b || a === b) return text;
  const guards = [...new Set(protect.filter((p) => p && p !== a && p.includes(a)))].sort((x, y) => y.length - x.length).map(reEscape);
  const head = short ? "(?<![\\p{L}\\p{N}])" : "";
  const tail = short ? WORD_END : "";
  const name = `${head}${reEscape(a)}${JOSA}${tail}`;
  const re = new RegExp(guards.length ? `(${guards.join("|")})|${name}` : `()${name}`, "gu");
  return text.replace(re, (m, kept, josa) => (kept ? m : b + (josa ? josaFor(b, josa) : "")));
}

/**
 * 표기 하나를 바꾼다 — 전체 이름과, 이름을 뗀 **성 부분**("판 데이크" → "반 다이크")을 함께. 요약은 성만 쓰는 일이 많다.
 * - 새 표기가 옛 표기를 품으면("홀란" → "홀란드", "마누 코네" → "에마누엘 마누 코네") 이미 새 표기인 자리를 다시 바꾸지 않는다.
 * - 받침이 달라지면 바로 뒤의 조사를 맞춘다 — 조사 뒤에 조사가 더 붙어도("홀란과의" → "홀란드와의").
 * - 성 부분은 두 글자 이상만 바꾸고, 두 글자 이하면 낱말 경계에서만 바꾼다("네투어"의 "네투"는 이름이 아니다).
 */
export function renameInSummary(text, from, to) {
  let out = swapName(text, from, to, [to], [...from].length <= 2);
  const surname = (x) => (x.includes(" ") ? x.slice(x.indexOf(" ") + 1) : null);
  const a = surname(from);
  const b = surname(to);
  if (a && b && [...a].length >= 2) out = swapName(out, a, b, [to, b], [...a].length <= 2);
  return out;
}

/** 요약 고치기 — 고친 수와 실패(조회·쓰기) 문구 */
async function fixSummaries(supabase, renamed) {
  let fixed = 0;
  const failures = [];
  for (const { key, from, to } of renamed) {
    const { data, error } = await supabase.from("transfer_news").select("id, summary_ko").eq("verdict_player", key).not("summary_ko", "is", null);
    if (error) {
      failures.push(`요약 표기 조회 실패(${key}): ${error.message}`);
      continue;
    }
    for (const r of data ?? []) {
      const next = renameInSummary(r.summary_ko, from, to);
      if (next === r.summary_ko || [...next].length > 160) continue;
      const { error: e2 } = await supabase.from("transfer_news").update({ summary_ko: next }).eq("id", r.id);
      if (e2) failures.push(`요약 표기 고치기 실패(#${r.id} ${key}): ${e2.message}`);
      else fixed += 1;
    }
  }
  return { fixed, failures };
}

/**
 * 요약 속 옛 표기를 새 표기로 바꾼다 — 선수의 표기가 바뀌면(통용 표기가 레이블을 덮거나, 사람 사전이 고치면) 요약은 쓴 시점의
 * 표기로 남아 딜 제목과 갈린다. 그 선수로 판정된 보도의 요약에서만 바꾼다 — 요약은 추출 컬럼이라 다시 써도 된다.
 * ⚠ 조회·쓰기 실패를 삼키지 않는다 — `warnings`를 주면 거기에 담는다(실행 요약의 경고로 나간다).
 * @param {{ key: string, from: string, to: string }[]} renamed
 * @param {string[] | null} [warnings]
 * @returns {Promise<number>} 고친 요약 수
 */
async function fixSummaryNames(supabase, renamed, warnings = null) {
  const { fixed, failures } = await fixSummaries(supabase, renamed);
  if (warnings) warnings.push(...failures);
  return fixed;
}

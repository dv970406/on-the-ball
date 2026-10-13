/**
 * 구단 표시 프리셋 — 정규 영문명(clubs.mjs) → 한국어 표기·엠블럼.
 *
 * ⚠ **구단 사전(clubs.mjs)과 모듈을 가른다.** 사전은 수집 파이프라인(추출)이 쓰고, 이 프리셋은
 *   화면에 그릴 때만 쓴다. 한 모듈에 두면 프리셋 JSON 하나가 깨졌을 때 **동기화까지 import
 *   단계에서 죽는다**(QA에서 재현 — 에러에 파일명도 없었다).
 * ⚠ 파일은 처음 부를 때 읽는다 — 같은 이유로, 표시를 쓰지 않는 경로는 이 파일들과 무관해야 한다.
 */
import { readJson as readJsonFile } from "./util.mjs";

/** 한국어 표기·엠블럼을 갖는 리그 — 이 밖의 구단은 원문 영문명 그대로, 엠블럼 없이 그린다 */
const EPL = "프리미어리그";

let cache = null;

const readJson = (rel) => readJsonFile(new URL(rel, import.meta.url));

function load() {
  cache ??= {
    presets: readJson("./club-presets.json"),
    // ⚠ EPL 한국어 표기의 단일 소스(code 키)
    eplKo: readJson("../../team-names-ko.json"),
  };
  return cache;
}

/**
 * 정규 영문명 → 화면에 그릴 구단 표기.
 * @returns {{ name: string, short: string, crest: string | null, league: string | null }}
 *   crest는 `/crests/{code}.png` 상대 경로다 — **절대 URL로 바꾸지 않는다.** 글 상세의 대표 이미지
 *   (`og:image`·JSON-LD)는 절대 URL 이미지만 후보로 삼으므로, 상대 경로여야 엠블럼이 공유 카드가 되지 않는다.
 *   5대 리그 밖이면 crest가 null이고 name은 영문명 그대로다.
 */
export function clubDisplay(canonical) {
  const { presets, eplKo } = load();
  const p = Object.hasOwn(presets, canonical) ? presets[canonical] : null;
  if (!p || typeof p !== "object" || !p.code) return { name: canonical, short: canonical, crest: null, league: null };
  const ko = p.league === EPL ? eplKo[p.code] : p;
  return {
    name: ko?.name ?? canonical,
    short: ko?.short ?? ko?.name ?? canonical,
    crest: `/crests/${p.code}.png`,
    league: p.league,
  };
}

/**
 * 정규 영문명 → 엠블럼 파일명이자 `transfer_club.code`. 프리셋 밖이면 null — 호출자(딜 파생)가
 * `slugify(canonical)`로 만든다(파일은 없고, 화면은 약칭 모노그램으로 떨어진다).
 */
export function clubCode(canonical) {
  const { presets } = load();
  const p = Object.hasOwn(presets, canonical) ? presets[canonical] : null;
  return p && typeof p === "object" && p.code ? p.code : null;
}

/** 프리셋에 오른 정규 영문명 목록 — 검사와, 구단 표에 프리셋 구단 전부를 써 두는 파생(`clubRowsToWrite`)이 쓴다 */
export function presetClubs() {
  return Object.keys(load().presets).filter((k) => !k.startsWith("_"));
}

/** 구단 형태를 나타내는 법인 약어 — 한국어 구단명의 앞뒤에 남은 것(위키데이터 레이블 "헐 시티 AFC"·"베식타시 JK"·"SK 슈투름 그라츠") */
const LEADING_FORM = /^(?:1\.\s*)?(?:A?FC|CF|SC|AC|SSC|FK|NK|SK|VfL|VfB|RB)\s+/u;
const TRAILING_FORM = /\s+(?:A?FC|CF|SC|AC|SSC|FK|NK|SK|JK|BK|SAD|S\.A\.D\.|SpA|S\.p\.A\.)$/u;

/**
 * 한국어 구단명의 짧은 이름 — 요약 문장에 들어갈 이름이다("헐 시티 AFC" → "헐 시티", "베식타시 JK" → "베식타시").
 * 프리셋 구단은 프리셋의 약칭을 그대로 쓴다 — "파리 FC"의 FC를 걷으면 "파리"(파리 생제르맹으로 읽힌다)가 되므로 사람이 정한 값이 이긴다.
 * 그 밖은 앞뒤의 법인 약어를 걷는다(여럿이면 전부). 다 걷어서 비면 원래 이름이다.
 * `names-ko.mjs`의 `shortClubName`(구단 행의 `short_name` — 앞뒤 한 겹만 걷는다)과 다른 함수다: 그쪽은 화면 표기라 바꾸지 않는다.
 * @param {string} koName
 */
export function shortKoClubName(koName) {
  if (!koName) return koName;
  const name = koName.trim();
  const preset = presetShortByKoName().get(name);
  if (preset) return preset;
  let short = name;
  for (let prev = null; prev !== short; ) {
    prev = short;
    short = short.replace(LEADING_FORM, "").replace(TRAILING_FORM, "").trim();
  }
  return short || name;
}

let presetShorts = null;
/** 프리셋 구단의 한국어 정식명 → 약칭 */
function presetShortByKoName() {
  if (presetShorts) return presetShorts;
  presetShorts = new Map();
  for (const canonical of presetClubs()) {
    const d = clubDisplay(canonical);
    if (d.league) presetShorts.set(d.name, d.short);
  }
  return presetShorts;
}

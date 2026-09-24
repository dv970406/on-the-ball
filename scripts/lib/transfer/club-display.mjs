/**
 * 구단 표시 프리셋 — 정규 영문명(clubs.mjs) → 한국어 표기·엠블럼.
 *
 * ⚠ **구단 사전(clubs.mjs)과 모듈을 가른다.** 사전은 수집 파이프라인(추출)이 쓰고, 이 프리셋은
 *   화면에 그릴 때만 쓴다. 한 모듈에 두면 프리셋 JSON 하나가 깨졌을 때 **동기화까지 import
 *   단계에서 죽는다**(QA에서 재현 — 에러에 파일명도 없었다).
 * ⚠ 파일은 처음 부를 때 읽는다 — 같은 이유로, 표시를 쓰지 않는 경로는 이 파일들과 무관해야 한다.
 */
import { readFileSync } from "node:fs";

/** 한국어 표기·엠블럼을 갖는 리그 — 이 밖의 구단은 원문 영문명 그대로, 엠블럼 없이 그린다 */
const EPL = "프리미어리그";

let cache = null;

function readJson(rel) {
  const url = new URL(rel, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch (e) {
    throw new Error(`${url.pathname}를 읽지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
  }
}

function load() {
  cache ??= {
    presets: readJson("./club-presets.json"),
    // ⚠ EPL 한국어 표기의 단일 소스 — 동기화(sync-matches)가 team.name에 입히는 그 파일이다
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

/** 프리셋에 오른 정규 영문명 목록(검사용) */
export function presetClubs() {
  return Object.keys(load().presets).filter((k) => !k.startsWith("_"));
}

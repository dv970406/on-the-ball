/**
 * 위키데이터에서 선수·구단의 한국어 표기를 찾는다 — 이름 사전 자동 캐시(`names-ko.mjs`)의 원천.
 *
 * 한국어 위키백과가 쓰는 표기가 위키데이터 항목의 한국어 레이블로 올라와 있다(실측: Federico Chiesa →
 * 페데리코 키에사, Watford F.C. → 왓퍼드 FC). 키도 비용도 없다.
 *
 * ⚠ **동명이인을 잡지 않도록 항목의 종류를 확인한다** — 선수는 직업(P106)에 "축구 선수", 구단은 분류(P31)에
 *   "축구 클럽"이 있을 때만 받는다. "Watford"를 그냥 찾으면 도시가 먼저 나온다.
 * ⚠ **한글이 없는 한국어 레이블은 버린다** — 영문을 그대로 복사해 둔 항목이 있다. 그걸 받으면 "사전에
 *   있으니 한국어"라고 믿은 채 영문을 그린다.
 * ⚠ 위키미디어 API 정책상 **연락처를 담은 User-Agent가 필수**다(없으면 차단될 수 있다).
 */

const API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "on-the-ball-transfer-sync/1.0 (https://github.com/dv970406/on-the-ball)";
/** 직업(P106) — 축구 선수 */
const FOOTBALLER = "Q937857";
/** 분류(P31) — 축구 클럽 */
const FOOTBALL_CLUB = "Q476028";
/** 검색 결과에서 볼 후보 수 — 도시·동명이인 뒤에 있는 구단·선수를 놓치지 않을 만큼 */
const CANDIDATES = 7;
const TIMEOUT_MS = 10_000;

/** 항목의 한 속성(P106·P31)이 가리키는 항목 id들 */
function claimIds(entity, prop) {
  return (entity?.claims?.[prop] ?? [])
    .map((c) => c?.mainsnak?.datavalue?.value?.id)
    .filter((id) => typeof id === "string");
}

/** 한국어 레이블 — 한글이 하나도 없으면 없는 것으로 본다(영문 복사본) */
export function koLabel(entity) {
  const v = entity?.labels?.ko?.value;
  return typeof v === "string" && /[가-힣]/.test(v) ? v.trim() : null;
}

/**
 * 검색 순서대로 후보를 보며 **종류가 맞는 첫 항목**을 고른다(순수 함수 — 테스트가 네트워크 없이 돈다).
 * @param {string[]} ids 검색 결과 순서의 항목 id
 * @param {Record<string, object>} entities wbgetentities 응답의 `entities`
 * @param {"player" | "club"} kind
 * @returns {{ wikidataId: string | null, nameKo: string | null }}
 */
export function pickEntity(ids, entities, kind) {
  for (const id of ids) {
    const e = entities[id];
    const ok = kind === "player" ? claimIds(e, "P106").includes(FOOTBALLER) : claimIds(e, "P31").includes(FOOTBALL_CLUB);
    if (ok) return { wikidataId: id, nameKo: koLabel(e) };
  }
  return { wikidataId: null, nameKo: null };
}

async function getJson(params, fetchImpl) {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`위키데이터 ${res.status}`);
  return res.json();
}

/**
 * 이름 하나 → 한국어 표기. 찾지 못하면 `{ wikidataId: null, nameKo: null }`(정상값 — 캐시에 "없음"으로 남긴다).
 * 네트워크·HTTP 오류는 던진다 — 호출부가 그 이름을 캐시하지 않고 다음 실행에 다시 찾는다.
 */
export async function lookupKo(name, kind, fetchImpl = fetch) {
  const search = await getJson({ action: "wbsearchentities", search: name, language: "en", uselang: "en", type: "item", limit: String(CANDIDATES) }, fetchImpl);
  const ids = (search.search ?? []).map((s) => s.id).filter(Boolean);
  if (!ids.length) return { wikidataId: null, nameKo: null };
  const got = await getJson({ action: "wbgetentities", ids: ids.join("|"), props: "labels|claims", languages: "ko" }, fetchImpl);
  return pickEntity(ids, got.entities ?? {}, kind);
}

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
/** 직업(P106) — 축구 감독. 은퇴 후 감독이 된 사람은 "축구 선수"도 함께 달고 있다 */
const FOOTBALL_MANAGER = "Q628099";
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
 * 선수로 받을 최고 나이 — 출생 연도(P569)가 이보다 오래면 은퇴한 동명이인이다.
 * ⚠ "Alessandro Romano"(칼리아리 10대 유망주 — 위키데이터에 없다)가 1969년생 동명 선수로 확인됐다(원문 대조 QA).
 *   이름이 통째로 같아도 세대가 다르면 다른 사람이다. 투헬(1973년생)도 이 기준만으로 빠진다.
 *   출생일이 없는 항목은 거르지 않는다(모르는 것을 틀렸다고 하지 않는다).
 */
const MAX_PLAYER_AGE = 40;
const birthYear = (entity) => {
  const t = entity?.claims?.P569?.find((c) => c?.mainsnak?.datavalue?.value?.time)?.mainsnak.datavalue.value.time;
  return t ? Number(t.slice(1, 5)) : null;
};

/** 동명이인 중 "압도적으로 유명한 한 명"의 기준 — 위키백과 언어판 수 */
const DOMINANT_MIN = 10;
const DOMINANT_RATIO = 2;
const sitelinkCount = (entity) => Object.keys(entity?.sitelinks ?? {}).length;

/** 이름 비교용 정규형 — 악센트·대소문자·기호 차이를 접는다("João Pedro" = "Joao Pedro") */
export function normalizeName(v) {
  return String(v)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * 검색 결과에서 **종류가 맞는 항목**을 고른다(순수 함수 — 테스트가 네트워크 없이 돈다).
 *
 * ⚠ **선수는 이름이 통째로 같은 후보만 받는다**(레이블이나 별칭 하나가 검색어와 정규형으로 같아야 한다).
 *   위키데이터 검색은 별칭의 **앞부분**만 맞아도 결과에 올린다 — "Joao Pedro"를 찾았더니 별칭
 *   "Joao Pedro Cavaco Cancelo"를 가진 주앙 칸셀루가 첫 축구 선수로 잡혀, 다른 선수가 칸셀루로
 *   그려졌다(운영 실측). 직업 확인만으로는 "축구 선수끼리의 혼동"을 막지 못한다.
 * ⚠ **같은 이름의 축구 선수가 서로 다른 한국어 표기로 여럿이면, 압도적으로 유명한 한 명일 때만 고른다** —
 *   위키백과 언어판 수(sitelinks)가 2위의 2배 이상이고 10개 이상일 때다. 전부 비우면 브루누 페르난드스·
 *   베르나르두 실바·코나테 같은 간판 선수가 영문으로 남았다(유명 선수 999명 시뮬레이션에서 22명).
 *   이적 보도에 오르는 선수는 대개 그 이름의 가장 유명한 사람이다. 비슷하면 여전히 비운다 —
 *   틀린 표기보다 빈 칸(영문)이 낫고, 필요하면 사람이 `players-ko.json`으로 채운다.
 * ⚠ **직업에 "축구 감독"이 함께 붙은 후보는 선수로 보지 않는다** — 투헬·클롭·아르테타는 선수 출신이라
 *   "축구 선수"도 달고 있어, 직업 확인만으로는 "Alan Shearer in agreement with Thomas Tuchel"이 딜이 됐다(운영).
 *   유명 선수 999명 중 이 표시가 붙은 사람은 16명(1.6%)이고 대부분 은퇴해 지도자가 된 선수다. 선수 겸 코치처럼
 *   예외가 필요하면 사람 사전(`players-ko.json`)에 넣는다 — 사람 사전이 이 판정보다 먼저다.
 * ⚠ "현재 소속팀(P54 종료일 없음)"은 쓰지 않는다 — 유명 선수 999명 중 130명(홀란·사카·반다이크 포함)이
 *   소속팀 없음으로 나왔고, 투헬은 소속팀이 있다고 나왔다(측정).
 * ⚠ 구단은 이름 일치를 요구하지 않는다 — 사전의 정규명("Watford")과 항목 레이블("Watford F.C.")이
 *   원래 다르고, 분류(축구 클럽)가 동명이인을 거른다.
 * @param {{ id: string, texts: string[] }[]} hits 검색 결과 순서의 후보(`texts`는 레이블·일치한 별칭)
 * @param {Record<string, object>} entities wbgetentities 응답의 `entities`
 * @param {"player" | "club"} kind
 * @param {string} name 찾은 이름
 * @param {number} [nowYear] 나이 판정 기준 연도(테스트가 고정한다)
 * @returns {{ wikidataId: string | null, nameKo: string | null }}
 */
export function pickEntity(hits, entities, kind, name, nowYear = new Date().getUTCFullYear()) {
  const none = { wikidataId: null, nameKo: null };
  if (kind === "club") {
    const hit = hits.find((h) => claimIds(entities[h.id], "P31").includes(FOOTBALL_CLUB));
    return hit ? { wikidataId: hit.id, nameKo: koLabel(entities[hit.id]) } : none;
  }
  const wanted = normalizeName(name);
  const exact = hits.filter(
    (h) =>
      claimIds(entities[h.id], "P106").includes(FOOTBALLER) &&
      !claimIds(entities[h.id], "P106").includes(FOOTBALL_MANAGER) &&
      !(birthYear(entities[h.id]) !== null && nowYear - birthYear(entities[h.id]) > MAX_PLAYER_AGE) &&
      h.texts.some((t) => normalizeName(t) === wanted),
  );
  if (!exact.length) return none;
  const labels = new Set(exact.map((h) => koLabel(entities[h.id])).filter((v) => v !== null));
  if (labels.size > 1) {
    const ranked = exact.map((h) => ({ h, n: sitelinkCount(entities[h.id]) })).sort((a, b) => b.n - a.n);
    const [top, second] = ranked;
    const dominant = top.n >= DOMINANT_MIN && top.n >= second.n * DOMINANT_RATIO && koLabel(entities[top.h.id]) !== null;
    return dominant ? { wikidataId: top.h.id, nameKo: koLabel(entities[top.h.id]) } : none;
  }
  const chosen = labels.size === 1 ? exact.find((h) => koLabel(entities[h.id]) !== null) : exact[0];
  return { wikidataId: chosen.id, nameKo: koLabel(entities[chosen.id]) };
}

/** wbsearchentities 결과 → 후보(레이블과, 별칭으로 걸렸으면 그 별칭) */
export function toHits(search) {
  return (search ?? [])
    .filter((s) => typeof s?.id === "string")
    .map((s) => ({ id: s.id, texts: [s.label, s.match?.text].filter((t) => typeof t === "string") }));
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
  // ⚠ 선수는 이름 한 토큰("Joao"·"Fabio")으로 찾지 않는다 — 흔한 이름 하나로는 누구인지 특정할 수 없다
  //   (시뮬레이션: 옛 규칙은 이름 첫 토큰만으로 671개 중 232개를 누군가로 특정했다). 한 토큰 선수(Neymar)는 사람 사전이 맡는다.
  if (kind === "player" && normalizeName(name).split(" ").length < 2) return { wikidataId: null, nameKo: null };
  const search = await getJson({ action: "wbsearchentities", search: name, language: "en", uselang: "en", type: "item", limit: String(CANDIDATES) }, fetchImpl);
  const hits = toHits(search.search);
  if (!hits.length) return { wikidataId: null, nameKo: null };
  const got = await getJson({ action: "wbgetentities", ids: hits.map((h) => h.id).join("|"), props: "labels|claims|sitelinks", languages: "ko" }, fetchImpl);
  return pickEntity(hits, got.entities ?? {}, kind, name);
}

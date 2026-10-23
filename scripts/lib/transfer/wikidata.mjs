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
  const eligible = hits.filter(
    (h) =>
      claimIds(entities[h.id], "P106").includes(FOOTBALLER) &&
      !claimIds(entities[h.id], "P106").includes(FOOTBALL_MANAGER) &&
      !(birthYear(entities[h.id]) !== null && nowYear - birthYear(entities[h.id]) > MAX_PLAYER_AGE),
  );
  let exact = eligible.filter((h) => h.texts.some((t) => normalizeName(t) === wanted));
  /*
   * 통째 일치가 없으면 **레이블 기준의 앞부분 일치**를 후보가 하나뿐일 때만 받는다. 위키데이터 레이블이 기사 표기보다
   * 길거나 짧은 실존 선수가 막혔다 — "Valentin Atangana" ↔ 레이블 "Valentin Atangana Edoa"(레이블이 찾는 이름으로 시작),
   * "Estevao Willian" ↔ 레이블 "Estevão" + 별칭 "Estêvão Willian Almeida …"(찾는 이름이 레이블로 시작하고 별칭이 찾는 이름으로 시작).
   * ⚠ 별칭만 앞부분이 같은 후보는 받지 않는다 — "Joao Pedro"가 별칭 "Joao Pedro Cavaco Cancelo"의 칸셀루로 풀린 일이 그 자리다.
   *   `texts[0]`이 레이블이다(`toHits`).
   */
  if (!exact.length) {
    const prefixed = (t) => normalizeName(t).startsWith(`${wanted} `);
    const prefix = eligible.filter((h) => {
      const label = normalizeName(h.texts[0] ?? "");
      return prefixed(label) || (wanted.startsWith(`${label} `) && h.texts.slice(1).some(prefixed));
    });
    if (prefix.length === 1) exact = prefix;
  }
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

/** 시각 한정자(P580 시작 · P582 종료)의 값 — "+2023-08-12T00:00:00Z". 값이 없는 한정자(somevalue)도 "있다"로 본다 */
const qualifierTime = (claim, prop) => {
  const q = claim?.qualifiers?.[prop]?.[0];
  return q ? (q.datavalue?.value?.time ?? "") : null;
};

/** 취득 방식(P1642) "임대" — 소속팀 기록에 이 한정자가 있으면 그 소속은 임대다 */
export const LOAN_ACQUISITION = "Q2914547";
/** 한정자 값(항목 id)들 */
const qualifierIds = (claim, prop) => (claim?.qualifiers?.[prop] ?? []).map((q) => q?.datavalue?.value?.id).filter((id) => typeof id === "string");

/**
 * 현 소속 구단 — 소속팀(P54) 중 **종료일(P582)이 없는 축구 클럽**(국가대표팀·여자팀·유스팀은 P31이 다르다) 가운데 시작일(P580)이
 * 가장 늦은 것. 임대 중이면 임대 구단이 뽑힌다(시작이 더 늦다). 우선 순위(rank=preferred)가 있으면 그것이 먼저다.
 * 종료일 없는 클럽 항목이 하나도 없으면 `null` — 기록이 들쭉날쭉한 항목에서 옛 소속을 지어내지 않는다.
 *
 * **보유 구단(`owner`)** — 뽑힌 소속에 취득 방식 "임대"(P1642 = `LOAN_ACQUISITION`) 한정자가 있고 종료일 없는 **다른** 클럽 기록이
 * 있으면 그 구단이다. 임대 중인 선수의 이적설에서 파는 쪽이다(출발 구단 폴백).
 * 한정자가 없거나, 다른 열린 기록이 없거나 둘 이상이면 null — 임대를 짐작하지 않는다(실측: 가르나초 — 빌라 기록에 임대 한정자, 첼시 기록이 열려 있다).
 * @param {object} playerEntity wbgetentities의 선수 항목(claims 포함)
 * @param {Record<string, object>} teams P54가 가리키는 항목들(labels·claims)
 * @returns {{ wikidataId: string, nameEn: string | null, nameKo: string | null, owner: { wikidataId: string, nameEn: string | null, nameKo: string | null } | null } | null}
 */
export function pickCurrentClub(playerEntity, teams) {
  const open = (playerEntity?.claims?.P54 ?? [])
    .filter((c) => c?.rank !== "deprecated" && typeof c?.mainsnak?.datavalue?.value?.id === "string" && qualifierTime(c, "P582") === null)
    .map((c) => ({ id: c.mainsnak.datavalue.value.id, start: qualifierTime(c, "P580") ?? "", preferred: c.rank === "preferred", loan: qualifierIds(c, "P1642").includes(LOAN_ACQUISITION) }))
    .filter((c) => claimIds(teams[c.id], "P31").includes(FOOTBALL_CLUB));
  if (!open.length) return null;
  open.sort((a, b) => Number(b.preferred) - Number(a.preferred) || b.start.localeCompare(a.start));
  const describe = (id) => {
    const team = teams[id];
    const en = team?.labels?.en?.value;
    return { wikidataId: id, nameEn: typeof en === "string" ? en.trim() : null, nameKo: koLabel(team) };
  };
  // 보유 구단 후보가 둘 이상(종료일이 빠진 옛 소속 기록이 남은 항목)이면 짐작하지 않는다 — 시작일이 비어 뒤로 밀린 진짜 보유 구단 대신
  // 옛 구단이 뽑혔다
  const owners = open[0].loan ? [...new Set(open.slice(1).filter((c) => c.id !== open[0].id && !c.loan).map((c) => c.id))] : [];
  return { ...describe(open[0].id), owner: owners.length === 1 ? describe(owners[0]) : null };
}

/** wbgetentities 한 번에 실을 항목 수 — API 상한(50) */
const ENTITY_BATCH = 50;
/** 항목 묶음 요청의 시간 상한 — 한 번에 여러 항목의 claims를 받아 이름 하나짜리 요청보다 응답이 크다 */
const BATCH_TIMEOUT_MS = 20_000;
/** 이름 검색(wbsearchentities)을 동시에 몇 개까지 — 위키미디어 API 예절(동시 요청을 적게) */
const SEARCH_CONCURRENCY = 2;

/** `items`를 최대 `n`개씩 동시에 돌린다 — 결과 순서는 입력 순서다 */
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/**
 * 항목들을 묶어서 받는다(`ENTITY_BATCH`개씩 한 요청) — 이름·선수마다 따로 부르던 wbgetentities를 한 실행에서 몇 번으로 줄인다.
 * 묶음 하나가 실패하면 그 묶음의 id들을 `failed`에 담는다 — 호출부가 그 id에 기댄 이름만 실패로 돌린다(캐시하지 않고 다음 실행이 다시 찾는다).
 * @returns {Promise<{ entities: Record<string, object>, failed: Map<string, Error> }>}
 */
async function getEntities(ids, params, fetchImpl) {
  const entities = {};
  const failed = new Map();
  const unique = [...new Set(ids)];
  // ⚠ 묶음 하나가 실패하면 그 묶음에 든 **무관한 이름들까지** 함께 실패한다(이름마다 따로 받던 때는 그 이름 하나였다) — 잠깐의
  //   끊김이면 다시 받아 메운다. 다시 받기는 **호출당 한 번**뿐이다 — 장애 중이면 묶음마다 시간 상한을 두 번씩 기다리게 된다
  let retryLeft = 1;
  const fetchPart = (part) => getJson({ action: "wbgetentities", ids: part.join("|"), ...params }, fetchImpl, BATCH_TIMEOUT_MS);
  for (let i = 0; i < unique.length; i += ENTITY_BATCH) {
    const part = unique.slice(i, i + ENTITY_BATCH);
    let got = null;
    let err = null;
    try {
      got = await fetchPart(part);
    } catch (e) {
      err = e instanceof Error ? e : new Error(String(e));
      if (retryLeft > 0) {
        retryLeft -= 1;
        try {
          got = await fetchPart(part);
          err = null;
        } catch (e2) {
          err = e2 instanceof Error ? e2 : new Error(String(e2));
        }
      }
    }
    if (got) Object.assign(entities, got.entities ?? {});
    else for (const id of part) failed.set(id, err);
  }
  return { entities, failed };
}

/** 열린(종료일 없는) 소속팀 항목 id — 현 소속 후보 */
const openTeamIds = (player) =>
  [...new Set((player?.claims?.P54 ?? []).filter((c) => qualifierTime(c, "P582") === null).map((c) => c?.mainsnak?.datavalue?.value?.id).filter((id) => typeof id === "string"))].slice(0, 20);

/**
 * 선수 항목 id들 → 현 소속 구단(`pickCurrentClub`). 선수 항목과 소속팀 항목을 각각 묶음으로 받는다(선수마다 두 번 부르던 것을 실행당 몇 번으로).
 * `known`에 이미 받은 선수 항목(claims 포함 — 이름 조회가 받은 것)이 있으면 다시 받지 않는다.
 * @param {string[]} playerIds
 * @returns {Promise<Map<string, { ok: true, club: ReturnType<typeof pickCurrentClub> } | { ok: false, error: Error }>>}
 *   네트워크·HTTP 오류는 `ok: false`다(호출부가 그 선수를 캐시하지 않는다)
 */
export async function currentClubsOf(playerIds, fetchImpl = fetch, { known = {} } = {}) {
  const ids = [...new Set(playerIds)];
  const toFetch = ids.filter((id) => !known[id]?.claims);
  const players = await getEntities(toFetch, { props: "claims" }, fetchImpl);
  const entityOf = (id) => (known[id]?.claims ? known[id] : players.entities[id]);
  const teamIds = ids.filter((id) => !players.failed.has(id)).flatMap((id) => openTeamIds(entityOf(id)));
  const teams = await getEntities(teamIds, { props: "labels|claims", languages: "en|ko" }, fetchImpl);
  const out = new Map();
  for (const id of ids) {
    const err = players.failed.get(id) ?? openTeamIds(entityOf(id)).map((t) => teams.failed.get(t)).find(Boolean);
    if (err) {
      out.set(id, { ok: false, error: err });
      continue;
    }
    // 판정은 선수마다 감싼다 — 예상 밖 항목 데이터 하나가 나머지 선수까지 멈추지 않게(`lookupKoMany`와 같다)
    try {
      out.set(id, { ok: true, club: openTeamIds(entityOf(id)).length ? pickCurrentClub(entityOf(id), teams.entities) : null });
    } catch (e) {
      out.set(id, { ok: false, error: e instanceof Error ? e : new Error(String(e)) });
    }
  }
  return out;
}

async function getJson(params, fetchImpl, timeoutMs = TIMEOUT_MS) {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`위키데이터 ${res.status}`);
  return res.json();
}

const NONE = Object.freeze({ wikidataId: null, nameKo: null });

/**
 * 이름들 → 한국어 표기. 이름마다 검색(wbsearchentities — 동시 `SEARCH_CONCURRENCY`개)하고, 후보 항목은 **모든 이름의 것을 모아 묶음으로**
 * 받는다(`getEntities`). 판정(`pickEntity` — 종류·이름 일치·나이·동명이인)은 이름 하나씩 따로 받던 때와 같다.
 * 찾지 못하면 `{ wikidataId: null, nameKo: null }`(정상값 — 캐시에 "없음"으로 남긴다).
 * 네트워크·HTTP 오류는 그 이름만 `ok: false`다 — 검색이 실패했거나, 그 이름의 후보가 든 항목 묶음이 실패했다. 호출부가 그 이름을
 * 캐시하지 않고 다음 실행에 다시 찾는다.
 * @param {{ name: string, kind: "player" | "club" }[]} items
 * @returns {Promise<{ results: ({ ok: true, value: { wikidataId: string | null, nameKo: string | null } } | { ok: false, error: Error })[], entities: Record<string, object> }>}
 *   `entities`는 받은 후보 항목(claims 포함) — 현 소속 조회가 선수 항목을 다시 받지 않게 넘길 수 있다
 */
export async function lookupKoMany(items, fetchImpl = fetch) {
  // ⚠ 선수는 이름 한 토큰("Joao"·"Fabio")으로 찾지 않는다 — 흔한 이름 하나로는 누구인지 특정할 수 없다
  //   (시뮬레이션: 옛 규칙은 이름 첫 토큰만으로 671개 중 232개를 누군가로 특정했다). 한 토큰 선수(Neymar)는 사람 사전이 맡는다.
  const searched = await mapLimit(items, SEARCH_CONCURRENCY, async ({ name, kind }) => {
    if (kind === "player" && normalizeName(name).split(" ").length < 2) return { hits: [] };
    try {
      const search = await getJson({ action: "wbsearchentities", search: name, language: "en", uselang: "en", type: "item", limit: String(CANDIDATES) }, fetchImpl);
      return { hits: toHits(search.search) };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  });
  const { entities, failed } = await getEntities(searched.flatMap((s) => (s.hits ?? []).map((h) => h.id)), { props: "labels|claims|sitelinks", languages: "ko" }, fetchImpl);
  const results = items.map(({ name, kind }, i) => {
    const s = searched[i];
    if (s.error) return { ok: false, error: s.error };
    if (!s.hits.length) return { ok: true, value: { ...NONE } };
    const err = s.hits.map((h) => failed.get(h.id)).find(Boolean);
    if (err) return { ok: false, error: err };
    // ⚠ 판정은 이름마다 감싼다 — 예상 밖 항목 데이터 하나로 던지면 묶음 전체가, 나아가 파생이 멈춘다(그 이름만 실패로 둔다)
    try {
      return { ok: true, value: pickEntity(s.hits, entities, kind, name) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  });
  return { results, entities };
}

/**
 * 이름 하나 → 한국어 표기(`lookupKoMany`의 한 건짜리). 찾지 못하면 `{ wikidataId: null, nameKo: null }`.
 * 네트워크·HTTP 오류는 던진다 — 호출부가 그 이름을 캐시하지 않고 다음 실행에 다시 찾는다.
 */
export async function lookupKo(name, kind, fetchImpl = fetch) {
  const [r] = (await lookupKoMany([{ name, kind }], fetchImpl)).results;
  if (!r.ok) throw r.error;
  return r.value;
}

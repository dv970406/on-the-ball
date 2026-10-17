/**
 * 이름 표기 정비 목록 — 사람(또는 Claude Code 팀원)이 주 1회 사전을 확정할 작업 목록을 DB에서 뽑는다.
 * **읽기만 한다**(service_role 클라이언트지만 select뿐) — Anthropic API·위키데이터를 부르지 않고 DB에 쓰지 않는다.
 *
 *   node scripts/names-todo.mjs                      # 로컬 DB — 마크다운을 stdout으로
 *   node scripts/names-todo.mjs --json out.json      # 같은 내용을 JSON으로도 쓴다
 *   node scripts/names-todo.mjs --remote             # 원격(운영) — 대상은 환경변수다(`set -a; source .env.prod; set +a`)
 *
 * 목록(보드 범위 — 파생과 같은 기준 `derivationStartMs` 이후의 보도와, 화면 범위 `boardScopeStartMs` 이후의 딜):
 *   1. 확정 대기 통용 표기 — 캐시의 `source = 'llm'` 선수 중 사람 사전(`players-ko.json`)에 없는 것
 *   2. 표기 없는 선수 — 보드 딜의 선수 중 사람 사전·캐시 모두 표기가 없는 것
 *   3. 확인되지 않아 막힌 선수 — 파생(메모리에서만 — `deriveDeals`는 순수 함수다)이 "미확인 선수"로 건너뛴 이름
 *   4. 요약 속 표기 갈림 — 같은 선수의 요약들에서 이름 표기가 사전·캐시 표기와 다르거나 서로 갈린 것
 *   5. 사전 키 의심 — 사전 키가 범위 안 어디에도 없고 편집 거리 1~2의 다른 이름만 나오는 것(오타·철자 변형)
 *   6. 영문으로 그려지는 구단·매체 — 한국어 표기가 없는 판정 구단, `reporters.json`의 `cited`에 없는 인용 매체
 *
 * ⚠ 목록 계산(`buildTodo` 이하)은 DB와 분리된 순수 함수다 — `scripts/test-transfer-names-todo.mjs`가 가짜 행으로 검사한다.
 * ⚠ 4번의 "요약 속 이름 찾기"는 추정이다(한글 → 로마자 자음 골격을 영문 이름과 대조) — 후보를 보여 줄 뿐 고치지 않는다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { connectFromEnv, flag, readAll } from "./lib/sync-db.mjs";
import { boardScopeStartMs, dealKey, deriveDeals, derivationStartMs, loadWindows, normalizePlayer } from "./lib/transfer/derive-deals.mjs";
import { canonicalClubName, createNameBook, loadGlossary, loadNameCache, loadPlayerDictionary } from "./lib/transfer/names-ko.mjs";
import { clubDisplay } from "./lib/transfer/club-display.mjs";

const HANGUL = /[가-힣]/u;

// ── 순수 계산 ──────────────────────────────────────────────────────────────

/** 편집 거리(삽입·삭제·치환 1) — 코드포인트 단위 */
export function levenshtein(a, b) {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/**
 * 인용 매체 표기 → `reporters.json`의 `cited` 키.
 * ⚠ `src/entities/transfer/lib/reporter.ts`의 `citedKey`와 같아야 한다 — 파이프라인이 TS를 import할 수 없어 규칙을 옮겼다.
 *   테스트가 그 TS 함수를 읽어 같은 입력에 같은 값을 내는지 대조한다.
 */
export function citedKey(outlet) {
  return outlet
    .toLowerCase()
    .replace(/^the\s+/u, "")
    .replace(/[^a-z0-9]/gu, "");
}

/** 인용 매체가 `cited`에 등재됐는가 — `reporter.ts`의 `citedOutletOf`와 같은 순서("A via B"면 앞 신문도 본다) */
export function isCitedKnown(attributedTo, cited) {
  return Boolean(cited[citedKey(attributedTo)] ?? cited[citedKey(attributedTo.split(/\s+via\s+/iu)[0])]);
}

// 한글 음절 → 로마자(국어의 로마자 표기법 근사). 이름 찾기용이라 정확한 표기가 목적이 아니다
const INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const MEDIALS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FINALS = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];

export function romanize(hangul) {
  let out = "";
  for (const ch of hangul) {
    const code = ch.codePointAt(0) - 0xac00;
    if (code < 0 || code > 11171) continue;
    out += INITIALS[Math.floor(code / 588)] + MEDIALS[Math.floor((code % 588) / 28)] + FINALS[code % 28];
  }
  return out;
}

/** 로마자의 가벼운 정규화 — 영문 이름과 한글 로마자를 같은 모양으로 접는다(악센트·대소문자·발음이 같은 철자) */
function latinBase(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/gu, "")
    .replace(/ph/gu, "p")
    .replace(/th/gu, "t")
    .replace(/ck/gu, "k")
    .replace(/sch|sh/gu, "s")
    .replace(/ch/gu, "j")
    .replace(/c(?=[eiy])/gu, "s")
    .replace(/[cq]/gu, "k")
    .replace(/x/gu, "ks")
    .replace(/z/gu, "s")
    .replace(/v/gu, "b")
    .replace(/f/gu, "p");
}

/**
 * 자음 골격 — 유·무성(g/k·d/t·b/p)과 r/l을 접고 모음·반모음·h를 걷는다. "Gakpo"·"각포(gakpo)"·"가크포(gakeupo)"가
 * 모두 "kp"가 된다 — 요약 속 어느 낱말이 그 선수의 이름인지 찾는 데만 쓴다(표기가 같은지는 한글 그대로 비교한다).
 */
export function nameSkeleton(s) {
  return latinBase(s)
    .replace(/ng/gu, "n")
    .replace(/[wyh]/gu, "")
    .replace(/r/gu, "l")
    .replace(/g/gu, "k")
    .replace(/d/gu, "t")
    .replace(/b/gu, "p")
    .replace(/[aeiou]/gu, "")
    .replace(/(.)\1+/gu, "$1");
}

const similarity = (a, b) => (a.length || b.length ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0);

/** 이름 뒤에 붙는 조사 — 한 번에 하나씩 걷어 본다(최대 둘: "홀란드와의") */
const JOSA = ["으로", "에게", "에서", "까지", "부터", "에", "이", "가", "은", "는", "을", "를", "과", "와", "의", "도", "로", "만"];
function josaForms(word) {
  const forms = [word];
  let cur = word;
  for (let n = 0; n < 2; n += 1) {
    const j = JOSA.find((x) => cur.endsWith(x) && [...cur].length > [...x].length + 1);
    if (!j) break;
    cur = cur.slice(0, -j.length);
    forms.push(cur);
  }
  return forms;
}

/**
 * 이름으로 받을 문턱 — 자음 골격 유사도와, 모음까지 넣은 로마자의 거리(짧은 골격이 우연히 맞는 일반어를 거른다).
 * 실측: 이름은 0~0.63(홀란드 0.56 · 펠리스 0.63 · 판 데이크 0.56), 골격 "kn"이 우연히 맞는 "기간"은 Kane과 4글자 차이.
 * 거리 3 이하는 비율과 무관하게 받고("케인" ↔ kane 3/4), 골격이 두 글자뿐이면 거리 3까지만 받는다.
 */
const SKELETON_MIN = 0.75;
const ROMAN_MAX = 0.7;
const SHORT_SKELETON_LEV_MAX = 3;

/**
 * 구절 후보의 순위 — 골격 유사도 → 전체 이름에 맞은 것(성에만 맞은 것보다 — "해리 케인" > "케인") → 낱말이 적은 것 →
 * 로마자 거리(정규화하지 않는다 — 나누면 조사가 붙은 긴 꼴이 오히려 가까워진다) → 짧은 꼴(조사를 걷은 것).
 * ⚠ 낱말 수는 **적은 쪽**이 이긴다 — 골격은 모음·반복 자음을 접어서 뒤에 붙은 낱말("영입"·"대해")이 점수를 깎지 않는다.
 */
function ranksAbove(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.full !== b.full) return a.full;
  if (a.n !== b.n) return a.n < b.n;
  if (a.romanLev !== b.romanLev) return a.romanLev < b.romanLev;
  return a.text.length < b.text.length;
}

/**
 * 요약 속에서 그 선수의 이름으로 보이는 구절 하나 — 한글 낱말 1~(영문 토큰 수 + 1)개를 이어 붙인 구절 중, 자음 골격이
 * 영문 전체 이름 또는 성(마지막 토큰)과 가장 닮은 것. 순위는 `ranksAbove`.
 * `forms`는 그 구절의 조사를 걷기 전후 꼴 전부다 — 기준 표기와 같은지는 어느 꼴로든 본다("케인의"는 "케인"이다).
 * @returns {{ text: string, forms: string[], score: number } | null}
 */
export function findNameSpan(summary, english) {
  const enTokens = english.trim().split(/\s+/u).filter(Boolean);
  if (!enTokens.length) return null;
  const targets = [...new Set([enTokens.join(" "), enTokens.at(-1)])].map((t, i) => ({ skel: nameSkeleton(t), base: latinBase(t), full: i === 0 })).filter((t) => t.skel.length >= 2);
  if (!targets.length) return null;
  const maxLen = Math.min(4, enTokens.length + 1);
  let best = null;
  // 한글 낱말이 공백으로만 이어진 덩어리 안에서만 구절을 만든다(문장부호·영문을 건너 이어 붙이지 않는다)
  // 하이픈은 낱말 안에 둔다("알렉산더-아놀드")
  for (const phrase of summary.split(/[^가-힣\s-]+/u)) {
    const words = phrase.split(/\s+/u).filter((w) => HANGUL.test(w));
    for (let i = 0; i < words.length; i += 1) {
      for (let n = 1; n <= maxLen && i + n <= words.length; n += 1) {
        const head = words.slice(i, i + n - 1);
        const forms = josaForms(words[i + n - 1]).map((last) => [...head, last].join(" "));
        for (const text of forms) {
          const roman = romanize(text);
          const skel = nameSkeleton(roman);
          if (skel.length < 2) continue;
          for (const t of targets) {
            const score = similarity(skel, t.skel);
            const romanLev = levenshtein(latinBase(roman), t.base);
            // 거리가 작으면(3 이하) 비율과 무관하게 받는다 — 짧은 이름은 비율이 쉽게 커진다("케인" ↔ kane 3/4)
            const near = romanLev <= SHORT_SKELETON_LEV_MAX || romanLev / Math.max(roman.length, t.base.length) <= ROMAN_MAX;
            if (score < SKELETON_MIN || !near || (skel.length <= 2 && romanLev > SHORT_SKELETON_LEV_MAX)) continue;
            const cand = { text, forms, score, n, romanLev, full: t.full };
            if (!best || ranksAbove(cand, best)) best = cand;
          }
        }
      }
    }
  }
  return best ? { text: best.text, forms: best.forms, score: best.score } : null;
}

/** 표기 비교용 — 띄어쓰기·하이픈 차이는 같은 표기로 본다("알렉산더-아놀드"·"알렉산더 아놀드") */
const shape = (ko) => ko.replace(/[\s-]+/gu, "");
/** `part`의 낱말들이 `whole`의 낱말 중 이어진 일부인가("코네" ⊂ "에마누엘 마누 코네") — 성만 쓴 요약은 갈림이 아니다 */
export function isContiguousPart(part, whole) {
  const target = shape(part);
  // 기준을 공백으로만, 공백·하이픈으로 — 두 번 자른다("알렉산더-아널드"는 "트렌트 알렉산더아널드"의 일부이고, "아놀드"는 "알렉산더-아놀드"의 일부다)
  for (const w of [whole.trim().split(/\s+/u), whole.trim().split(/[\s-]+/u)]) {
    for (let i = 0; i < w.length; i += 1) for (let j = i + 1; j <= w.length; j += 1) if (shape(w.slice(i, j).join("")) === target) return true;
  }
  return false;
}

/** 요약에 영문 이름(성 또는 전체, 3글자 이상 낱말)이 그대로 남았으면 그 영문 구절 */
export function latinNameIn(summary, english) {
  const fold = (x) => x.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase();
  const tokens = new Set(english.split(/[\s-]+/u).filter((t) => t.length >= 3).map(fold));
  if (!tokens.size) return null;
  // 라틴 문자 낱말이 공백으로 이어진 덩어리마다 — 그 안에 영문 이름의 낱말이 있으면 덩어리째(이름 전체)
  for (const run of summary.match(/\p{Script=Latin}[\p{Script=Latin}.'’-]*(?:\s+\p{Script=Latin}[\p{Script=Latin}.'’-]*)*/gu) ?? []) {
    if (run.split(/[\s-]+/u).some((w) => tokens.has(fold(w)))) return { text: run, forms: [run], score: 0 };
  }
  return null;
}

/**
 * 한 선수의 요약들에서 표기 갈림을 찾는다.
 * - 기준 표기(`reference` — 사람 사전 또는 캐시)가 있으면: 기준(또는 그 일부)과 다른 구절이 나온 요약이 갈림이다.
 * - 없으면: 서로의 일부가 아닌 표기가 둘 이상이면 갈림이다.
 * @param {{ id: number, summary: string }[]} summaries
 * @returns {{ variants: { ko: string, ids: number[], samples: { id: number, summary: string }[] }[] } | null}
 */
export function summaryDivergence(summaries, english, reference) {
  const found = new Map();
  for (const s of summaries) {
    // 한글 이름이 없고 영문 이름이 그대로 남은 요약("유망주 Dany Freire가")도 갈림이다 — 모델이 표기를 정하지 못했다
    const span = findNameSpan(s.summary, english) ?? latinNameIn(s.summary, english);
    if (!span) continue;
    // 조사를 걷은 어느 꼴이든 기준(또는 그 일부)과 같으면 갈림이 아니다
    if (reference && span.forms.some((f) => isContiguousPart(f, reference))) continue;
    const k = shape(span.text);
    const v = found.get(k) ?? { ko: span.text, ids: [], samples: [] };
    v.ids.push(s.id);
    if (v.samples.length < 2) v.samples.push(s);
    found.set(k, v);
  }
  const all = [...found.values()];
  let variants;
  if (reference) {
    variants = all.filter((v) => !isContiguousPart(v.ko, reference));
  } else {
    // 다른 표기의 일부(성만 쓴 것)는 접는다
    const heads = all.filter((v) => !all.some((o) => o !== v && shape(o.ko) !== shape(v.ko) && isContiguousPart(v.ko, o.ko)));
    variants = heads.length >= 2 ? all : [];
  }
  return variants.length ? { variants: variants.sort((a, b) => b.ids.length - a.ids.length) } : null;
}

/**
 * 사전 키 의심 — 범위 안에 한 번도 나오지 않는 사전 키 중, 편집 거리 1~2의 이름이 실제로 나오는 것.
 * @param {string[]} dictKeys
 * @param {Map<string, number>} observed  범위 안에 나온 선수 키 → 횟수
 * @returns {{ key: string, near: { key: string, distance: number, count: number }[] }[]}
 */
export function suspiciousDictKeys(dictKeys, observed) {
  const dict = new Set(dictKeys);
  const out = [];
  for (const key of dictKeys) {
    if (observed.has(key)) continue;
    const near = [];
    for (const [name, count] of observed) {
      if (dict.has(name) || Math.abs(name.length - key.length) > 2) continue;
      const distance = levenshtein(key, name);
      if (distance >= 1 && distance <= 2) near.push({ key: name, distance, count });
    }
    if (near.length) out.push({ key, near: near.sort((a, b) => a.distance - b.distance || b.count - a.count || a.key.localeCompare(b.key)) });
  }
  return out.sort((a, b) => a.near[0].distance - b.near[0].distance || a.key.localeCompare(b.key));
}

const titleCase = (key) => key.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

/**
 * 파생을 메모리에서 두 번 돌린다 — 운영과 같은 관문(`runDerivation`의 `derive`와 같은 옵션)과, 확인 관문만 끈 것.
 * 둘의 차이가 "사전에 넣으면 열리는 선수"다. `deriveDeals`는 순수 함수라 DB·API·위키데이터에 닿지 않는다.
 */
export function deriveBoth(rows, { nowMs, windows, names, existingKeys }) {
  const base = { nowMs, windows, names, requireVerdict: true, upgradeVerdicts: true, existingKeys };
  return { verified: deriveDeals(rows, { ...base, requireVerified: true }), open: deriveDeals(rows, { ...base, requireVerified: false }) };
}

/**
 * 정비 목록 전체.
 * @param {{
 *   rows: object[],            // 범위 안 transfer_news 행(파생 열 + attribution·attributed_to)
 *   cache: object[],           // transfer_name_ko 행 전부
 *   players: Record<string, { ko: string }>, glossaryClubs: Record<string, string>, cited: Record<string, object>,
 *   boardDeals: { id: number, deal_key: string, player: string, stage: string, latest_reported_at: string }[],
 *   derived: { verified: object, open: object },
 * }} src
 */
export function buildTodo({ rows, cache, players, glossaryClubs, cited, boardDeals, derived }) {
  const names = createNameBook({ players, clubs: glossaryClubs, cache });
  const cacheByKey = new Map(cache.filter((c) => c.kind === "player").map((c) => [c.key, c]));

  // 딜 키 → 선수 키 — 범위에 나온 모든 이름 후보로 역산한다(딜 키는 선수 키의 해시라 거꾸로 풀 수 없다)
  const observed = new Map();
  const see = (k) => k && observed.set(k, (observed.get(k) ?? 0) + 1);
  for (const r of rows) {
    for (const p of r.players ?? []) see(normalizePlayer(p));
    see(r.verdict_player);
    if (r.verdict_player_name) see(normalizePlayer(r.verdict_player_name));
  }
  const candidateKeys = new Set([...observed.keys(), ...cacheByKey.keys(), ...Object.keys(players), ...derived.open.nameNeeds.map((n) => n.playerKey)]);
  for (const d of boardDeals) candidateKeys.add(normalizePlayer(d.player));
  const keyOfDeal = new Map();
  for (const k of candidateKeys) keyOfDeal.set(dealKey(k), k);

  // 보드 딜 — 저장된 딜(화면 범위) + 이번 메모리 파생에만 있는 딜(다음 정기 실행에 오를 것)
  const board = new Map();
  for (const d of boardDeals) board.set(d.deal_key, { dealId: d.id, dealKey: d.deal_key, player: d.player, stage: d.stage, latest: d.latest_reported_at, key: keyOfDeal.get(d.deal_key) ?? null });
  for (const d of derived.verified.deals) {
    if (!board.has(d.deal_key)) board.set(d.deal_key, { dealId: null, dealKey: d.deal_key, player: d.player, stage: d.stage, latest: d.latest_reported_at, key: keyOfDeal.get(d.deal_key) ?? null });
  }
  const boardByKey = new Map();
  for (const b of board.values()) if (b.key) boardByKey.set(b.key, [...(boardByKey.get(b.key) ?? []), b]);
  const latestOf = (key) => (boardByKey.get(key) ?? []).reduce((m, b) => (b.latest > m ? b.latest : m), "");
  const byBoardThenRecent = (a, b) => Number(b.onBoard) - Number(a.onBoard) || latestOf(b.key).localeCompare(latestOf(a.key)) || a.key.localeCompare(b.key);

  // 1. 확정 대기 통용 표기
  const pendingLlm = cache
    .filter((c) => c.kind === "player" && c.source === "llm" && c.name_ko && !players[c.key])
    .map((c) => ({
      key: c.key,
      nameEn: c.name_en,
      llmKo: c.name_ko,
      wikidataId: c.wikidata_id ?? null,
      onBoard: boardByKey.has(c.key),
      dealIds: (boardByKey.get(c.key) ?? []).map((b) => b.dealId).filter((x) => x != null),
    }))
    .sort(byBoardThenRecent);

  // 2. 표기 없는 선수(보드 딜)
  const missingKo = [...board.values()]
    .filter((b) => !(b.key ? names.playerKo(b.key) : null))
    .map((b) => ({ key: b.key ?? normalizePlayer(b.player), player: b.player, dealId: b.dealId, stage: b.stage, latest: b.latest, inCache: Boolean(b.key && cacheByKey.has(b.key)) }))
    .sort((a, b) => b.latest.localeCompare(a.latest) || a.key.localeCompare(b.key));

  // 3. 확인되지 않아 막힌 선수 — 운영 관문을 지난 딜에 없고, 확인 관문만 걸린 이름(`nameNeeds`는 확인 관문 앞에서 쌓인다)
  const verifiedKeys = new Set(derived.verified.deals.map((d) => d.deal_key));
  const openDeals = new Map(derived.open.deals.map((d) => [d.deal_key, d]));
  const blocked = [];
  for (const n of derived.verified.nameNeeds) {
    const dk = dealKey(n.playerKey);
    if (names.isVerifiedPlayer(n.playerKey) || verifiedKeys.has(dk)) continue;
    const mine = rows.filter((r) => r.verdict_player === n.playerKey);
    const moves = mine.filter((r) => r.verdict === "move");
    const open = openDeals.get(dk);
    blocked.push({
      key: n.playerKey,
      player: n.player,
      opensIfAdded: Boolean(open),
      stage: open?.stage ?? null,
      reports: open?.report_count ?? null,
      moveVerdicts: moves.length,
      moveSources: new Set(moves.map((r) => r.source_id)).size,
      singleToken: !n.playerKey.includes(" "),
      llmKo: cacheByKey.get(n.playerKey)?.source === "llm" ? cacheByKey.get(n.playerKey).name_ko : null,
    });
  }
  blocked.sort((a, b) => Number(b.opensIfAdded) - Number(a.opensIfAdded) || b.moveVerdicts - a.moveVerdicts || a.key.localeCompare(b.key));

  // 4. 요약 속 표기 갈림
  const summariesByKey = new Map();
  for (const r of rows) {
    if (!r.verdict_player || !r.summary_ko) continue;
    summariesByKey.set(r.verdict_player, [...(summariesByKey.get(r.verdict_player) ?? []), { id: r.id, summary: r.summary_ko, nameEn: r.verdict_player_name }]);
  }
  const summarySplits = [];
  for (const [key, list] of summariesByKey) {
    const english = cacheByKey.get(key)?.name_en ?? list.find((s) => s.nameEn)?.nameEn ?? titleCase(key);
    const reference = names.playerKo(key);
    const div = summaryDivergence(list.map(({ id, summary }) => ({ id, summary })), english, reference);
    if (!div) continue;
    summarySplits.push({ key, english, reference, referenceFrom: players[key]?.ko ? "사전" : reference ? "캐시" : null, onBoard: boardByKey.has(key), variants: div.variants });
  }
  summarySplits.sort((a, b) => Number(b.onBoard) - Number(a.onBoard) || b.variants.reduce((n, v) => n + v.ids.length, 0) - a.variants.reduce((n, v) => n + v.ids.length, 0) || a.key.localeCompare(b.key));

  // 5. 사전 키 의심 — 범위 안 이름 + 캐시 키 + 보드 딜 키
  const universe = new Map(observed);
  for (const k of cacheByKey.keys()) universe.set(k, universe.get(k) ?? 0);
  for (const b of board.values()) if (b.key) universe.set(b.key, universe.get(b.key) ?? 0);
  const dictSuspects = suspiciousDictKeys(Object.keys(players), universe);

  // 6-a. 영문으로 그려지는 구단 — 판정이 읽은 구단(이동 판정) + 보드 딜의 구단 중 한국어가 없는 것
  const boardClubs = new Set(derived.verified.clubs.map((c) => c.canonical));
  const clubs = new Map();
  const addClub = (raw, rowId) => {
    const canonical = canonicalClubName(raw);
    if (clubDisplay(canonical).league || names.club(canonical)) return;
    const c = clubs.get(canonical) ?? { canonical, count: 0, rowIds: [], onBoard: boardClubs.has(canonical) };
    c.count += 1;
    if (rowId != null && c.rowIds.length < 3) c.rowIds.push(rowId);
    clubs.set(canonical, c);
  };
  for (const r of rows) {
    if (r.verdict !== "move") continue;
    for (const c of [r.verdict_from, r.verdict_to, ...(r.verdict_suitors ?? [])]) if (c) addClub(c, r.id);
  }
  for (const c of derived.verified.clubs) if (!HANGUL.test(c.name)) addClub(c.canonical, null);
  const englishClubs = [...clubs.values()].sort((a, b) => Number(b.onBoard) - Number(a.onBoard) || b.count - a.count || a.canonical.localeCompare(b.canonical));

  // 6-b. `cited`에 없는 인용 매체
  const outlets = new Map();
  for (const r of rows) {
    if (r.attribution !== "cited" || !r.attributed_to || isCitedKnown(r.attributed_to, cited)) continue;
    const key = citedKey(r.attributed_to.split(/\s+via\s+/iu)[0]);
    const o = outlets.get(key) ?? { key, forms: [], count: 0 };
    o.count += 1;
    if (!o.forms.includes(r.attributed_to) && o.forms.length < 3) o.forms.push(r.attributed_to);
    outlets.set(key, o);
  }
  const unknownOutlets = [...outlets.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return { pendingLlm, missingKo, blocked, summarySplits, dictSuspects, englishClubs, unknownOutlets };
}

// ── 마크다운 ───────────────────────────────────────────────────────────────

const cell = (s) => String(s ?? "—").replace(/\|/gu, "\\|").replace(/\n/gu, " ");
const ids = (list) => (list.length ? list.join(", ") : "—");
function table(head, rowsOut) {
  if (!rowsOut.length) return "_없음_\n";
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rowsOut.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n") + "\n";
}

export function renderMarkdown(todo, meta = {}) {
  const out = [];
  out.push(`# 이름 표기 정비 목록${meta.target ? ` — ${meta.target}` : ""}`);
  if (meta.nowIso) out.push(`\n기준 시각 ${meta.nowIso} · 보드 범위 ${meta.boardStartIso} 이후 딜 · 보도 ${meta.rowStartIso} 이후 ${meta.rowCount}건`);
  out.push("\n사전을 고친 뒤 `pnpm test:transfer`로 형식을 확인한다. 다음 정기 실행이 캐시·요약을 사전 표기로 맞춘다(`syncDictionaryNames`).");

  out.push(`\n## 1. 확정 대기 통용 표기 (${todo.pendingLlm.length})`);
  out.push("할 일: 맞으면 `players-ko.json`에 옮겨 확정, 틀리면 고친 표기로 적는다 — `\"cody gakpo\": { \"ko\": \"코디 각포\" }`(포지션·생년·국적은 아는 것만).\n");
  out.push(table(["키", "영문", "LLM 표기", "위키데이터", "보드", "딜 id"], todo.pendingLlm.map((p) => [p.key, p.nameEn, p.llmKo, p.wikidataId ? `${p.wikidataId} (https://www.wikidata.org/wiki/${p.wikidataId})` : "—", p.onBoard ? "●" : "", ids(p.dealIds)])));

  out.push(`## 2. 표기 없는 선수 (${todo.missingKo.length})`);
  out.push("할 일: `players-ko.json`에 표기를 적는다(키는 아래 \"키\" 열 그대로) — `\"<키>\": { \"ko\": \"<팬들이 쓰는 표기>\" }`. 화면은 지금 영문명으로 그린다.\n");
  out.push(table(["키", "선수", "딜 id", "단계", "최신 보도"], todo.missingKo.map((m) => [m.key, m.player, m.dealId ?? "(다음 실행)", m.stage, m.latest?.slice(0, 10)])));

  out.push(`## 3. 확인되지 않아 막힌 선수 (${todo.blocked.length})`);
  out.push("할 일: 실존 선수가 맞으면 `players-ko.json`에 넣는다(넣는 순간 확인된 선수가 되어 다음 실행에 열린다). 감독·오추출이면 그대로 둔다. \"넣으면 열림\"이 ●인 것부터 — 나머지는 판정 대기 등 다른 관문도 남아 있다. 한 토큰 이름은 사람 사전만 연다.\n");
  out.push(table(["키", "선수", "넣으면 열림", "단계", "보도", "이동 판정(출처)", "LLM 표기"], todo.blocked.map((b) => [b.key, b.player + (b.singleToken ? " (한 토큰)" : ""), b.opensIfAdded ? "●" : "", b.stage, b.reports, `${b.moveVerdicts} (${b.moveSources})`, b.llmKo])));

  out.push(`## 4. 요약 속 표기 갈림 (${todo.summarySplits.length})`);
  out.push("할 일: 맞는 표기를 `players-ko.json`에 적는다 — 다음 정기 실행이 캐시와 이미 쓴 요약을 그 표기로 바꾼다(`syncDictionaryNames`). 사전에 이미 있는데 갈렸으면 `glossary-ko.json`의 `corrections`에 `\"<틀린 표기>\": \"<사전 표기>\"`를 더하고 `--derive-only --replay`. ⚠ 이름 찾기는 추정이다 — 구단·일반어가 섞였으면 무시한다.\n");
  for (const s of todo.summarySplits) {
    out.push(`- **${s.key}** (${s.english}) — 기준 ${s.reference ? `\`${s.reference}\`(${s.referenceFrom})` : "없음"}${s.onBoard ? " · 보드" : ""}`);
    for (const v of s.variants) {
      out.push(`  - \`${v.ko}\` × ${v.ids.length} (요약 id ${v.ids.join(", ")})`);
      for (const smp of v.samples) out.push(`    - #${smp.id}: ${smp.summary}`);
    }
  }
  if (!todo.summarySplits.length) out.push("_없음_");

  out.push(`\n## 5. 사전 키 의심 (${todo.dictSuspects.length})`);
  out.push("할 일: 범위 안의 철자가 맞으면 `players-ko.json`의 키를 그 철자로 바꾼다(키는 `normalizePlayer` 결과다). 둘 다 쓰이는 철자면 키를 하나 더 둔다.\n");
  out.push(table(["사전 키", "범위에 나온 비슷한 이름(거리 · 횟수)"], todo.dictSuspects.map((d) => [d.key, d.near.map((n) => `${n.key} (${n.distance} · ${n.count})`).join(", ")])));

  out.push(`## 6. 영문으로 그려지는 구단·매체`);
  out.push(`\n### 6-a. 구단 (${todo.englishClubs.length})`);
  out.push("할 일: `glossary-ko.json`의 `clubs`에 적는다 — `\"Sturm Graz\": \"SK 슈투름 그라츠\"`(키는 아래 정규명 그대로). 5대 리그 구단이면 표시 프리셋(`club-presets.json`) 쪽이다.\n");
  out.push(table(["정규명", "보드", "판정 횟수", "보도 id(예)"], todo.englishClubs.map((c) => [c.canonical, c.onBoard ? "●" : "", c.count, ids(c.rowIds)])));
  out.push(`### 6-b. 인용 매체 (${todo.unknownOutlets.length})`);
  out.push("할 일: `reporters.json`의 `cited`에 적는다 — `\"<키>\": { \"ko\": \"<한국어 표기>\", \"credibility\": <1~5> }`(키는 아래 열 그대로 — 소문자·앞의 the·기호를 걷은 형태).\n");
  out.push(table(["키", "원문 표기", "보도 수"], todo.unknownOutlets.map((o) => [o.key, o.forms.join(" / "), o.count])));
  return out.join("\n");
}

// ── DB 읽기 ────────────────────────────────────────────────────────────────

/**
 * 파생이 읽는 열(`derive-deals.mjs`의 `loadRows`) + 인용 귀속. ⚠ `loadRows`의 필터는 걸지 않는다 — 걸러진 행은 파생의 판정에
 * 영향이 없고(`isCandidate`가 다시 거른다), 목록 4~6은 후보가 아닌 행(인용 항목·사전 키 대조)까지 봐야 한다.
 * ⚠ `loadRows`의 select 열이 늘면 여기도 더한다 — 빠지면 메모리 파생이 운영과 다른 답을 낸다.
 */
const NEWS_COLUMNS =
  "id, source_id, external_id, url, stage, players, clubs, body, published_at, relevance, deal_id, verdict, verdict_player, verdict_player_name, verdict_evidence, verdict_at, verdict_from, verdict_to, verdict_suitors, verdict_stage, verdict_fee_amount, verdict_fee_currency, verdict_fee_kind, verdict_raw, verdict_model, verdict_prompt, verdict_input, verdict_article_chars, verdict_attempts, summary_ko, attribution, attributed_to";

async function main(argv) {
  const { supabase } = connectFromEnv(argv);

  const nowMs = Date.now();
  const windows = loadWindows();
  const rowStartMs = derivationStartMs(nowMs, windows);
  const boardStartMs = boardScopeStartMs(nowMs, windows);
  const rowStartIso = new Date(rowStartMs).toISOString();
  const boardStartIso = new Date(boardStartMs).toISOString();

  const [rows, cache, storedDeals] = await Promise.all([
    readAll(supabase, "transfer_news", NEWS_COLUMNS, "id", (q) => q.gte("published_at", rowStartIso)),
    loadNameCache(supabase),
    readAll(supabase, "transfer_deal", "id, deal_key, player, stage, settled_at, latest_reported_at", "id"),
  ]);
  const players = loadPlayerDictionary();
  const glossaryClubs = loadGlossary().clubs;
  const cited = JSON.parse(readFileSync(new URL("./lib/transfer/reporters.json", import.meta.url), "utf8")).cited ?? {};

  const names = createNameBook({ players, clubs: glossaryClubs, cache });
  // 운영 파생과 같게 저장된 딜 전부를 넘긴다(판정이 덜 찬 딜을 남기는 판단이 이 값을 본다)
  const existingKeys = new Map(storedDeals.map((d) => [d.deal_key, { stage: d.stage, settled_at: d.settled_at }]));
  const derived = deriveBoth(rows, { nowMs, windows, names, existingKeys });
  const boardDeals = storedDeals.filter((d) => Date.parse(d.latest_reported_at) >= boardStartMs);

  const todo = buildTodo({ rows, cache, players, glossaryClubs, cited, boardDeals, derived });
  const meta = { target: argv.includes("--remote") ? "원격" : "로컬", nowIso: new Date(nowMs).toISOString(), boardStartIso, rowStartIso, rowCount: rows.length };
  console.log(renderMarkdown(todo, meta));

  const jsonPath = flag(argv, "json");
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify({ meta, ...todo }, null, 2) + "\n");
    console.error(`JSON → ${jsonPath}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));

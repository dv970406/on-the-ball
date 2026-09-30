/**
 * 딜 파생 — `transfer_news`(보도 행)에서 선수 단위 이적 건(`transfer_deal`)을 만든다.
 *
 * 보드는 어드민 큐레이션이 없다 — 이 파생이 유일한 원천이다. 그래서 **틀린 칸보다 빈 칸**이 규칙이다:
 * 이적료·계약·주급은 그 선수가 나오는 문장에서만 읽고, 못 읽으면 null로 둔다.
 *
 * 딜이 보드에 오르는 관문(순서대로):
 *   1. 후보 — 단계가 있고 선수가 잡힌 보도(가십 모음 제외 · 범위 안 · 관련성 ≥ MIN_RELEVANCE). 같은 보도는 한 행만 본다.
 *   2. 재계약 — 옮긴다는 표현 없이 재계약·첫 프로 계약만 말하면 딜이 아니다.
 *   3. 5대 리그 — 보도가 언급한 구단 중 5대 리그 구단이 하나도 없으면 딜이 아니고 **LLM도 부르지 않는다**.
 *   4. 확인된 선수 — 사람 사전·위키데이터에서 확인된 선수만(`names.isVerifiedPlayer`).
 *   5. LLM 판정 — "이동 아님" 보도는 빠지고, 새 딜은 "이동" 판정이 있어야 연다(`judge.mjs`).
 *   6. 방향 — 출발·행선지 중 하나는 있어야 하고 그중 하나는 5대 리그 구단이어야 한다. LLM이 읽은 구단이 규칙 표보다 크다.
 *
 * 두 층으로 나뉜다.
 *   - `deriveDeals(rows, opts)` — **순수 함수**. 행 배열 → 딜·구단·행 배정. 회귀 테스트(`test-transfer-derive.mjs`)가
 *     DB 없이 이것만 돌린다.
 *   - `runDerivation(supabase, opts)` — 조회 → 파생 → 이름 조회 → LLM 판정 → 쓰기. `sync-transfer-news.mjs`의 마지막 단계다.
 *
 * ⚠ **멱등하다.** 딜 키가 선수명 해시라 다시 돌려도 같은 딜에 upsert되고(`id` 보존 — 관심 FK가 id를 본다),
 *   보도 행의 `deal_id`는 매번 다시 배정된다.
 * ⚠ **삭제하지 않는다** — 범위 밖으로 나간 딜은 화면의 범위 필터가 가린다. 지우는 것은 **어떤 보도 행도
 *   더는 가리키지 않는 딜**뿐이다.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { clampCp, slugify, upsertRows } from "../sync-db.mjs";
import { clubCode, clubDisplay } from "./club-display.mjs";
import { contractText, parseContract } from "./contract.mjs";
import { DEST, FORMER, FROM, LEFT_FREE, SUITOR_FROM, addVotes, collectVotes, topVote } from "./direction.mjs";
import { extractTransfer } from "./extract.mjs";
import { JUDGE_RETRY_MS, SUMMARY_RETRY_WINDOW_MS } from "./judge.mjs";
import { createNameBook, loadGlossary, loadNameBook, loadPlayerDictionary, lookupAndCache, lookupCurrentClubs, missingNames } from "./names-ko.mjs";
import { RANK, RENEWAL, cleanBody, isDead, isRoundup, isRoundupItem, mentionRe, sentencesOf } from "./story.mjs";
import { normalizePlayer } from "./player-key.mjs";

/** 이적 관련성 하한 — 그 아래는 경기 리뷰·부상 소식이 단계 규칙에 스친 것이다 */
export const MIN_RELEVANCE = 0.3;
/** 보드 범위 시작보다 이만큼 앞선 보도까지 본다 — 창 직전의 "합의" 보도가 창 안의 오피셜과 한 이야기다 */
export const SCOPE_SLACK_MS = 14 * 86_400_000;

function readJson(rel) {
  const url = new URL(rel, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch (e) {
    throw new Error(`${url.pathname}를 읽지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
  }
}
/**
 * 창 일정 — 리그별 일정을 **합친 기간**으로 돌려준다(개장 = 가장 먼저 여는 리그, 마감 = 가장 늦게 닫는 리그).
 * ⚠ 화면(`src/shared/config/transfer-window.ts`의 `span`)과 같은 규칙이다 — 같은 JSON을 읽는다.
 */
export function windowSpan(w) {
  const all = Object.values(w.leagues);
  const opensAt = all.reduce((a, b) => (Date.parse(b.opensAt) < Date.parse(a.opensAt) ? b : a)).opensAt;
  const closesAt = all.reduce((a, b) => (Date.parse(b.closesAt) > Date.parse(a.closesAt) ? b : a)).closesAt;
  return { key: w.key, label: w.label, opensAt, closesAt };
}
export const loadWindows = () => readJson("./windows.json").windows.map(windowSpan);

/**
 * 보드 범위의 시작 — `opensAt <= now`인 마지막 창의 개장 시각. 아직 아무 창도 열리지 않았으면 첫 창.
 * ⚠ 화면(`shared/config/transfer-window.ts`의 `boardScopeStartMs`)과 같은 판정이어야 한다 — 같은 JSON을 읽는다.
 */
export function boardScopeStartMs(nowMs, windows) {
  const sorted = [...windows].sort((a, b) => Date.parse(a.opensAt) - Date.parse(b.opensAt));
  const opened = sorted.filter((w) => Date.parse(w.opensAt) <= nowMs);
  return Date.parse((opened.at(-1) ?? sorted[0]).opensAt);
}
export const derivationStartMs = (nowMs, windows) => boardScopeStartMs(nowMs, windows) - SCOPE_SLACK_MS;

// 선수 키의 정규형 — `player-key.mjs`가 단독으로 갖는다(judge와 공유). 여기서 다시 내보내 호출부의 경로를 유지한다
export { normalizePlayer };
/** ⚠ 16자리 소문자 hex — `transfer_deal.deal_key`의 CHECK와 한 쌍이다. 영구 계약(관심이 이 딜의 id를 본다) */
export const dealKey = (normalized) => createHash("sha1").update(normalized).digest("hex").slice(0, 16);

const ts = (r) => Date.parse(r.published_at);
const tokens = (normalized) => normalized.split(" ");

/** 보도 대조용 URL — 쿼리·조각·`www.`·끝 슬래시를 걷는다(같은 기사의 추적 파라미터·개정 번호 차이를 접는다) */
function urlKey(u) {
  if (!u) return null;
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./u, "")}${x.pathname.replace(/\/+$/u, "")}`.toLowerCase();
  } catch {
    return null;
  }
}
/** 보도 대조용 본문 — 리트윗 머리("RT @x:")·링크·기호를 걷은 앞 180자. 40자 미만이면 쓰지 않는다(짧은 문구끼리 우연히 같다) */
function textKey(body) {
  const t = String(body ?? "")
    .replace(/^\s*RT\s+@\w+:\s*/u, "")
    .replace(/https?:\/\/\S+/gu, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 180);
  return t.length >= 40 ? t : null;
}

/**
 * 같은 보도를 한 행으로 모은다 — URL이 같거나(쿼리·조각 제외) 본문이 같으면 같은 보도다.
 * ⚠ 같은 기사가 여러 행으로 저장돼 있다: BBC가 고칠 때마다 올리는 guid 개정 번호(`#0`·`#1`)로 같은 URL이 최대 6행,
 *   BBC 가십 칼럼이 두 피드(bbc-gossip·bbc-football)에 함께 실리고, 리트윗이 원문과 같은 글로 들어온다(운영: 2,297행 중
 *   550행이 같은 URL). 그대로 두면 딜의 보도 수가 부풀고 판정·요약을 같은 글에 여러 번 부른다.
 * ⚠ **행을 지우지 않는다** — 파생에서만 대표 하나를 쓴다(지우는 것은 되돌릴 수 없다). 대표는 가장 이른 게시 시각,
 *   같으면 나중에 수집된 행(= 최신 개정판)이다.
 * ⚠ **가십 칼럼의 항목 행은 URL로 합치지 않는다** — 한 칼럼의 항목이 전부 칼럼 URL을 물려받는다(`roundup.mjs`).
 *   두 피드에 실린 같은 칼럼의 항목은 본문이 같아 본문 키로 합쳐진다.
 * @returns {{ reps: object[], duplicates: number }}
 */
export function dedupeRows(rows) {
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const owner = new Map();
  for (const r of rows) {
    for (const k of [!isRoundupItem(r) && urlKey(r.url) && `u:${urlKey(r.url)}`, textKey(r.body) && `t:${textKey(r.body)}`]) {
      if (!k) continue;
      if (owner.has(k)) parent.set(find(r.id), find(owner.get(k)));
      else owner.set(k, r.id);
    }
  }
  const groups = new Map();
  for (const r of rows) {
    const g = find(r.id);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const reps = [...groups.values()].map((g) => g.sort((a, b) => ts(a) - ts(b) || b.id - a.id)[0]);
  return { reps, duplicates: rows.length - reps.length };
}

/** 그 선수에 대한 LLM 판정 — 다른 선수로 판정했으면(추출이 바뀌어 딜이 옮겨 감) 판정이 없는 것이다 */
const verdictOf = (r, key) => (r.verdict_player === key ? (r.verdict ?? null) : null);
/**
 * 지금 LLM에 물어야 하는가 — 그 선수로 판정한 적이 없거나, 판정 불가·요약 실패로 끝난 지 `JUDGE_RETRY_MS`가 지났다.
 * 요약 실패는 최근 `SUMMARY_RETRY_WINDOW_MS` 안의 보도만 다시 묻는다(오래된 보도는 영문 발췌로 둔다).
 */
function needsJudge(r, key, nowMs, rejudge) {
  if (rejudge || r.verdict_player !== key) return true;
  const stale = !r.verdict_at || nowMs - Date.parse(r.verdict_at) >= JUDGE_RETRY_MS;
  if (r.verdict == null) return stale;
  return r.verdict === "move" && r.summary_ko == null && stale && nowMs - ts(r) <= SUMMARY_RETRY_WINDOW_MS;
}
/** 규칙이 선수를 못 뽑은 보도를 지금 LLM에 물어야 하는가 — 아직 묻지 않았거나, 판정 불가로 끝난 지 `JUDGE_RETRY_MS`가 지났다 */
const needsJudgeUnnamed = (r, nowMs, rejudge) =>
  rejudge || !r.verdict_at || (r.verdict == null && nowMs - Date.parse(r.verdict_at) >= JUDGE_RETRY_MS);
/** 그 행의 선수들 — 규칙이 뽑은 이름, 없으면 LLM이 "이동"으로 판정하며 읽은 이름 */
const playersOf = (r) => (r.players?.length ? r.players : r.verdict === "move" && r.verdict_player_name ? [r.verdict_player_name] : []);
/** 5대 리그 구단인가 — 프리셋(엠블럼·한국어)이 있는 구단 */
const isTopLeague = (canonical) => Boolean(canonical && clubDisplay(canonical).league);

/** 옮긴다는 표현 — 재계약 기사와 이적 기사를 가른다(재계약 표현만 있고 이것이 없으면 딜이 아니다) */
const MOVE_WORDS = /\b(?:join(?:s|ed|ing)?|move(?:s|d)?\s+to|transfer(?:s|red)?\s+(?:to|from)|switch(?:es|ed)?\s+to|sign(?:s|ed|ing)?\s+for|leav(?:e|es|ing)|left(?!-)|depart(?:s|ed|ure)?|arriv(?:e|es|ed|al)|loan(?:ed)?\s+(?:to|from))\b/iu;
/** "from Man City" — 대문자로 시작하는 출발 구단. "interest from X"(데려가려는 구단)는 옮긴다는 표현이 아니다 */
const FROM_CLUB = new RegExp(String.raw`${SUITOR_FROM}\bfrom\s+\p{Lu}`, "u");
// ⚠ 영입 관심 표현("on X's radar"·"interest from X")은 옮긴다는 표현으로 치지 않는다 — 재계약 협상 기사에 으레 붙는 배경이라,
//   치면 재계약이 딜이 된다(회귀 테스트). 대가로 "X is on Arsenal's radar but Liverpool want to extend his contract" 같은
//   이적설이 재계약으로 접힌다(감사에서 1건) — 재계약 오탐이 더 잦아 이쪽을 택했다.
const MOVE = { test: (s) => MOVE_WORDS.test(s) || FROM_CLUB.test(s) };

/**
 * 후보 행 — 이적 단계가 있는 보도. 가십 모음은 뺀다(한 선수의 이야기로 읽으면 남의 구단·금액이 섞인다).
 * 선수가 없어도 후보다 — 규칙이 못 뽑은 선수는 LLM이 읽는다(`judgeNeeds`의 `playerKey: null`).
 */
function isCandidate(r, startMs) {
  return r.stage !== "unknown" && Number(r.relevance) >= MIN_RELEVANCE && !isRoundup(r) && ts(r) >= startMs;
}

/**
 * 행을 선수별로 묶는다. 키는 첫 선수(`playersOf`)의 정규형.
 * ⚠ 한 토큰 이름("Isak")은 같은 범위의 두 토큰 이름("Alexander Isak")의 **마지막 토큰**과 같으면 그 딜로 합친다.
 *   사람 사전에 있는 한 토큰 이름("Estevao")은 **첫 토큰**이 같은 두 토큰 이름("Estevao Willian")과도 합친다 —
 *   브라질식 한 이름 선수는 매체마다 성을 붙였다 뗐다 한다. 두 토큰 이름끼리는 합치지 않는다(동성이인).
 *   같은 토큰을 가진 두 토큰 이름이 여럿이면 어느 쪽인지 알 수 없어 합치지 않는다.
 */
function groupByPlayer(rows, names) {
  const groups = new Map();
  for (const r of rows) {
    const k = normalizePlayer(playersOf(r)[0]);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const multi = [...groups.keys()].filter((k) => tokens(k).length >= 2);
  // 두 묶음이 말하는 구단이 하나도 겹치지 않으면 다른 사람이다 — 도르트문트의 유망주 "Inacio"가 스포르팅의 "Goncalo Inacio" 딜에
  // 합쳐져 "곤살루 이나시우 도르트문트 → 유벤투스"가 됐다(운영). 어느 쪽이든 구단을 하나도 못 읽었으면 판단할 수 없어 합친다.
  const clubsOf = (rs) => new Set(rs.flatMap((r) => [...(r.clubs ?? []), r.verdict_from, r.verdict_to, ...(r.verdict_suitors ?? [])].filter(Boolean)));
  const sharesClub = (a, b) => { const x = clubsOf(a), y = clubsOf(b); return !x.size || !y.size || [...x].some((c) => y.has(c)); };
  for (const k of [...groups.keys()]) {
    if (tokens(k).length !== 1) continue;
    const known = Boolean(names.playerInfo(k));
    const owners = multi.filter((m) => (tokens(m).at(-1) === k || (known && tokens(m)[0] === k)) && sharesClub(groups.get(k), groups.get(m)));
    if (owners.length !== 1) continue;
    groups.get(owners[0]).push(...groups.get(k));
    groups.delete(k);
  }
  for (const list of groups.values()) list.sort((a, b) => ts(a) - ts(b) || a.id - b.id);
  return groups;
}

/** 표시할 영문명 — 가장 자주 쓰인 표기, 동률이면 긴 쪽(성만 쓴 행보다 풀네임) */
function displayName(rows, key) {
  const count = new Map();
  for (const r of rows) {
    for (const p of playersOf(r)) {
      const n = normalizePlayer(p);
      if (n === key || (tokens(n).length === 1 && tokens(key).at(-1) === n)) count.set(p, (count.get(p) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || tokens(normalizePlayer(b[0])).length - tokens(normalizePlayer(a[0])).length || b[0].length - a[0].length)[0][0];
}

/**
 * 그 선수에게 해당하는 단계.
 *
 * **그 선수에 대한 LLM 판정이 있으면 그 판정의 단계다.** 판정자는 기사 전문을 읽고(매체 RSS는 본문을 받아 보낸다),
 * 규칙은 저장된 발췌(제목 + 두 줄)의 낱말을 읽는다 — 재계약 합의("agreement 'close'")를 합의 단계로, 영입 문의를 제안으로,
 * 무산된 이적의 회고를 루머로 읽은 규칙 단계가 화면에 그대로 갔다(운영: 보드 딜 51개 중 17개). 특히 규칙이 선수를 못 뽑아
 * 선수가 판정에서만 온 행은 규칙의 행 단계가 "그 선수의 단계"인 적이 없다.
 *
 * 판정이 아직 없는 행(판정 대기·판정 불가)만 규칙이 정한다 — 추출기가 그 선수만 잡은 행이 아니면 선수가 나오는 문장만으로
 * 다시 판정한다(곁들여 나온 선수가 기사 주인공의 단계를 받는 것을 막는다). 판정이 오면 다음 파생이 그 단계로 바꾼다.
 */
function stageFor(r, key, mentions, memo) {
  const llm = verdictOf(r, key) === "move" ? r.verdict_stage : null;
  if (llm && llm !== "unknown") return llm;
  if (playersOf(r).every((p) => mentions.test(p))) return r.stage;
  let best = "unknown";
  let dead = null;
  for (const s of memo.sentences(r).filter((x) => mentions.test(x))) {
    const st = memo.extract(s).stage;
    if (st === "collapsed") return "collapsed";
    if (st === "denied") dead = "denied";
    if (RANK.indexOf(st) > RANK.indexOf(best)) best = st;
  }
  return dead ?? best;
}

/** 그 행에서 그 선수의 이적료 — 행의 `fee_*`가 아니라 **선수가 나오는 문장**에서 다시 읽는다(다선수 기사에서 남의 금액이 섞인다) */
function feeOf(storySentences, memo) {
  for (const s of [...storySentences].reverse()) {
    const ex = memo.extract(s);
    if (ex.feeText && ex.feeAmount >= 0.005) return { amount: ex.feeAmount, currency: ex.feeCurrency, text: ex.feeText };
  }
  return null;
}
function firstOf(storySentences, pick, memo) {
  for (const s of [...storySentences].reverse()) {
    const v = pick(memo.extract(s));
    if (v != null) return v;
  }
  return null;
}

/**
 * 한 파생 안의 추출 메모 — 같은 문장을 단계·이적료·옵션·주급 판정이 **따로따로 다시 추출하던** 것을 한 번으로 줄인다
 * (합성 데이터 프로파일에서 파생 시간의 대부분이 같은 문장의 반복 추출이었다).
 * ⚠ `extractTransfer`·`cleanBody`·`sentencesOf`가 **순수 함수**라 성립한다 — 결과는 메모가 없을 때와 같다.
 *   돌려받은 객체·배열을 **고치지 않는다**(여러 판정이 같은 값을 나눠 쓴다).
 * 행 메모는 `WeakMap`이라 행 배열이 사라지면 함께 사라진다. `runDerivation`은 이름을 새로 찾아 다시 파생할 때
 * 같은 메모를 넘긴다(이름은 추출 결과에 영향을 주지 않는다).
 */
export function createExtractMemo() {
  const byText = new Map();
  const byRow = new WeakMap();
  return {
    extract(text) {
      if (!byText.has(text)) byText.set(text, extractTransfer(text));
      return byText.get(text);
    },
    sentences(row) {
      if (!byRow.has(row)) byRow.set(row, sentencesOf(cleanBody(row)));
      return byRow.get(row);
    },
  };
}

/**
 * 자유계약을 **확인하는** 표현 — 이적료가 비었다는 것만으로는 자유계약이 아니다(대개 금액 미보도).
 * 그 선수가 나오는 문장에서만 본다(`it.sentences`) — 한 기사에 다른 선수의 자유계약이 섞인다.
 */
const FREE_AGENT_RE = /\b(?:free agent|free transfer|on a free)\b/i;
/** LLM이 읽은 출발·행선지의 표 — 규칙의 확실한 문형(2표)보다 크다. 원문 대조를 거친 값이라 규칙보다 믿을 만하다 */
const JUDGE_VOTE = 4;

/**
 * 방향 — 딜의 모든 행을 시간순으로 투표에 태운다(최신 행 2배). 규칙 표는 선수가 나오는 문장만 보고,
 * 그 선수에 대한 LLM 판정(`verdict_from`·`verdict_to`)이 있으면 그 표를 더한다.
 */
function resolveDirection(items, player, key) {
  const free = new Map(), from = new Map(), dest = new Map(), former = new Map();
  // 행선지의 **확실한** 표(강한 규칙 문형 · LLM 판정) — 판정이 있는 딜에서는 약한 문형만으로 행선지를 정하지 않는다
  const firmDest = new Map();
  let judgedAny = false;
  const last = items.at(-1);
  let anyFreeAgent = false;
  for (const it of items) {
    const w = it === last ? 2 : 1;
    addVotes(free, collectVotes(it.sentences, LEFT_FREE, player, w));
    addVotes(from, collectVotes(it.sentences, FROM, player, w));
    addVotes(dest, collectVotes(it.sentences, DEST, player, w));
    addVotes(firmDest, collectVotes(it.sentences, DEST.filter((p) => p.strong), player, w));
    // 전 소속("former West Ham striker")은 이름 없이 쓰이는 일이 많아 단독 선수 기사 전체에서 읽는다
    addVotes(former, collectVotes(it.storySentences, FORMER, player, w));
    if (it.sentences.some((s) => FREE_AGENT_RE.test(s))) anyFreeAgent = true;
    if (verdictOf(it.row, key) === "move") {
      judgedAny = true;
      if (it.row.verdict_from) addVotes(from, new Map([[it.row.verdict_from, JUDGE_VOTE * w]]));
      if (it.row.verdict_to) {
        addVotes(dest, new Map([[it.row.verdict_to, JUDGE_VOTE * w]]));
        addVotes(firmDest, new Map([[it.row.verdict_to, JUDGE_VOTE * w]]));
      }
    }
  }
  const freeClub = topVote(free);
  const fromClub = freeClub ?? topVote(from);
  const destClub = topVote(dest);
  const isFree = Boolean(freeClub) || anyFreeAgent;
  let origin = fromClub;
  let destination = destClub;
  // 같은 구단이 양쪽에 오면 **표가 많은 쪽만** 믿는다 — 동률이면 둘 다 버린다. 둘 다 버렸더니 LLM이 읽은 출발 구단(8표)이
  // 규칙의 약한 행선지 문형("at Bayern" 1표) 하나에 지워져 케인의 출발이 "미확인"이 됐다(운영).
  if (fromClub && fromClub === destClub) {
    const fromVotes = (free.get(fromClub) ?? 0) + (from.get(fromClub) ?? 0);
    const destVotes = dest.get(destClub) ?? 0;
    if (fromVotes > destVotes) destination = null;
    else if (destVotes > fromVotes) origin = null;
    else origin = destination = null;
  }
  // 판정(LLM)이 있는 딜에서 행선지가 규칙의 **약한 문형**("on loan at Juventus"·"to Bayern" 배경 언급)에서만 왔으면 믿지 않는다 —
  // 판정자가 "행선지 없음"이라 한 보도에 그 한 표가 얹혀 임대 구단·배경 구단이 행선지가 됐다(감사: 볼테마데 → 유벤투스 등 3건).
  if (judgedAny && destination && !firmDest.has(destination)) destination = null;
  // 소속을 못 읽었으면 전 소속이 출발 구단이다 — 자유 계약("former Real Madrid defender")도 그 구단을 떠나온 것이다
  const formerClub = origin ? null : topVote(former);
  return { from: origin ?? (formerClub && formerClub !== destination ? formerClub : null), to: destination, isFree };
}

/**
 * 대표 단계 — 진전 최대. 단 죽은 보도(결렬·부인)가 그 진전 보도보다 **나중**이면 죽은 단계다. 공식 발표는 뒤집히지 않는다.
 * 결렬과 부인은 **이력**으로 가른다 — 협상(talks) 이상까지 갔던 딜이 죽으면 결렬, 관심·루머까지였으면 부인(문형이 "collapsed"라도
 * 우리가 본 이력에 협상이 없었으면 그 보도의 문형을 따른다). 죽은 보도만 있으면 결렬 문형이 하나라도 있을 때 결렬, 아니면 부인.
 */
function resolveStage(items) {
  const progressed = items.filter((it) => !isDead(it.stage));
  if (!progressed.length) return items.some((it) => it.stage === "collapsed") ? "collapsed" : "denied";
  let best = progressed[0];
  for (const it of progressed) if (RANK.indexOf(it.stage) >= RANK.indexOf(best.stage)) best = it;
  if (best.stage === "official") return "official";
  const deadLater = items.filter((it) => isDead(it.stage) && ts(it.row) > ts(best.row));
  if (!deadLater.length) return best.stage;
  if (RANK.indexOf(best.stage) >= RANK.indexOf("talks")) return "collapsed";
  return deadLater.some((it) => it.stage === "collapsed") ? "collapsed" : "denied";
}

/** 이적료 — 최신 보도의 값 + 같은 통화의 직전 다른 값 + 같은 통화 보도 범위 */
function resolveFee(items) {
  const withFee = items.filter((it) => it.fee);
  if (!withFee.length) return { fee: null, prev: null, low: null, high: null };
  const latest = withFee.at(-1).fee;
  const same = withFee.map((it) => it.fee).filter((f) => f.currency === latest.currency);
  const prev = [...same].reverse().slice(1).find((f) => f.amount !== latest.amount)?.amount ?? null;
  const amounts = same.map((f) => f.amount);
  return { fee: latest, prev, low: Math.min(...amounts), high: Math.max(...amounts) };
}

/**
 * `transfer_club` 행 — 프리셋(엠블럼·한국어)이 있으면 그 코드, 없으면 slugify(정규 영문명)로 파일 없는 코드.
 * 표기는 이름 사전(`names-ko.mjs` — 프리셋 → 사람 → 위키데이터 캐시)이 정하고, 없으면 정규 영문명 그대로다.
 */
export function clubRecord(canonical, names = createNameBook()) {
  const code = clubCode(canonical) ?? slugify(canonical);
  if (!code) return null;
  const ko = names.club(canonical);
  // 길이는 transfer_club의 CHECK(canonical·name ≤120 · short_name ≤40)에 맞춘다 — 사전 밖 구단명은 원문 구절이다
  return {
    code,
    canonical: clampCp(canonical, 120),
    name: clampCp(ko?.name ?? canonical, 120),
    short_name: clampCp(ko?.short ?? canonical, 40),
    league: clubDisplay(canonical).league,
  };
}

/**
 * @param {object[]} rows  transfer_news 행(id, source_id, stage, players, body, published_at, relevance, verdict*, summary_ko)
 * @param {{ nowMs: number, windows?: object[], names?: ReturnType<typeof createNameBook>, memo?: ReturnType<typeof createExtractMemo>,
 *   requireVerified?: boolean, requireVerdict?: boolean, rejudge?: boolean, existingKeys?: Set<string> }} opts
 *   `requireVerified`: 확인된 선수(`names.isVerifiedPlayer`)의 딜만 만든다. 운영 실행(`runDerivation`)이 켠다.
 *   `requireVerdict`: LLM 판정(`judge.mjs`)을 관문으로 쓴다 — "이동 아님" 보도는 딜에서 빼고, **새 딜**은 "이동"
 *     판정이 한 건 이상 있어야 연다. `existingKeys`(이미 저장된 딜 키)에 있는 딜은 판정이 없어도 둔다(판정이 멎어도
 *     보드가 비지 않게). 운영 실행이 켠다. `rejudge`면 저장된 판정이 있어도 전부 다시 묻는다.
 *   `names`가 없으면 사람이 고친 JSON만으로 만든 사전을 쓴다(자동 캐시 없음 — 테스트가 이 경로다).
 *   `memo`가 없으면 이 호출 안에서만 쓰는 메모를 만든다.
 * @returns {{ deals: object[], clubs: object[], assignments: Map<number, string>, nameNeeds: object[], judgeNeeds: object[], warnings: string[], skipped: Record<string, number>, startMs: number }}
 *   `judgeNeeds`는 LLM에 물어야 할 보도(행 id · 선수 키 · 표시 이름 · 원문 · 언급된 구단) — 5대 리그 구단이 걸린, 확인된 선수의 딜에 든 행만이다.
 *   `nameNeeds`는 딜마다 선수 키·구단 정규명 — 이름 사전에서 빠진 것을 찾는 데 쓴다(저장하지 않는다).
 */
export function deriveDeals(rows, opts) {
  const windows = opts.windows ?? loadWindows();
  const names = opts.names ?? createNameBook({ players: loadPlayerDictionary(), clubs: loadGlossary().clubs });
  const startMs = derivationStartMs(opts.nowMs, windows);
  const memo = opts.memo ?? createExtractMemo();
  const warnings = [];
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };

  // 같은 보도는 대표 한 행만 본다(나머지는 딜에 묶이지 않고 판정·요약 대상도 아니다)
  const { reps, duplicates } = dedupeRows(rows);
  if (duplicates) skipped["중복 보도"] = duplicates;
  const candidates = reps.filter((r) => {
    if (isCandidate(r, startMs)) return true;
    skip(r.stage === "unknown" ? "단계 없음" : Number(r.relevance) < MIN_RELEVANCE ? "관련성 미달" : isRoundup(r) ? "가십 모음" : "범위 밖");
    return false;
  });

  const deals = [];
  const clubs = new Map();
  const assignments = new Map();
  const missingKo = [];
  const unverified = [];
  const unconfirmed = [];
  const nameNeeds = [];
  const judgeNeeds = [];
  /** 현 소속을 찾아야 할 선수 — 출발 구단이 빈 딜(`lookupCurrentClubs`) */
  const clubNeeds = [];
  let fromFallback = 0;
  const mentionedClubs = (sentences) => new Set(sentences.flatMap((s) => memo.extract(s).clubs));

  /*
   * 선수를 못 뽑은 후보 — 규칙이 이름 문형을 놓친 보도다(만잠비 €70m 프라이부르크→빌라 같은 실제 딜이 여기 있었다).
   * 5대 리그 구단이 언급됐으면 LLM에 선수까지 묻는다(`playerKey: null`). "이동"으로 판정되면 그 이름이 `verdict_player_name`에
   * 남아 다음 파생부터 보통 행처럼 묶인다. 이름은 여전히 검증 관문을 지나야 딜이 된다.
   */
  const named = [];
  for (const r of candidates) {
    if (playersOf(r).length) { named.push(r); continue; }
    const mentioned = mentionedClubs(memo.sentences(r));
    if (opts.requireVerdict && verdictOf(r, r.verdict_player) !== "not_move" && [...mentioned].some(isTopLeague) && needsJudgeUnnamed(r, opts.nowMs, opts.rejudge)) {
      judgeNeeds.push({ id: r.id, playerKey: null, player: null, body: r.body, clubs: [...mentioned], source_id: r.source_id, external_id: r.external_id, url: r.url, summary_ko: r.summary_ko ?? null });
      skip("선수 없음(판정 대기)");
    } else skip("선수 없음");
  }

  for (const [key, grouped] of groupByPlayer(named, names)) {
    // LLM이 "이 선수의 이동이 아니다"라고 한 보도는 딜에서 뺀다 — 단계·이적료·방향에도 들어가지 않는다
    let group = grouped;
    if (opts.requireVerdict) {
      group = grouped.filter((r) => verdictOf(r, key) !== "not_move");
      for (let i = group.length; i < grouped.length; i++) skip("이동 아님(LLM 판정)");
      if (!group.length) continue;
    }
    const player = displayName(group, key);
    const surname = tokens(key).at(-1);
    const first = tokens(key)[0];
    // 풀네임 + 성(짧은 성 ≤2는 뺀다 — 다른 단어에 너무 자주 나온다) + 사람 사전에 있는 한 이름(브라질식 "Estevao")
    const alts = [mentionRe(player).source];
    if (tokens(key).length > 1 && surname.length > 2) alts.push(mentionRe(surname).source);
    if (tokens(key).length > 1 && names.playerInfo(first)) alts.push(mentionRe(first).source);
    const mentions = new RegExp(alts.join("|"), "iu");

    const items = [];
    for (const r of group) {
      const stage = stageFor(r, key, mentions, memo);
      if (stage === "unknown") { skip("그 선수의 단계 없음"); continue; }
      const all = memo.sentences(r);
      const sentences = all.filter((s) => mentions.test(s));
      // 계약·이적료·주급은 추출기가 **그 선수 한 명만** 잡은 기사라면 기사 전체에서 읽는다 — 로마노는 둘째 문장을
      // "Former … centre back signs a one year deal until June 2027"처럼 이름 없이 쓴다
      const single = playersOf(r).every((p) => mentions.test(p));
      const storySentences = single ? all : sentences;
      items.push({ row: r, stage, sentences, storySentences, fee: feeOf(storySentences, memo) });
    }
    if (!items.length) continue;

    const dir = resolveDirection(items, player, key);
    /*
     * 출발 구단 폴백 — 보도가 소속을 말하지 않으면 사전의 현 소속(위키데이터 P54 캐시 — `names.currentClub`)을 쓴다.
     * 유명 선수의 출발이 "미확인"으로 뜨는 것은 기사가 소속을 굳이 적지 않아서다(케인 — 운영). 자유계약은 소속이 없고,
     * 행선지와 같은 구단은 이미 옮긴 뒤의 기록이라 쓰지 않는다. 보도가 소속을 말하면(규칙·LLM 표) 그쪽이 먼저다.
     */
    let usedFallback = false;
    if (!dir.from && !dir.isFree) {
      const current = names.currentClub(key);
      if (current && current !== dir.to) {
        dir.from = current;
        usedFallback = true;
      }
    }
    // 재계약·첫 프로 계약 표현이 있고 **옮긴다는 표현이 하나도 없으면** 이적이 아니다("first professional contract" 공지,
    // "Napoli reach agreement to extend X contract"처럼 소속 구단이 행선지로 읽히는 재계약)
    const story = items.flatMap((it) => it.storySentences);
    if (!dir.isFree && story.some((s) => RENEWAL.test(s)) && !story.some((s) => MOVE.test(s))) {
      skip("재계약·첫 프로 계약");
      continue;
    }
    /*
     * 5대 리그 관문(1차) — 보도가 언급한 구단(규칙이 잡은 것 + LLM이 읽은 것) 중 5대 리그 구단이 없으면 딜이 아니다.
     * 비5대 리그 사이의 이동은 보드에 싣지 않고, **LLM도 부르지 않는다**(부르면 비용만 든다). 5대 리그 → 비5대 리그
     * (아스날 → 알힐랄)는 출발 구단이 걸려 통과한다.
     */
    const mentioned = mentionedClubs(story);
    const suitorVotes = new Map();
    for (const it of items) {
      if (verdictOf(it.row, key) !== "move") continue;
      for (const c of [it.row.verdict_from, it.row.verdict_to, ...(it.row.verdict_suitors ?? [])]) if (c) mentioned.add(c);
      for (const c of it.row.verdict_suitors ?? []) suitorVotes.set(c, (suitorVotes.get(c) ?? 0) + 1);
    }
    if (![...mentioned].some(isTopLeague)) {
      skip("5대 리그 밖");
      continue;
    }
    // 행선지 밖의 관심 구단(정규명, 표 순) — 이름 조회 대상이고 관문·자식 행의 근거다
    const suitorCanonicals = [...suitorVotes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter((c) => c !== dir.from && c !== dir.to);
    const stage = resolveStage(items);
    const { fee, prev, low, high } = resolveFee(items);
    const addOn = fee ? firstOf(items.flatMap((it) => it.storySentences), (ex) => (ex.addOnAmount != null && ex.addOnCurrency === fee.currency ? ex.addOnAmount : null), memo) : null;
    const wage = firstOf(items.flatMap((it) => it.storySentences), (ex) => ex.wageText, memo);
    const contract = contractText(parseContract(items.flatMap((it) => it.storySentences)));

    const fromClub = dir.from ? clubRecord(dir.from, names) : null;
    let toClub = dir.to ? clubRecord(dir.to, names) : null;
    if (fromClub && toClub && fromClub.code === toClub.code) toClub = null; // CHECK from <> to

    const playerKo = names.playerKo(key);
    const info = names.playerInfo(key);
    nameNeeds.push({ player, playerKey: key, fromCanonical: fromClub ? dir.from : null, toCanonical: toClub ? dir.to : null, suitorCanonicals });
    /*
     * 확인된 선수 관문 — 추출은 규칙이라 처음 보는 문형에서 틀린다("South American star", 감독 이름). 이름 조회는 이 뒤에
     * 돈다(`nameNeeds`에는 넣는다) — 찾으면 같은 실행에서 다시 파생해 곧바로 열린다. 못 찾은 선수는 경고로 남긴다
     * (사람이 보고 `players-ko.json`에 넣으면 열린다).
     */
    if (opts.requireVerified && !names.isVerifiedPlayer(key)) {
      unverified.push({ player, stage });
      skip("미확인 선수");
      continue;
    }
    // 출발 구단이 비었으면(폴백도 없었다) 현 소속을 찾을 대상이다 — 확인된 선수만(항목 id가 있으면 함께 넘긴다)
    if (!dir.from && !dir.isFree && names.needsClubLookup(key, opts.nowMs)) {
      clubNeeds.push({ playerKey: key, player, wikidataId: names.entry("player", key)?.wikidata_id ?? null });
    }
    if (usedFallback) fromFallback += 1;
    /*
     * LLM 판정 관문 — 새 딜은 "이동" 판정이 한 건 이상 있어야 연다. 아직 묻지 않은(또는 다시 물어야 하는) 보도는
     * `judgeNeeds`로 넘긴다(호출부가 묻고 같은 실행에서 다시 파생한다). 이미 있는 딜은 판정이 없어도 둔다 — 판정이
     * 멎은(키 없음·API 장애) 시간에 보드가 통째로 비지 않게. 이미 있는 딜도 "이동 아님" 보도는 위에서 빠진다.
     */
    if (opts.requireVerdict) {
      for (const it of items) {
        if (verdictOf(it.row, key) === "not_move" || !needsJudge(it.row, key, opts.nowMs, opts.rejudge)) continue;
        judgeNeeds.push({ id: it.row.id, playerKey: key, player, body: it.row.body, clubs: [...mentioned], source_id: it.row.source_id, external_id: it.row.external_id, url: it.row.url, summary_ko: it.row.summary_ko ?? null });
      }
      const confirmed = items.some((it) => verdictOf(it.row, key) === "move");
      if (!confirmed && !opts.existingKeys?.has(dealKey(key))) {
        unconfirmed.push(player);
        skip("판정 대기(LLM)");
        continue;
      }
    }
    // 관심 구단의 구단 행 — 출발·행선지와 겹치는 코드는 뺀다. 화면이 전부 엠블럼·이름으로 그린다(`transfer_deal_suitor`)
    const suitorClubs = suitorCanonicals
      .map((c) => clubRecord(c, names))
      .filter((c, i, arr) => c && c.code !== fromClub?.code && c.code !== toClub?.code && arr.findIndex((x) => x?.code === c.code) === i)
      .slice(0, 10);
    /*
     * 방향 관문(2차) — 출발·행선지·관심 구단 중 하나는 읽혀야 하고, 그중 하나는 5대 리그 구단이어야 한다. 어느 팀과도 엮이지 않은
     * 이적설은 보드에 싣지 않는다(LLM이 원문에서 읽어 채우므로 여기까지 비는 것은 구단이 없는 글이다). 관심 구단만 있는 루머
     * (행선지 미정, 여러 구단이 노린다)는 정상이다.
     */
    if (!fromClub && !toClub && !suitorClubs.length) {
      skip("구단 미확인");
      continue;
    }
    if (![dir.from, dir.to, ...suitorCanonicals].some(isTopLeague)) {
      skip("5대 리그 밖");
      continue;
    }
    // 구단 행은 관문을 지난 딜의 것만 쓴다
    for (const c of [fromClub, toClub, ...suitorClubs]) if (c) clubs.set(c.code, c);
    if (!playerKo) missingKo.push(player);

    const times = items.map((it) => ts(it.row));
    deals.push({
      deal_key: dealKey(key),
      player: clampCp(player, 120),
      player_ko: playerKo,
      position: info?.position ?? null,
      birth_year: info?.birthYear ?? null,
      nationality: info?.nationality ?? null,
      from_club_code: fromClub?.code ?? null,
      to_club_code: toClub?.code ?? null,
      stage,
      fee_amount: fee?.amount ?? null,
      fee_currency: fee?.currency ?? null,
      fee_text: fee ? clampCp(fee.text, 40) : null,
      prev_fee_amount: fee ? prev : null,
      fee_low_amount: fee ? low : null,
      fee_high_amount: fee ? high : null,
      add_on_amount: addOn,
      contract_text: contract ? clampCp(contract, 20) : null,
      wage_text: wage ? clampCp(wage, 20) : null,
      // ⚠ 이적료가 확인되면 자유계약이 아니다(DB CHECK `transfer_deal_free_agent_no_fee`) — 화면은
      //   이적료가 있으면 금액, 없고 이 값이 켜졌으면 "FA(자유 계약)", 둘 다 아니면 "미공개"를 그린다
      is_free_agent: dir.isFree && !fee,
      first_reported_at: new Date(Math.min(...times)).toISOString(),
      latest_reported_at: new Date(Math.max(...times)).toISOString(),
      report_count: items.length,
      rowIds: items.map((it) => it.row.id),
      // 관심 구단 코드(표 순) — `transfer_deal` 컬럼이 아니라 자식 행(`transfer_deal_suitor`)으로 쓴다
      suitorCodes: suitorClubs.map((c) => c.code),
    });
    for (const it of items) assignments.set(it.row.id, dealKey(key));
  }

  if (unconfirmed.length) warnings.push(`이동 판정(LLM)을 받지 못한 새 딜 ${unconfirmed.length}건 — 보드에 올리지 않았다: ${unconfirmed.join(", ")}`);
  if (unverified.length) warnings.push(`확인되지 않은 선수 ${unverified.length}명 — 보드에 올리지 않았다(선수가 맞으면 players-ko.json에 넣는다): ${unverified.map((u) => u.player).join(", ")}`);
  // 유스·10대 이적은 위키데이터에 항목이 없어 관문에 막히는데, 완료·확정 보도는 실제 이적이다(감사: 놓친 8건 중 5건) — 사람이 먼저 봐야 할 것을 따로 알린다
  const doneUnverified = unverified.filter((u) => u.stage === "official" || u.stage === "here_we_go");
  if (doneUnverified.length) warnings.push(`⚠ 그중 완료·확정 보도인데 확인되지 않은 선수 ${doneUnverified.length}명 — 실제 이적이라 사전 등재가 급하다: ${doneUnverified.map((u) => u.player).join(", ")}`);
  if (missingKo.length) warnings.push(`한국어 표기가 없는 선수 ${missingKo.length}명(사람 사전·위키데이터 모두 없음) — 영문명으로 그려진다: ${missingKo.join(", ")}`);
  deals.sort((a, b) => b.latest_reported_at.localeCompare(a.latest_reported_at));
  return { deals, clubs: [...clubs.values()], assignments, nameNeeds, judgeNeeds, clubNeeds, fromFallback, warnings, skipped, startMs };
}

/** 요약(로그·드라이런) */
export function summarize(derived) {
  const stages = {};
  for (const d of derived.deals) stages[d.stage] = (stages[d.stage] ?? 0) + 1;
  const n = derived.deals.length;
  const pct = (k) => (n ? `${Math.round((k / n) * 100)}%` : "—");
  return {
    deals: n,
    stages,
    withDirection: pct(derived.deals.filter((d) => d.from_club_code && d.to_club_code).length),
    withAnyClub: pct(derived.deals.filter((d) => d.from_club_code || d.to_club_code).length),
    fromFallback: derived.fromFallback ?? 0,
    withFee: pct(derived.deals.filter((d) => d.fee_amount != null).length),
    linkedRows: derived.assignments.size,
    clubs: derived.clubs.length,
  };
}

// ── DB ────────────────────────────────────────────────────────────────

const NEWS = "transfer_news";
const DEALS = "transfer_deal";
const CLUBS = "transfer_club";
const SUITORS = "transfer_deal_suitor";
const CHUNK = 100;

/**
 * 범위 안에서 파생이 볼 행 — id 키셋으로 끝까지 읽는다(`max_rows`에 기대지 않는다 — pipeline.mjs와 같은 이유).
 *
 * ⚠ **후보가 될 수 없는 행은 DB에서 거른다** — 범위 안 보도 대부분은 이적 단계가 없거나 관련성이 낮은 일반 기사인데,
 *   그것까지 본문째 매시간 받던 것을 줄인다. 거르는 조건은 `isCandidate`의 앞 두 조건(단계 · 관련성)과 **같아야**
 *   한다 — 이 필터를 통과하지 못한 행은 `isCandidate`도 통과하지 못하므로 파생 결과가 달라지지 않는다.
 *   선수·가십 모음 판정은 본문을 봐야 해서 지금처럼 `deriveDeals`가 한다.
 * ⚠ **이미 딜에 묶인 행(`deal_id`)은 후보가 아니어도 함께 읽는다** — 재처리로 단계를 잃은 행의 배정을 푸는
 *   판정(`writeDeals`의 해제)이 이 행들을 봐야 한다. 빼면 그 행이 옛 딜을 계속 가리킨다.
 * ⚠ 걸러진 행은 `skipped`의 "단계 없음"·"관련성 미달" 집계에서도 빠진다(로그 숫자만 줄고 판정은 같다).
 */
async function loadRows(supabase, startMs) {
  const rows = [];
  let lastId = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(NEWS)
      .select("id, source_id, external_id, url, stage, players, clubs, body, published_at, relevance, deal_id, verdict, verdict_player, verdict_player_name, verdict_at, verdict_from, verdict_to, verdict_suitors, verdict_stage, summary_ko")
      .gte("published_at", new Date(startMs).toISOString())
      .or(`deal_id.not.is.null,and(stage.neq.unknown,relevance.gte.${MIN_RELEVANCE})`)
      .gt("id", lastId)
      .order("id")
      .limit(500);
    if (error) throw new Error(`보도 행 조회 실패: ${error.message}`);
    if (!data.length) break;
    rows.push(...data);
    lastId = data.at(-1).id;
  }
  return rows;
}

const chunks = (arr) => Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, i) => arr.slice(i * CHUNK, (i + 1) * CHUNK));

/** 파생이 쓰는 딜 컬럼 — 바뀌었는지 대조할 대상(`id`·`updated_at` 제외) */
const DEAL_COLUMNS = [
  "deal_key", "player", "player_ko", "position", "birth_year", "nationality", "from_club_code", "to_club_code", "stage",
  "fee_amount", "fee_currency", "fee_text", "prev_fee_amount", "fee_low_amount", "fee_high_amount", "add_on_amount",
  "contract_text", "wage_text", "is_free_agent", "first_reported_at", "latest_reported_at", "report_count",
];
const CLUB_COLUMNS = ["code", "canonical", "name", "short_name", "league"];
const TIME_COLUMNS = new Set(["first_reported_at", "latest_reported_at"]);
const NUMERIC_COLUMNS = new Set(["fee_amount", "prev_fee_amount", "fee_low_amount", "fee_high_amount", "add_on_amount"]);
const PAGE = 500;

/**
 * 저장된 값과 새로 파생한 값이 **같은가** — 같으면 그 행은 쓰지 않는다.
 * ⚠ **"같다"고 판정하는 쪽만 엄격하면 된다.** 다르다고 잘못 보면 한 번 더 쓸 뿐이지만(지금까지 매시간 하던 일이다),
 *   같다고 잘못 보면 바뀐 값이 저장되지 않는다. 그래서 정규화는 **표기 차이만** 접는다:
 *   - 시각: DB는 `+00:00`·마이크로초, 파생은 `…Z`·밀리초 → 같은 순간인지로 본다.
 *   - 금액: `numeric`이 JSON 숫자로 온다 → 숫자로 같은지 본다(반올림하지 않는다 — 소수 셋째 자리 값은 DB가
 *     반올림해 저장하므로 매번 "다름"이 되어 다시 쓰일 뿐이다).
 *   - `undefined`는 `null`과 같다(파생은 없는 값을 `null`로 둔다).
 */
function sameValue(column, stored, next) {
  const a = stored ?? null;
  const b = next ?? null;
  if (a === null || b === null) return a === b;
  if (TIME_COLUMNS.has(column)) return Date.parse(a) === Date.parse(b);
  if (NUMERIC_COLUMNS.has(column)) return Number(a) === Number(b);
  return a === b;
}
const sameRow = (columns, stored, next) => columns.every((c) => sameValue(c, stored[c], next[c]));

/** 한 테이블을 `order` 키셋으로 끝까지 읽는다(`max_rows`에 기대지 않는다) */
async function readAll(supabase, table, columns, key, build = (q) => q) {
  const out = [];
  let last = null;
  for (;;) {
    let q = build(supabase.from(table).select(columns)).order(key).limit(PAGE);
    if (last !== null) q = q.gt(key, last);
    const { data, error } = await q;
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) break;
    last = data.at(-1)[key];
  }
  return out;
}

/**
 * 어떤 보도 행도 가리키지 않는 딜 — 이번에 파생되지 않은 딜 중에서 찾는다.
 * ⚠ **딜마다 따로 세지 않는다.** 범위 밖으로 나간 옛 창의 딜은 옛 보도가 계속 가리켜 지워지지 않으므로 창이 지날수록
 *   쌓이는데, 그 전부를 매시간 한 건씩 세면 1월 이후 실행당 딜 수만큼 왕복이 붙는다. 딜 목록을 페이지로 읽으면서
 *   참조 보도를 **최대 1건만** 임베딩해 보고(`transfer_news_deal_published_idx`를 탄다) 빈 딜만 고른다.
 * ⚠ 임베딩은 `limit 1`이라 결과가 잘려도 판정이 틀리지 않는다 — 1건이라도 오면 "참조됨", 0건이면 정말 0건이다.
 * ⚠ 보도 행을 사람이 지워 생긴 빈 딜도 여기서 잡힌다(이번 실행에 배정이 바뀐 딜만 보면 그 경로를 놓친다).
 * ⚠ **댓글이 달린 딜은 지우지 않는다**(`kept`로 따로 돌려준다). 댓글 FK가 `on delete restrict`라 지우려 하면
 *   23503으로 실패하고, 그렇게 두면 매시간 같은 실패가 종료 코드 1로 남는다. 보도가 끊긴 딜이 보드에 남는 것은
 *   사용자가 쓴 글을 잃는 것보다 싸다고 판단했다(`api-and-db.md` "삭제 규칙"). 댓글도 같은 방식으로 1건만 본다.
 * @returns {{ orphans: object[], kept: object[] }}
 */
async function findOrphanDeals(supabase, keep) {
  const deals = await readAll(
    supabase,
    DEALS,
    "id, deal_key, player, refs:transfer_news!deal_id(id), comments:transfer_deal_comment!deal_id(id)",
    "id",
    (q) => q.limit(1, { referencedTable: "refs" }).limit(1, { referencedTable: "comments" }),
  );
  const empty = deals.filter((d) => !keep.has(d.deal_key) && d.refs.length === 0);
  return {
    orphans: empty.filter((d) => d.comments.length === 0),
    kept: empty.filter((d) => d.comments.length > 0),
  };
}

/**
 * 파생 결과를 쓴다 — 구단 → 딜 → 보도 행의 `deal_id` 순서(FK 방향).
 * ⚠ 행 단위 실패도 실패다(종료 코드 1) — 읽는 화면이 없어 종료 코드가 유일한 신호다.
 * ⚠ **값이 바뀐 구단·딜만 쓴다.** 매시간 전량을 upsert하면 값이 그대로인 행까지 트리거·인덱스 다섯 개가 갱신되고
 *   죽은 행 버전이 쌓인다 — 그리고 한 행만 실패해도 `upsertRows`가 **전량을 한 건씩** 다시 보낸다. 대조 기준은
 *   파생이 쓰는 컬럼 전부다(`DEAL_COLUMNS`·`CLUB_COLUMNS`). 그래서 `updated_at`은 "마지막으로 값이 바뀐 시각"이다
 *   (화면·사이트맵은 이 컬럼을 읽지 않는다 — `api-and-db.md`).
 */
export async function writeDeals(supabase, derived, rows, opts = {}) {
  const log = opts.log ?? console;
  const now = new Date().toISOString();
  const stats = { clubs: 0, deals: 0, unchanged: 0, suitors: 0, linked: 0, unlinked: 0, deleted: 0, failed: 0 };

  const storedClubs = new Map();
  for (const codes of chunks(derived.clubs.map((c) => c.code))) {
    const { data, error } = await supabase.from(CLUBS).select(CLUB_COLUMNS.join(", ")).in("code", codes);
    if (error) throw new Error(`구단 조회 실패: ${error.message}`);
    for (const c of data) storedClubs.set(c.code, c);
  }
  const clubRows = derived.clubs.filter((c) => !storedClubs.has(c.code) || !sameRow(CLUB_COLUMNS, storedClubs.get(c.code), c));
  const clubUp = await upsertRows(supabase, CLUBS, clubRows.map((c) => ({ ...c, updated_at: now })), { onConflict: "code" }, { log });
  stats.clubs = clubUp.saved.length;
  stats.failed += clubUp.failed.length;
  if (clubUp.aborted) throw new Error("계통적 실패로 구단 저장을 중단했다");

  // 저장된 딜(파생이 쓰는 컬럼 + id) — 바뀌었는지 대조하고, 바뀌지 않은 딜의 id도 여기서 얻는다
  const stored = new Map();
  for (const keys of chunks(derived.deals.map((d) => d.deal_key))) {
    const { data, error } = await supabase.from(DEALS).select(`id, ${DEAL_COLUMNS.join(", ")}`).in("deal_key", keys);
    if (error) throw new Error(`딜 조회 실패: ${error.message}`);
    for (const d of data) stored.set(d.deal_key, d);
  }
  const dealRows = derived.deals.map(({ rowIds: _rowIds, suitorCodes: _suitorCodes, ...d }) => d);
  const changedDeals = dealRows.filter((d) => !stored.has(d.deal_key) || !sameRow(DEAL_COLUMNS, stored.get(d.deal_key), d));
  const dealUp = await upsertRows(supabase, DEALS, changedDeals.map((d) => ({ ...d, updated_at: now })), { onConflict: "deal_key" }, { log });
  stats.deals = dealUp.saved.length;
  stats.unchanged = dealRows.length - changedDeals.length;
  stats.failed += dealUp.failed.length;
  if (dealUp.aborted) throw new Error("계통적 실패로 딜 저장을 중단했다");
  // 이번 파생이 DB에 있다고 보증하는 딜 = 바뀌지 않은 딜 + 이번에 저장한 딜(저장 실패한 딜은 빠진다)
  const changedKeys = new Set(changedDeals.map((d) => d.deal_key));
  const savedKeys = new Set([...dealRows.filter((d) => !changedKeys.has(d.deal_key)).map((d) => d.deal_key), ...dealUp.saved.map((d) => d.deal_key)]);

  // deal_key → id. 바뀌지 않은 딜은 위에서 읽은 값을 쓰고, 이번에 저장한 딜만 다시 읽는다
  // (upsert는 id를 돌려주지 않는다 — 배치·행 단위 폴백 어느 경로로 저장됐든 여기서 한 번에 읽는다)
  const idByKey = new Map();
  for (const key of savedKeys) if (!changedKeys.has(key)) idByKey.set(key, stored.get(key).id);
  for (const keys of chunks(dealUp.saved.map((d) => d.deal_key))) {
    const { data, error } = await supabase.from(DEALS).select("id, deal_key").in("deal_key", keys);
    if (error) throw new Error(`딜 id 조회 실패: ${error.message}`);
    for (const d of data) idByKey.set(d.deal_key, d.id);
  }

  // 관심 구단(자식 행) — 딜마다 저장된 집합과 대조해 바뀐 딜만 지우고 다시 넣는다(표 순 position)
  const dealIds = [...idByKey.values()];
  const storedSuitors = new Map();
  for (const ids of chunks(dealIds)) {
    const { data, error } = await supabase.from(SUITORS).select("deal_id, club_code, position").in("deal_id", ids);
    if (error) throw new Error(`관심 구단 조회 실패: ${error.message}`);
    for (const r of data) (storedSuitors.get(r.deal_id) ?? storedSuitors.set(r.deal_id, []).get(r.deal_id)).push(r);
  }
  for (const deal of derived.deals) {
    const id = idByKey.get(deal.deal_key);
    if (id == null) continue;
    const want = deal.suitorCodes.map((club_code, position) => ({ deal_id: id, club_code, position }));
    const have = (storedSuitors.get(id) ?? []).sort((a, b) => a.position - b.position);
    if (JSON.stringify(have.map((r) => [r.club_code, r.position])) === JSON.stringify(want.map((r) => [r.club_code, r.position]))) continue;
    const { error: delErr } = await supabase.from(SUITORS).delete().eq("deal_id", id);
    if (delErr) { stats.failed++; log.error(`✗ 관심 구단 정리 실패(${deal.player}): ${delErr.message}`); continue; }
    if (want.length) {
      const { error: insErr } = await supabase.from(SUITORS).insert(want);
      if (insErr) { stats.failed++; log.error(`✗ 관심 구단 저장 실패(${deal.player}): ${insErr.message}`); continue; }
    }
    stats.suitors += 1;
  }

  // 보도 행 → 딜. 이미 같은 값이면 건너뛴다(쓰기를 아낀다)
  const assigned = new Set();
  const current = new Map(rows.map((r) => [r.id, r.deal_id ?? null]));
  for (const deal of derived.deals) {
    const id = idByKey.get(deal.deal_key);
    if (id == null) continue; // 저장 실패한 딜 — 행은 옛 배정을 유지한다
    for (const rowId of deal.rowIds) assigned.add(rowId);
    const changed = deal.rowIds.filter((rowId) => current.get(rowId) !== id);
    for (const ids of chunks(changed)) {
      const { error } = await supabase.from(NEWS).update({ deal_id: id }).in("id", ids);
      if (error) { stats.failed += ids.length; log.error(`✗ deal_id 배정 실패(${deal.player}): ${error.message}`); continue; }
      stats.linked += ids.length;
    }
  }
  // 범위 안인데 이번 파생에서 어느 딜에도 속하지 않은 행은 배정을 푼다(범위 밖 행은 건드리지 않는다 — 그 딜을 지우지 않기 위해서다)
  const stale = rows.filter((r) => r.deal_id != null && !assigned.has(r.id)).map((r) => r.id);
  for (const ids of chunks(stale)) {
    const { error } = await supabase.from(NEWS).update({ deal_id: null }).in("id", ids);
    if (error) { stats.failed += ids.length; log.error(`✗ deal_id 해제 실패: ${error.message}`); continue; }
    stats.unlinked += ids.length;
  }

  // 어떤 보도 행도 가리키지 않는 딜만 지운다(관심은 cascade, 댓글이 달린 딜은 남긴다 — findOrphanDeals 주석)
  const { orphans, kept } = await findOrphanDeals(supabase, savedKeys);
  for (const d of kept) log.warn(`⚠ 보도가 끊겼지만 댓글이 있어 남긴 딜: ${d.player} (${d.deal_key})`);
  for (const d of orphans) {
    const { error: delErr } = await supabase.from(DEALS).delete().eq("id", d.id);
    // 판정과 삭제 사이에 댓글이 달렸다(댓글 FK restrict) — 실패가 아니라 "남긴 딜"이다
    if (delErr?.code === "23503" && `${delErr.message} ${delErr.details ?? ""}`.includes("transfer_deal_comment")) { log.warn(`⚠ 삭제하려던 사이 댓글이 달려 남긴 딜: ${d.player} (${d.deal_key})`); continue; }
    if (delErr) { stats.failed++; log.error(`✗ 딜 삭제 실패(${d.player}): ${delErr.message}`); continue; }
    stats.deleted++;
    log.warn(`⚠ 보도 행이 하나도 남지 않은 딜을 지웠다: ${d.player} (${d.deal_key})`);
  }
  return stats;
}

/**
 * 조회 → 파생 → 이름 조회 → LLM 판정·요약 → (dryRun이 아니면) 쓰기.
 * @param {{ dryRun?: boolean, rejudge?: boolean, nowMs?: number, log?: Console, fetchImpl?: typeof fetch, lookupNames?: boolean,
 *   judge?: ((needs: object[], names: object) => Promise<{ updates: object[] }>) | null }} opts
 *   `judge`는 판정 함수(`judge.mjs`의 `runJudgements`를 호출부가 감싸 넘긴다). 없으면(키가 없다) 판정하지 않는다 —
 *   판정이 없는 **새** 딜은 열리지 않고 이미 있는 딜은 남는다. `rejudge`는 저장된 판정을 무시하고 전부 다시 묻는다.
 * @returns {{ summary: object, warnings: string[], skipped: object, write: object | null, lookup: object | null, judged: object | null }}
 */
export async function runDerivation(supabase, opts = {}) {
  const log = opts.log ?? console;
  const nowMs = opts.nowMs ?? Date.now();
  const windows = loadWindows();
  const rows = await loadRows(supabase, derivationStartMs(nowMs, windows));
  let names = await loadNameBook(supabase);
  // 이미 저장된 딜 — 판정이 없어도 남긴다(판정이 멎은 시간에 보드가 통째로 비지 않게)
  const existingKeys = new Set((await readAll(supabase, DEALS, "deal_key", "deal_key")).map((d) => d.deal_key));
  // 이름을 찾아 다시 파생할 때 추출을 되풀이하지 않도록 메모를 여러 번의 파생이 나눠 쓴다
  const memo = createExtractMemo();
  const derive = (rejudge = false) => deriveDeals(rows, { nowMs, windows, names, memo, requireVerified: true, requireVerdict: true, rejudge, existingKeys });
  let derived = derive(Boolean(opts.rejudge));

  /*
   * 이름 사전 채우기 — 딜에 오른 이름 중 한국어 표기가 없는 것만 위키데이터에서 찾아 캐시에 쓴다.
   * 새로 찾은 것이 있으면 **다시 파생**한다(순수 함수라 싸다) — 같은 실행에서 화면·요약이 한국어가 된다.
   * 드라이런은 찾지 않는다(캐시에 쓰는 일이다). 조회 실패는 경고일 뿐이다 — 사전이 비어도 영문으로 그린다.
   */
  let lookup = null;
  const lookupMissing = async () => {
    const missing = missingNames(derived.nameNeeds, names, nowMs);
    if (!missing.length) return;
    const r = await lookupAndCache(supabase, missing, { fetchImpl: opts.fetchImpl, book: names });
    lookup = lookup ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? [...lookup[k], ...v] : lookup[k] + v])) : r;
    if (r.found > 0 || r.verified > 0) {
      names = await loadNameBook(supabase);
      derived = derive(Boolean(opts.rejudge));
    }
  };
  if (!opts.dryRun && opts.lookupNames !== false) await lookupMissing();

  /*
   * 출발 구단 폴백 — 보도가 소속을 말하지 않는 딜의 선수는 현 소속을 위키데이터(P54)에서 찾아 캐시하고 **다시 파생**한다
   * (같은 실행에서 출발 구단이 채워진다). 이름 조회와 같은 모델이다 — 드라이런은 찾지 않고, 실패는 경고다.
   */
  let clubLookup = null;
  const lookupClubs = async () => {
    if (!derived.clubNeeds.length) return;
    const r = await lookupCurrentClubs(supabase, derived.clubNeeds, { fetchImpl: opts.fetchImpl, book: names });
    clubLookup = clubLookup ? { ...r, tried: clubLookup.tried + r.tried, found: clubLookup.found + r.found, notFound: clubLookup.notFound + r.notFound, failed: clubLookup.failed + r.failed, warnings: [...clubLookup.warnings, ...r.warnings] } : r;
    if (r.found > 0) {
      names = await loadNameBook(supabase);
      derived = derive(Boolean(opts.rejudge));
    }
  };
  if (!opts.dryRun && opts.lookupNames !== false) await lookupClubs();

  /*
   * LLM 판정 — 5대 리그 구단이 걸린 후보 중 물어야 할 것만 묻는다(확인된 선수의 딜에 든 보도 + 규칙이 선수를 못 뽑은 보도).
   * 이름 조회 **뒤**에 돈다(조회로 확인된 선수의 보도도 같은 실행에서 판정받게). 결과를 메모리의 행에 입혀 **다시 파생**하고,
   * 모델이 새로 읽은 선수·확인한 구단이 있으면 이름 사전을 다시 읽고 한 번 더 찾는다(그 선수가 같은 실행에서 확인되게).
   * 드라이런은 묻지 않는다(비용이 들고 DB에 쓴다) — 저장된 판정만으로 파생한다.
   */
  let judged = null;
  if (!opts.dryRun && opts.judge && derived.judgeNeeds.length) {
    judged = await opts.judge(derived.judgeNeeds, names);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const { id, ...fields } of judged.updates) Object.assign(byId.get(id) ?? {}, fields);
    if (judged.namesWritten) names = await loadNameBook(supabase);
    if (judged.updates.length) {
      derived = derive();
      if (opts.lookupNames !== false) {
        await lookupMissing();
        await lookupClubs();
      }
    }
  }

  const write = opts.dryRun ? null : await writeDeals(supabase, derived, rows, { log });
  return {
    summary: summarize(derived),
    warnings: [...derived.warnings, ...(lookup?.warnings ?? []), ...(clubLookup?.warnings ?? []), ...(judged?.warnings ?? [])],
    skipped: derived.skipped,
    deals: derived.deals,
    write,
    lookup,
    clubLookup,
    judged,
  };
}

/**
 * 딜 파생 — `transfer_news`(보도 행)에서 선수 단위 이적 건(`transfer_deal`)을 만든다.
 *
 * 보드는 어드민 큐레이션이 없다 — 이 파생이 유일한 원천이다. 그래서 **틀린 칸보다 빈 칸**이 규칙이다:
 * 금액은 판정자가 원문에서 읽은 값(원문 대조를 지난 것)을, 계약·주급은 그 선수가 나오는 문장에서 읽고, 못 읽으면 null로 둔다.
 *
 * 딜이 보드에 오르는 관문(순서대로):
 *   1. 후보 — 단계가 있는 보도(가십 모음 제외 · 범위 안 · 관련성 ≥ MIN_RELEVANCE), 또는 단계는 못 읽었지만 선수·이적 낱말이 있는
 *      보도(`isSoftCandidate` — 선수를 비워 판정자에게 묻는다). 같은 보도는 한 행만 본다.
 *   2. 재계약 — 옮긴다는 표현 없이 재계약·첫 프로 계약만 말하면 딜이 아니다.
 *   3. 5대 리그 — 보도가 언급한 구단 중 5대 리그 구단이 하나도 없으면 딜이 아니고 **LLM도 부르지 않는다**.
 *   4. 확인된 선수 — 사람 사전·위키데이터에서 확인된 선수만(`names.isVerifiedPlayer`). 예외: 완료·확정 판정이거나 출처 두 곳의
 *      "이동" 판정이 있는 두 토큰 이상 이름(`canOpenUnverified` — 유스 이적).
 *   5. LLM 판정 — "이동 아님" 보도는 빠지고, 새 딜은 "이동" 판정이 있어야 연다(`judge.mjs`). 판정받은 보도가 있으면 단계·방향·금액은
 *      그 보도들만으로 정하고(보도 수·배정은 전 보도), 판정이 덜 찬 동안 단계의 후퇴는 저장된 단계로 미룬다(`holdStage`).
 *      같은 보도를 옮긴 두 매체는 판정 뒤의 신호로 한 보도로 접고(`foldEchoes`), 딜 금액은 딜의 상대가 낸 지금의 금액만 쓴다(`dealFee`).
 *   6. 방향 — 출발·행선지 중 하나는 있어야 하고 그중 하나는 5대 리그 구단이어야 한다. LLM이 읽은 구단이 규칙 표보다 크다.
 *   7. 임대 — 진행 중인 임대를 설명할 뿐인 보도(`loan_standing` — 문맥 보도)는 보도 수에만 들고 단계·방향·결과 시각·알림을 움직이지
 *      않으며 새 딜을 열지 못한다. 형태가 임대·임대 연장인 딜은 행선지(없으면 관심 구단)가 5대 리그일 때만 싣는다(유스 임대가 보드를 덮지 않게).
 *
 * 두 층으로 나뉜다.
 *   - `deriveDeals(rows, opts)` — **순수 함수**. 행 배열 → 딜·구단·행 배정. 회귀 테스트(`test-transfer-derive.mjs`)가
 *     DB 없이 이것만 돌린다.
 *   - `runDerivation(supabase, opts)` — 조회 → (재생) → 사전 맞춤 → 파생 → 이름 조회 → LLM 판정 → 쓰기. `sync-transfer-news.mjs`의 마지막 단계다(`deal-store.mjs`).
 *
 * ⚠ **멱등하다.** 딜 키가 선수명 해시라 다시 돌려도 같은 딜에 upsert되고(`id` 보존 — 관심 FK가 id를 본다),
 *   보도 행의 `deal_id`는 매번 다시 배정된다.
 * ⚠ **삭제하지 않는다** — 범위 밖으로 나간 딜은 화면의 범위 필터가 가린다. 지우는 것은 **어떤 보도 행도
 *   더는 가리키지 않는 딜**뿐이다.
 */
import { clampCp, slugify } from "../sync-db.mjs";
import { clubCode, clubDisplay, presetClubs } from "./club-display.mjs";
import { canonicalClubName } from "./clubs.mjs";
import { contractText, parseContract } from "./contract.mjs";
import { DEST, FORMER, FROM, LEFT_FREE, SUITOR_FROM, addVotes, collectVotes, topVote } from "./direction.mjs";
import { extractTransfer } from "./extract.mjs";
import { dealFee, feeFor, feeKindAllowed, resolveFee } from "./deal-fee.mjs";
import { JUDGE_MAX_PER_RUN, normalizeQuote } from "./judge-parse.mjs";
import { createNameBook, loadGlossary, loadPlayerDictionary } from "./names-ko.mjs";
import { LOAN_FORMS } from "./judge-prompt.mjs";
import { CARRIED_DAILY_ATTEMPTS, JUDGE_TIER, REPEATED_FAILURE_ATTEMPTS, hasRawVerdict, judgeMode, judgeNeed, mentionsLoan, orderJudgeNeeds, retryDelayMs } from "./judge-queue.mjs";
import { RANK, RENEWAL, cleanBody, isDead, isRoundup, isRoundupItem, mentionRe, sentencesOf } from "./story.mjs";
import { dealKey, normalizePlayer } from "./player-key.mjs";
import { verdictOf } from "./verdict-columns.mjs";

/** 이적 관련성 하한 — 그 아래는 경기 리뷰·부상 소식이 단계 규칙에 스친 것이다 */
export const MIN_RELEVANCE = 0.3;
// 창 일정 읽기는 windows.mjs가 갖는다(판정 요청도 쓴다) — 기존 소비자를 위해 다시 내보낸다
import { HOUR_MS, ts } from "./util.mjs";
import { boardScopeStartMs, derivationStartMs, loadWindows, windowSpan } from "./windows.mjs";
export { boardScopeStartMs, derivationStartMs, loadWindows, windowSpan };

// 선수 키의 정규형·딜 키는 `player-key.mjs`가 단독으로 갖는다. 여기서 다시 내보내 호출부의 경로를 유지한다
export { dealKey, normalizePlayer };

// 금액 규칙·판정 대기열은 각자의 파일이 갖는다 — 기존 소비자를 위해 다시 내보낸다(DB 층 `deal-store.mjs`는 이 파일을 import하므로 다시 내보내지 않는다)
export { CARRIED_DAILY_ATTEMPTS, JUDGE_TIER, REPEATED_FAILURE_ATTEMPTS, dealFee, hasRawVerdict, judgeMode, mentionsLoan, orderJudgeNeeds, retryDelayMs };

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
 * ⚠ **행을 지우지 않는다** — 파생에서만 대표 하나를 쓴다(지우는 것은 되돌릴 수 없다). 대표는 **판정(이동·이동 아님)이 있는 행**,
 *   그다음 가장 이른 게시 시각, 같으면 나중에 수집된 행(= 최신 개정판)이다.
 * ⚠ 판정 있는 행이 먼저인 이유 — 기사가 개정될 때마다 판정 없는 새 행이 생기는데, 그 행이 대표가 되면 판정을 잃고 딜이
 *   흔들리며 같은 글을 다시 묻는다(개정판마다 한 번씩).
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
  const judgedFirst = (r) => (r.verdict != null ? 0 : 1);
  const reps = [...groups.values()].map((g) => g.sort((a, b) => judgedFirst(a) - judgedFirst(b) || ts(a) - ts(b) || b.id - a.id)[0]);
  return { reps, duplicates: rows.length - reps.length };
}

/** 그 선수의 "이동" 판정이 읽은 사건의 형태 — 형태를 묻기 전의 판정·판정 없는 행은 null(모른다) */
const formOf = (r, key) => (verdictOf(r, key) === "move" ? (r.verdict_form ?? null) : null);
/**
 * 문맥 보도 — 새 움직임 없이 진행 중인 임대와 그 조항을 설명할 뿐인 보도(`loan_standing`). 가르나초의 "여름에 의무 조항이 붙은 임대로
 * 빌라에 갔고 조건이 맞으면 £42.5m에 완전 이적" 기사가 "합의 임박"이 되어 구단 팬에게 알림까지 갔다(운영). 보도 수·타임라인·배정에는
 * 들지만 단계·방향·결과 시각·알림을 움직이지 않고, 문맥 보도만으로는 새 딜을 열지 않는다(판정자는 지울 수만 있다).
 */
const isContext = (r, key) => formOf(r, key) === "loan_standing";
/** 딜의 형태가 임대 계열인가 — 금액 성격·관문이 갈린다 */
const isLoanForm = (form) => form != null && LOAN_FORMS.includes(form);
/**
 * 그 행의 선수들 — 규칙이 뽑은 이름, 없으면 LLM이 "이동"으로 판정하며 읽은 이름.
 * ⚠ 규칙이 단계를 못 읽은 행(넓힌 후보 — `isSoftCandidate`)은 규칙의 이름을 쓰지 않는다. 단계 문형 없이 잡힌 이름은 글의 주인공이
 *   아닐 수 있어 판정자가 읽은 이름만 믿는다(판정 전에는 선수가 없는 행이다).
 */
const playersOf = (r) => (r.stage !== "unknown" && r.players?.length ? r.players : r.verdict === "move" && r.verdict_player_name ? [r.verdict_player_name] : []);
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

/** 이적을 말할 때 쓰는 낱말 — 단계 문형보다 넓다. 넓힌 후보(`isSoftCandidate`)를 고르는 데만 쓴다 */
const TRANSFER_VOCAB = /\b(?:transfer|sign(?:s|ed|ing)?|loan|bid|deal|move|target|interest(?:ed)?|fee|join(?:s|ed|ing)?|swoop|linked|keen|want|eye|eyeing|monitor|offer|talks|agree|clause|free agent|exit|leave|depart|here we go)\b|[£€]\d/iu;

/**
 * 넓힌 후보 — 규칙이 **단계를 못 읽었지만** 선수 이름을 잡았고 이적 낱말이 있는 보도. 단계 문형은 좁아서("would move for"·
 * "attracting interest from"·"vowed to sign"·"wants to leave"를 못 읽는다) 이적 보도의 절반이 LLM에 가기도 전에 빠졌다
 * (운영 표본: 단계 없는 보도 200건 중 25건이 5대 리그 이적 보도). 문형을 하나씩 늘리는 대신 판정자에게 묻는다 — 5대 리그 구단이
 * 언급된 것만 묻고(아래 "선수 없음" 갈래), 선수·단계는 판정자가 읽는다. 호출은 하루 열댓 건 는다.
 * ⚠ 조건을 고치면 `loadRows`(`deal-store.mjs`)의 필터도 함께 고친다(단계 없음 + 선수 있음).
 */
function isSoftCandidate(r, startMs) {
  return r.stage === "unknown" && Boolean(r.players?.length) && !isRoundup(r) && ts(r) >= startMs && TRANSFER_VOCAB.test(r.body);
}

/**
 * 행을 선수별로 묶는다. 키는 첫 선수(`playersOf`)의 정규형.
 * ⚠ 한 토큰 이름("Isak")은 같은 범위의 두 토큰 이름("Alexander Isak")의 **마지막 토큰**과 같으면 그 딜로 합친다.
 *   사람 사전에 있는 한 토큰 이름("Estevao")은 **첫 토큰**이 같은 두 토큰 이름("Estevao Willian")과도 합친다 —
 *   브라질식 한 이름 선수는 매체마다 성을 붙였다 뗐다 한다. 두 토큰 이름끼리는 합치지 않는다(동성이인).
 *   같은 토큰을 가진 두 토큰 이름이 여럿이면 어느 쪽인지 알 수 없어 합치지 않는다.
 * @returns {{ groups: Map<string, object[]>, aliases: Map<string, Set<string>> }} `aliases`는 묶음 키 → 그 묶음에 합쳐진 다른 키들
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
  // 묶음의 구단 집합은 묶음마다 한 번 만들고, 묶음이 합쳐지면 합집합으로 갱신한다(비교마다 다시 모으지 않는다)
  const rowClubs = (r) => [...(r.clubs ?? []), r.verdict_from, r.verdict_to, ...(r.verdict_suitors ?? [])].filter(Boolean);
  const clubSets = new Map([...groups].map(([k, rs]) => [k, new Set(rs.flatMap(rowClubs))]));
  const sharesClub = (a, b) => { const x = clubSets.get(a), y = clubSets.get(b); return !x.size || !y.size || [...x].some((c) => y.has(c)); };
  // 합쳐진 키 — 묶음 키 → 그 묶음으로 흡수된 다른 키들(딜 키를 고를 때 저장된 딜을 찾는다 — `deriveDeals`)
  const aliases = new Map();
  const merge = (from, into) => {
    groups.get(into).push(...groups.get(from));
    for (const c of clubSets.get(from)) clubSets.get(into).add(c);
    const absorbed = aliases.get(into) ?? aliases.set(into, new Set()).get(into);
    absorbed.add(from);
    for (const a of aliases.get(from) ?? []) absorbed.add(a);
    groups.delete(from);
    clubSets.delete(from);
    aliases.delete(from);
  };
  // 여러 토큰 이름을 마지막 토큰·첫 토큰으로 찾는 색인 — 한 토큰 이름마다 전체를 훑지 않는다
  const byToken = (pick) => {
    const index = new Map();
    for (const m of multi) (index.get(pick(m)) ?? index.set(pick(m), []).get(pick(m))).push(m);
    return index;
  };
  const byLast = byToken((m) => tokens(m).at(-1));
  const byFirst = byToken((m) => tokens(m)[0]);
  for (const k of [...groups.keys()]) {
    if (tokens(k).length !== 1) continue;
    const known = Boolean(names.playerInfo(k));
    const candidates = new Set([...(byLast.get(k) ?? []), ...(known ? (byFirst.get(k) ?? []) : [])]);
    const owners = [...candidates].filter((m) => sharesClub(k, m));
    if (owners.length !== 1) continue;
    merge(k, owners[0]);
  }
  // 여러 토큰 이름이 더 긴 이름의 **뒷부분**이면 같은 사람이다("Zambo Anguissa" ⊂ "André-Frank Zambo Anguissa", "Van Dijk" ⊂
  // "Virgil van Dijk") — 매체마다 이름을 줄여 써서 같은 선수의 딜이 둘로 갈렸다(재실행). 긴 이름이 하나뿐이고 구단이 겹칠 때만 합친다.
  // 색인: 뒷부분(두 토큰 이상) → 그 뒷부분으로 끝나는 더 긴 이름들
  const bySuffix = new Map();
  for (const m of groups.keys()) {
    const t = tokens(m);
    for (let i = 1; i <= t.length - 2; i++) {
      const suffix = t.slice(i).join(" ");
      (bySuffix.get(suffix) ?? bySuffix.set(suffix, []).get(suffix)).push(m);
    }
  }
  for (const k of [...groups.keys()]) {
    if (tokens(k).length < 2 || !groups.has(k)) continue;
    const owners = (bySuffix.get(k) ?? []).filter((m) => m !== k && groups.has(m) && sharesClub(k, m));
    if (owners.length !== 1) continue;
    merge(k, owners[0]);
  }
  for (const list of groups.values()) list.sort((a, b) => ts(a) - ts(b) || a.id - b.id);
  return { groups, aliases };
}

/**
 * 표시할 영문명 — 가장 자주 쓰인 표기, 동률이면 긴 쪽(성만 쓴 행보다 풀네임).
 * ⚠ `rows`에 그 키의 표기가 하나도 없을 수 있다 — 줄여 쓴 이름("Van Dijk")·첫 토큰("Estevao")이 합쳐진 묶음에서 풀네임 보도가
 *   전부 "이동 아님"으로 빠지면 남은 행은 키와 다른 표기뿐이다. 그때 예외를 던지면 파생 전체가 멈춰 딜 저장·채점·알림이 매시 빠졌다 →
 *   거르기 전의 묶음(`fallbackRows` — 그 키를 낳은 행이 반드시 있다)에서 고르고, 그래도 없으면 키 자체를 쓴다.
 */
function displayName(rows, key, fallbackRows = rows) {
  const pick = (list) => {
    const count = new Map();
    for (const r of list) {
      for (const p of playersOf(r)) {
        const n = normalizePlayer(p);
        if (n === key || (tokens(n).length === 1 && tokens(key).at(-1) === n)) count.set(p, (count.get(p) ?? 0) + 1);
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1] || tokens(normalizePlayer(b[0])).length - tokens(normalizePlayer(a[0])).length || b[0].length - a[0].length)[0]?.[0] ?? null;
  };
  return pick(rows) ?? pick(fallbackRows) ?? key;
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

/** 관심 구단 순위에서 보도가 그 구단을 **행선지로** 적은 표 — 관심 구단 목록에 든 것(1)보다 크다 */
const SUITOR_DEST_VOTE = 2;

/**
 * 행선지 밖의 관심 구단을 **유력한 순**으로 — 화면의 TO 목록이 이 순서(`transfer_deal_suitor.position`)로 그린다.
 * 구단 **목록**은 판정이 관심 구단으로 적은 구단(`verdict_suitors`)이고, 이 함수는 그 순서만 정한다.
 *
 * 1. 표: 관심 구단으로 적은 판정 1표 + 그 구단을 행선지로 적은 판정 `SUITOR_DEST_VOTE`표, 최신 보도는 2배(`resolveDirection`과 같은 가중).
 * 2. 동률이면 보도 안에서 먼저 적힌 구단(평균 자리). 판정자는 원문의 언급 순으로 적는데(`judge.mjs` 지시문), 이적 기사는 앞선 구단을
 *    먼저 쓴다. 표만 세면 한 기사가 일곱 구단을 나열하는 흔한 형태에서 전부 동률이라 순서가 나열의 우연이 됐다(운영: 누사 딜).
 * 3. 그래도 같으면 가장 최근에 언급된 구단, 마지막으로 이름순(실행마다 같은 순서 — 순서가 흔들리면 자식 행을 매번 다시 쓴다).
 *    이름은 코드포인트로 비교한다 — `localeCompare`는 실행 환경의 로케일을 타 로컬과 원격 실행의 순서가 갈릴 수 있다.
 *
 * ⚠ 행선지 표는 **목록에 이미 든 구단의 순위에만** 더한다 — 행선지로만 적히고 딜의 행선지 투표에서 진 구단을 목록에 새로 넣으면
 *   출발·행선지 충돌로 버린 구단이 되살아나고, 오피셜 딜의 TO에 옛 루머 구단이 붙고, 그 구단의 응원 팬에게 알림이 간다.
 * ⚠ 결렬·부인 보도의 행선지는 표가 아니다 — "관심 없다"고 부인한 구단이 유력한 쪽으로 올라간다. 그 보도가 적은 관심 구단은
 *   센다(지시문이 "이 글이 지금 관심을 보인다고 말하는 구단만" 적게 한다).
 * ⚠ 출처의 공신력은 보지 않는다 — 등급의 단일 소스(`reporters.json`)를 읽는 판정이 화면(TS) 쪽에만 있어 여기서 다시 짜면 갈린다.
 */
function rankSuitors(items, key) {
  const stats = new Map();
  const destVotes = new Map();
  const last = items.at(-1);
  for (const it of items) {
    if (verdictOf(it.row, key) !== "move") continue;
    const w = it === last ? 2 : 1;
    (it.row.verdict_suitors ?? []).forEach((club, slot) => {
      const s = stats.get(club) ?? { votes: 0, slots: 0, mentions: 0, lastTs: 0 };
      s.votes += w;
      s.slots += slot;
      s.mentions += 1;
      s.lastTs = Math.max(s.lastTs, ts(it.row));
      stats.set(club, s);
    });
    const to = it.row.verdict_to;
    if (to && !isDead(it.stage)) destVotes.set(to, (destVotes.get(to) ?? 0) + SUITOR_DEST_VOTE * w);
  }
  for (const [club, votes] of destVotes) {
    const s = stats.get(club);
    if (s) s.votes += votes;
  }
  const slot = (s) => s.slots / s.mentions;
  const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...stats.entries()]
    .sort(([ca, a], [cb, b]) => b.votes - a.votes || slot(a) - slot(b) || b.lastTs - a.lastTs || byName(ca, cb))
    .map(([club]) => club);
}

/**
 * 대표 단계 — 진전 최대. 단 **가장 나중 보도가 죽은 보도(결렬·부인)면** 죽은 단계다(그 뒤에 살아 있는 보도가 다시 나오면
 * 되살아난 것이라 그 뒤 보도의 진전 최대다). 공식 발표는 뒤집히지 않는다.
 * 결렬과 부인은 **이력**으로 가른다 — 협상(talks) 이상까지 갔던 딜이 죽으면 결렬, 관심·루머까지였으면 부인(문형이 "collapsed"라도
 * 우리가 본 이력에 협상이 없었으면 그 보도의 문형을 따른다). 죽은 보도만 있으면 결렬 문형이 하나라도 있을 때 결렬, 아니면 부인.
 */
function resolveStage(items) {
  const progressed = items.filter((it) => !isDead(it.stage));
  if (!progressed.length) return items.some((it) => it.stage === "collapsed") ? "collapsed" : "denied";
  const top = (list) => list.reduce((best, it) => (RANK.indexOf(it.stage) >= RANK.indexOf(best.stage) ? it : best), list[0]);
  const best = top(progressed);
  if (best.stage === "official") return "official";
  const dead = items.filter((it) => isDead(it.stage));
  if (!dead.length) return best.stage;
  const lastDead = dead.reduce((a, b) => (ts(b.row) >= ts(a.row) ? b : a));
  // 죽은 보도 **뒤에** 살아 있는 보도가 다시 나오면 되살아난 이적설이다 — 그 뒤의 보도로 단계를 정한다. 보도가 많은 딜에서
  // 중간의 부인 한 건(한 구단의 "관심 없다")이 그 뒤로 이어진 루머 열 건을 덮어 딜이 "결렬"이 됐다(재실행: 보도 14건 중 부인 2건).
  const revived = progressed.filter((it) => ts(it.row) > ts(lastDead.row));
  if (revived.length) return top(revived).stage;
  if (RANK.indexOf(best.stage) >= RANK.indexOf("talks")) return "collapsed";
  return dead.some((it) => it.stage === "collapsed" && ts(it.row) > ts(best.row)) ? "collapsed" : "denied";
}

/** 결과가 정해진 단계 — 예측 투표가 닫히고(DB 트리거) 채점이 "성사"로 보는 단계 */
const SETTLED = new Set(["here_we_go", "official"]);

/**
 * 단계가 그대로여도 **결과가 난 딜의 형태가 바뀌면** 소식이다(`writeDeals`의 변화 목록) — 진행 중 임대의 설명으로 조용히 오피셜이 된 딜
 * (문맥 보도 — 알리지 않는다)에 완전 영입 전환 오피셜이 오면 단계가 오피셜 → 오피셜이라 그 소식이 영영 나가지 않았다.
 * ⚠ 저장된 형태가 있을 때만 센다 — 형태 컬럼이 처음 채워지는 실행(모름 → 임대)은 소식이 아니다(그날 결과 난 임대 딜 전부가 알림이 된다).
 * @param {{ stage: string, form?: string | null } | null} prev 저장된 딜
 * @param {{ stage: string, form: string | null }} next 새로 쓴 딜
 */
export function isSettledFormChange(prev, next) {
  return prev != null && prev.stage === next.stage && SETTLED.has(next.stage) && prev.form != null && next.form != null && prev.form !== next.form;
}

/**
 * 결과가 정해진 시각(`transfer_deal.settled_at`) — 딜 단계가 합의 완료·오피셜일 때만 값이 있다.
 * 보도를 시간순으로 훑어 **마지막 결렬·부인 뒤로 처음 나온** 합의 완료·오피셜 보도의 게시 시각이다(되살아난 딜은
 * 되살아난 뒤의 시각). 오피셜 보도를 본 뒤의 결렬·부인은 무시한다 — 오피셜은 뒤집히지 않는다(`resolveStage`와 같은 판정).
 * ⚠ 수집 시각이 아니라 **게시 시각**이다 — 예측 채점이 이 시각 이후에 던진 표를 빼므로, 파이프라인 지연(최대 1시간) 사이에
 *   소식을 보고 던진 표가 적중으로 세어지지 않는다.
 */
function resolveSettledAt(items, stage) {
  if (!SETTLED.has(stage)) return null;
  const sorted = [...items].sort((a, b) => ts(a.row) - ts(b.row));
  let since = null;
  let official = false;
  for (const it of sorted) {
    if (SETTLED.has(it.stage)) {
      if (since === null) since = ts(it.row);
      if (it.stage === "official") official = true;
    } else if (isDead(it.stage) && !official) since = null;
  }
  // 폴백 — 판정 이력과 대표 단계가 갈린 드문 경우(합의 완료 보도 뒤에 결렬만 있는데 대표가 합의 완료)는 첫 합의 완료·오피셜 보도.
  // 그런 보도가 하나도 없으면 null이다(아래 `settledAtFor`) — 아무 보도의 시각이나 지으면 결과 시각을 꾸며 내는 것이다
  if (since === null) {
    const first = sorted.find((it) => SETTLED.has(it.stage));
    if (!first) return null;
    since = ts(first.row);
  }
  return new Date(since).toISOString();
}

/**
 * 판정 커버리지가 다 차지 않은 딜의 단계 — **진전은 곧바로, 후퇴는 미룬다.** 판정이 몇 건씩 도착하는 동안(실행당 상한) 먼저 도착한
 * 판정만으로 단계가 내려가면, 다음 실행에 나머지가 도착해 다시 올라가며 단계가 왕복하고 그때마다 알림이 나간다.
 * 후퇴 = 살아 있던 단계가 죽은 단계(결렬·부인)로 가거나, 살아 있는 단계끼리 진전 순위가 내려가는 것. 그때는 저장된 단계를 둔다.
 * 죽은 단계에서 살아나는 것(되살아난 이적설)과 죽은 단계끼리의 바뀜은 그대로 반영한다. 커버리지가 차면 판정대로 간다.
 */
export function holdStage(next, storedStage) {
  if (!storedStage || storedStage === next || isDead(storedStage)) return next;
  if (isDead(next)) return storedStage;
  return RANK.indexOf(next) < RANK.indexOf(storedStage) ? storedStage : next;
}

/**
 * 결과 시각 — 판정 커버리지가 다 차지 않은 동안은 **저장된 값을 지킨다**(딜이 여전히 합의 완료·오피셜일 때). 판정이 한 건씩 도착하며
 * 시각이 생겼다 사라지거나 움직이면 예측 채점·순위가 시간마다 흔들렸다. 커버리지가 차면 보도로 다시 정한다(순수 — 도착 순서와 무관).
 * @param {{ settled_at?: string | null } | null} stored 커버리지가 차지 않았을 때만 넘긴다
 */
function settledAtFor(items, stage, stored, reported = items) {
  if (!SETTLED.has(stage)) return null;
  if (stored?.settled_at) return new Date(Date.parse(stored.settled_at)).toISOString();
  /*
   * 저장된 딜이 오피셜인데 결과 시각이 비어 있는 옛 데이터 — 커버리지가 덜 차 단계는 `holdStage`가 지켰지만 판정받은 보도에는 합의 완료·
   * 오피셜이 없을 수 있다. 그때는 **판정 전 보도까지**(규칙 단계) 보고 합의 완료·오피셜 보도의 시각을 쓰고, 그것도 없으면 null이다.
   * DB CHECK(`transfer_deal_settled_stage`)는 "결과 시각이 있으면 단계가 합의 완료·오피셜"만 요구해 null을 받는다. 가장 이른 루머의
   * 시각을 지으면 예측 채점이 그 뒤의 표를 전부 "결과 뒤의 표"로 빼고 그 앞의 표를 적중으로 센다 — 없는 사실을 만드는 쪽이다.
   * null은 "모른다"이고 커버리지가 차면 보도로 다시 정해진다.
   */
  if (stored) return resolveSettledAt(items, stage) ?? resolveSettledAt(reported, stage);
  return resolveSettledAt(items, stage);
}

/** 서로 다른 출처로 치는 "이동" 판정의 수 — 확인되지 않은 선수의 딜을 여는 조건(`canOpenUnverified`) */
const UNVERIFIED_MIN_SOURCES = 2;
/**
 * 확인되지 않은 선수(사람 사전·위키데이터에 없다)의 딜을 열 수 있는가. 유스·10대 선수는 위키데이터에 항목이 없어 관문에 막히는데
 * 실제 이적이고 이목도 끈다(리버풀 → 맨유의 16세, 운영에서 오피셜 4건이 막혀 있었다). 판정자의 "이동" 판정이
 * - **완료·확정**(official · here_we_go)이거나
 * - **서로 다른 출처 두 곳 이상**에서 나왔으면 연다.
 * 이름은 두 토큰 이상이어야 한다(한 토큰 이름은 누구인지 특정할 수 없다 — 사람 사전이 맡는다). 규칙이 지어낸 이름("South American
 * star")은 판정자가 이동으로 읽지 않거나 한 출처에 그친다.
 */
function canOpenUnverified(items, key) {
  if (tokens(key).length < 2) return false;
  const moves = items.filter((it) => verdictOf(it.row, key) === "move");
  if (moves.some((it) => it.row.verdict_stage === "official" || it.row.verdict_stage === "here_we_go")) return true;
  return new Set(moves.map((it) => it.row.source_id)).size >= UNVERIFIED_MIN_SOURCES;
}

/*
 * ── 같은 보도를 옮긴 두 매체 — 판정 뒤에 접는다 ────────────────────────────
 * `dedupeRows`는 판정 전 신호(URL · 본문 앞 180자)로만 같은 보도를 안다. 가십 칼럼 둘(BBC 가십 · 스카이 신문 요약)이 같은 빌트
 * 보도를 **다른 문장으로** 옮기면 본문이 달라 두 행이 되고, 딜의 타임라인에 같은 소식이 두 줄로 나오고 보도 수가 부푼다(운영 — 콴사:
 * 보도 20391·20418, 판정 요약까지 같다). 판정이 난 뒤에는 판정자가 두 글을 같은 말로 읽었다는 신호가 생긴다 — 그것으로 접는다.
 *
 * 같은 선수의 "이동" 판정 두 건이 **게시 48시간 안**이고 **판정 단계가 같고** 아래 중 하나면 한 보도다(`isEcho` · `foldEchoes`):
 *   a. 한국어 요약이 같다(공백·끝 문장부호만 접는다 · `ECHO_SUMMARY_MIN`자 이상) — 판정자는 같은 사실을 같은 문장으로 쓴다. 다른 사실이면 요약이 갈린다.
 *   b. 두 행 다 **같은 신문을 인용한** 가십 항목(`attribution = 'cited'`, `attributed_to`가 같다)이고 판정 필드(단계·출발·행선지·
 *      관심 구단·금액)가 전부 같다 — 같은 신문의 같은 이적설을 두 칼럼이 옮긴 것이다.
 *   c. 근거 구절이 같다(40자 이상) — 원문에서 같은 문장을 인용했다.
 * 대표는 **원보도(인용이 아닌 행)**, 그다음 먼저 게시된 행, 같으면 id가 작은 행이다. 접힌 행은 딜의 보도 수·방향·단계·금액에 들지 않고
 * **딜에 배정되지 않는다**(화면의 타임라인은 `deal_id`로 그리므로 한 줄만 남는다). 다만 접힌 행의 게시 시각은 딜의 첫·최근 보도 시각에
 * 든다 — 줄이는 것은 보도 수뿐이다(같은 소식이 다시 나왔다는 것은 사실이고, 알림의 나이 판정도 최근 보도 시각을 본다).
 * 행은 지우지 않는다 — 파생에서만 접는다.
 * ⚠ 공신력 등급(`reporters.json`의 `credibility`)으로 대표를 고르지 않는다 — 등급 판정(`credibilityOf`)은 화면(TS)이 단독으로 갖는다
 *   (`api-and-db.md`). 인용(cited)과 원보도의 구분은 행의 컬럼이라 여기서 갈라도 갈리지 않는다.
 * ⚠ 위험 — 서로 다른 매체가 **따로** 같은 사실을 보도해도 요약이 같으면 접힌다(보도 수가 하나 준다). 짧은 요약("X가 Y의 관심을 받고
 *   있다")일수록 그렇다 — 그래서 48시간으로 묶는다. 출처 수를 세는 관문(`canOpenUnverified`)도 접힌 뒤의 행으로 센다.
 */
const ECHO_WINDOW_MS = 48 * HOUR_MS;
const ECHO_EVIDENCE_MIN = 40;
/** 요약 대조의 하한(코드포인트) — 아주 짧은 요약("X가 이적한다")은 다른 보도끼리도 같다. 운영 요약은 1~2문장(수십 자)이다 */
const ECHO_SUMMARY_MIN = 20;
const normSummary = (s) => String(s).normalize("NFC").replace(/\s+/gu, " ").replace(/[.。!?\s]+$/u, "").trim();
const judgedFields = (r) => JSON.stringify([r.verdict_stage ?? null, r.verdict_from ?? null, r.verdict_to ?? null, [...(r.verdict_suitors ?? [])].sort(), r.verdict_fee_amount == null ? null : Number(r.verdict_fee_amount), r.verdict_fee_currency ?? null]);
const citedOutlet = (r) => (r.attribution === "cited" && r.attributed_to ? normalizeQuote(r.attributed_to) : null);

/** 두 판정 행이 같은 보도를 옮긴 것인가(위 a~c). 같은 선수의 "이동" 판정끼리만 부른다 */
function isEcho(a, b) {
  if (Math.abs(ts(a) - ts(b)) > ECHO_WINDOW_MS) return false;
  // 단계가 다르면 같은 보도가 아니다 — 요약·근거가 같아도 한쪽이 더 진전된 판정이면 접는 순간 그 판정이 사라진다.
  // 형태도 같아야 한다 — 진행 중 임대의 설명(문맥 보도)과 임대 발표를 접으면 사건이 사라진다
  if ((a.verdict_stage ?? null) !== (b.verdict_stage ?? null)) return false;
  if ((a.verdict_form ?? null) !== (b.verdict_form ?? null)) return false;
  const sa = a.summary_ko ? normSummary(a.summary_ko) : "";
  if ([...sa].length >= ECHO_SUMMARY_MIN && sa === (b.summary_ko ? normSummary(b.summary_ko) : "")) return true;
  const outlet = citedOutlet(a);
  if (outlet && outlet === citedOutlet(b) && judgedFields(a) === judgedFields(b)) return true;
  const ea = a.verdict_evidence ? normalizeQuote(a.verdict_evidence) : "";
  return ea.length >= ECHO_EVIDENCE_MIN && ea === (b.verdict_evidence ? normalizeQuote(b.verdict_evidence) : "");
}

/**
 * 한 선수의 보도 항목에서 같은 보도를 옮긴 행을 접는다 — 대표만 남긴 항목, 접힌 항목, 접힌 행 수.
 * ⚠ **대표와 직접** 같은 보도인 행만 접는다(연쇄 금지). 서로 닮은 행을 이어 묶으면 0·40·80·120시간의 같은 요약 네 건이 한 덩어리가
 *   되어 닷새에 걸친 보도가 한 건으로 줄었다(48시간 창이 무의미해진다). 그래서 가장 나은 행을 대표로 세우고 그 대표와 같은 보도인
 *   행만 접은 뒤, 남은 행에서 다시 대표를 세운다.
 * @template {{ row: object }} T
 * @param {T[]} items
 * @returns {{ kept: T[], dropped: T[], folded: number }}
 */
export function foldEchoes(items, key) {
  const moves = items.filter((it) => verdictOf(it.row, key) === "move");
  if (moves.length < 2) return { kept: items, dropped: [], folded: 0 };
  const rank = (it) => [it.row.attribution === "cited" ? 1 : 0, ts(it.row), it.row.id];
  const order = (a, b) => {
    const [x, y] = [rank(a), rank(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  };
  let rest = [...moves].sort(order);
  const dropped = new Set();
  while (rest.length > 1) {
    const [rep, ...others] = rest;
    const echoes = others.filter((it) => isEcho(rep.row, it.row));
    for (const it of echoes) dropped.add(it);
    rest = others.filter((it) => !echoes.includes(it));
  }
  return { kept: items.filter((it) => !dropped.has(it)), dropped: items.filter((it) => dropped.has(it)), folded: dropped.size };
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
 * 구단 표(`transfer_club`)에 쓸 행 — 이번 파생에 나온 구단 + **표시 프리셋의 구단 전부**.
 *
 * 응원 구단(`transfer_club_follow`)이 이 표를 FK로 잡고, 고르는 화면이 5대 리그 구단을 이 표에서 읽는다 — 딜이 아직 없는
 * 구단도 고를 수 있어야 한다(그 구단의 첫 딜을 알리는 것이 응원 구단의 쓸모다). 값이 그대로인 행은 쓰지 않으므로
 * (`writeDeals`) 매시 비용은 조회 한두 번이다.
 * ⚠ 같은 코드가 양쪽에 있으면 파생에 나온 쪽을 쓴다 — 둘 다 `clubRecord`가 만든 같은 값이라 차이가 없지만, 딜이
 *   가리키는 행이 이번 파생의 값이라는 것을 순서로 못박아 둔다.
 */
export function clubRowsToWrite(derivedClubs, names = createNameBook()) {
  const byCode = new Map();
  for (const canonical of presetClubs()) {
    const club = clubRecord(canonical, names);
    if (club) byCode.set(club.code, club);
  }
  for (const club of derivedClubs) byCode.set(club.code, club);
  return [...byCode.values()];
}

/**
 * @param {object[]} rows  transfer_news 행(id, source_id, stage, players, body, published_at, relevance, verdict*, summary_ko)
 * @param {{ nowMs: number, windows?: object[], names?: ReturnType<typeof createNameBook>, memo?: ReturnType<typeof createExtractMemo>,
 *   requireVerified?: boolean, requireVerdict?: boolean, upgradeVerdicts?: boolean, rejudge?: boolean, rejudgeStalePrompt?: string | null, loanOnly?: boolean,
 *   existingKeys?: Set<string> | Map<string, { stage: string, settled_at: string | null, form?: string | null, loan_clause?: string | null }>, judgeLimit?: number }} opts
 *   `requireVerified`: 확인된 선수(`names.isVerifiedPlayer`)의 딜만 만든다 — 판정과 함께 켜면 `canOpenUnverified`가 예외를 연다.
 *     운영 실행(`runDerivation`)이 켠다.
 *   `requireVerdict`: LLM 판정(`judge.mjs`)을 관문으로 쓴다 — "이동 아님" 보도는 딜에서 빼고, **새 딜**은 "이동"
 *     판정이 한 건 이상 있어야 연다. `existingKeys`(이미 저장된 딜 키)에 있는 딜은 판정이 없어도 둔다(판정이 멎어도
 *     보드가 비지 않게). 운영 실행이 켠다. `rejudge`면 저장된 판정이 있어도 전부 다시 묻는다.
 *   `upgradeVerdicts`: 원출력이 없는 옛 형식의 "이동" 판정을 한 번 다시 묻는다(시점·금액을 읽기 전의 판정). 운영 실행이 켠다.
 *   `rejudgeStalePrompt`: 지금 지시문의 지문(`judgeFingerprint`) — 주어지면 판정 행의 `verdict_prompt`가 다른 행을 다시 묻는다.
 *   `loanOnly`: `rejudgeStalePrompt`와 함께 — 그중 임대를 말하는 보도만(`mentionsLoan`) 다시 묻는다.
 *   `existingKeys`: 저장된 딜 — `Map(deal_key → { stage, settled_at })`이면 판정이 덜 찬 딜의 단계 후퇴·결과 시각을 저장된 값으로 지킨다
 *     (`holdStage`·`settledAtFor`). `Set`(키만)이면 지키지 않는다.
 *   `judgeLimit`: 실행당 판정 상한(기본 `JUDGE_MAX_PER_RUN`) — 탐색용 몫(상한의 1/3)을 정하는 데 쓴다(`orderJudgeNeeds`).
 *   `names`가 없으면 사람이 고친 JSON만으로 만든 사전을 쓴다(자동 캐시 없음 — 테스트가 이 경로다).
 *   `memo`가 없으면 이 호출 안에서만 쓰는 메모를 만든다.
 * @returns {{ deals: object[], clubs: object[], assignments: Map<number, string>, nameNeeds: object[], judgeNeeds: object[], warnings: string[], skipped: Record<string, number>, startMs: number }}
 *   `judgeNeeds`는 LLM에 물어야 할 보도(행 id · 선수 키 · 표시 이름 · 원문 · 언급된 구단 · 게시 시각 · 방식 `mode` · 옛 판정 `prev` ·
 *     `priority`) — 5대 리그 구단이 걸린 딜의 행(확인되지 않은 두 토큰 이상 이름 포함)과 선수 없이 묻는 행(규칙이 선수를 못 뽑았거나
 *     넓힌 후보)이다. **우선순위로 정렬돼 있다**(`orderJudgeNeeds`) — 호출부는 앞에서 상한만큼 자른다.
 *   `repeatedFailures`는 판정 없이 연달아 `REPEATED_FAILURE_ATTEMPTS`번 이상 실패한 대표 행 수다.
 *   `nameNeeds`는 딜마다 선수 키·구단 정규명 — 이름 사전에서 빠진 것을 찾는 데 쓴다(저장하지 않는다).
 */
/**
 * 판정이 읽은 구단 이름을 **지금의** 구단 사전으로 다시 맞춘다(`canonicalClubName`). 판정은 그날의 사전으로 정규화돼 저장되므로,
 * 별칭을 더해도 옛 행은 옛 이름("Hull")으로 남아 같은 구단이 두 코드로 갈린다 — 여기서 맞추면 다음 파생이 곧바로 바로잡는다
 * (원출력 재생 없이). 같은 구단으로 접힌 관심 구단은 하나만 남긴다. 행은 고치지 않고 사본을 돌려준다.
 */
function withCanonicalVerdictClubs(r) {
  const canon = (c) => (c ? canonicalClubName(c) : c);
  const suitors = r.verdict_suitors ? [...new Set(r.verdict_suitors.map(canon))] : r.verdict_suitors;
  return {
    ...r, verdict_from: canon(r.verdict_from), verdict_to: canon(r.verdict_to), verdict_suitors: suitors,
    verdict_loan_owner: canon(r.verdict_loan_owner ?? null), verdict_loan_club: canon(r.verdict_loan_club ?? null),
  };
}

/**
 * 딜의 형태 — **사건 보도**(문맥 보도 제외)의 판정 형태로 투표한다(최신 보도 2배, 동률이면 최신 보도의 형태). 형태를 읽은 판정이
 * 하나도 없으면 문맥 보도가 있을 때 임대(진행 중인 임대가 있다는 것은 임대가 성사됐다는 뜻이다), 아니면 null(모른다 — 화면은 표지를 그리지 않는다).
 * ⚠ 형태를 묻기 전의 옛 판정(null)은 표가 아니다 — 완전 이적으로 세면 임대를 다시 물은 보도가 옛 판정들에 묻힌다.
 */
function resolveForm(events, context, key) {
  const votes = new Map();
  const latest = new Map();
  const last = events.at(-1);
  for (const it of events) {
    const f = formOf(it.row, key);
    if (!f || f === "loan_standing") continue;
    votes.set(f, (votes.get(f) ?? 0) + (it === last ? 2 : 1));
    latest.set(f, Math.max(latest.get(f) ?? 0, ts(it.row)));
  }
  if (!votes.size) return context.length ? "loan" : null;
  return [...votes.entries()].sort(([fa, a], [fb, b]) => b - a || latest.get(fb) - latest.get(fa))[0][0];
}

/**
 * 지금의 사건 — 선수당 딜이 하나라 한 창 안의 두 사건(임대 조기 복귀 오피셜 → 완전 이적 합의, 완전 이적 루머 → 임대 오피셜)이 한 딜에 섞인다.
 * 섞인 채 단계를 정하면 "오피셜은 뒤집히지 않는다"에 걸려 새 사건이 앞 사건의 오피셜로 굳거나, 새 사건의 진전이 묻힌다.
 * 형태를 읽은 **가장 최근 사건 보도의 형태**를 지금의 사건으로 보고, 그 형태로 바뀐 시점(다른 형태의 마지막 보도) 뒤의 보도만 쓴다 —
 * **건수 투표가 아니라 시간 순서**다(완전 이적 루머 4건 뒤의 임대 오피셜 1건이 지금의 사건이다).
 * 판정이 한 번 흔들린 것을 전환으로 읽지 않게 완충을 둔다 — 전환은 새 형태의 보도가 둘 이상이거나, 새 구간의 단계가 앞 구간보다 진전했거나
 * 같거나, 앞 사건이 이미 결과가 났을 때(합의 완료·오피셜)만이다. 아니면 `null`(사건이 하나다 — 전부 쓰고 형태는 투표).
 * @returns {{ items: object[], form: string } | null}
 */
function currentEvent(events, key) {
  const formed = events.filter((it) => formOf(it.row, key)).sort((a, b) => ts(a.row) - ts(b.row));
  if (!formed.length) return null;
  const form = formOf(formed.at(-1).row, key);
  // 경계는 지금 형태의 마지막 보도보다 **먼저** 나온 다른 형태의 보도다 — 같은 시각에 다른 형태로 나온 보도는 순서를 말할 수 없어
  // 새 구간에 함께 둔다. 같은 시각의 보도를 경계로 삼으면 새 구간이 비어, 딜에 쓸 보도가 없어 기존 딜이 통째로 사라졌다
  const lastTs = ts(formed.at(-1).row);
  const lastOther = formed.findLast((it) => formOf(it.row, key) !== form && ts(it.row) < lastTs);
  if (!lastOther) return null;
  const cut = ts(lastOther.row);
  const before = events.filter((it) => ts(it.row) <= cut);
  const after = events.filter((it) => ts(it.row) > cut);
  const oldStage = resolveStage(before);
  const newStage = resolveStage(after);
  const switched = after.filter((it) => formOf(it.row, key) === form).length >= 2 || RANK.indexOf(newStage) >= RANK.indexOf(oldStage) || SETTLED.has(oldStage);
  return switched ? { items: after, form } : null;
}

/**
 * 판정 행 중 가장 최근의 값 — 임대 상태·조항은 지금의 사실이라 최신 보도를 따른다. 형태까지 읽은 판정(`verdict_form`이 있다)이 값을
 * 비웠으면 "지금은 아니다"라는 답이라 거기서 멈춘다 — 건너뛰면 복귀한 선수에게 옛 임대 구단이 남아 화면이 "빌라 임대 중"을 그리고
 * 그 구단 팬에게 알림이 간다. 형태를 묻기 전의 옛 판정은 그 필드를 물은 적이 없어 건너뛴다.
 */
function latestJudged(items, key, pick) {
  for (const it of [...items].sort((a, b) => ts(b.row) - ts(a.row))) {
    if (verdictOf(it.row, key) !== "move") continue;
    const v = pick(it.row);
    if (v != null) return v;
    if (it.row.verdict_form != null) return null;
  }
  return null;
}

export function deriveDeals(rows, opts) {
  const windows = opts.windows ?? loadWindows();
  const names = opts.names ?? createNameBook({ players: loadPlayerDictionary(), clubs: loadGlossary().clubs });
  const startMs = derivationStartMs(opts.nowMs, windows);
  const memo = opts.memo ?? createExtractMemo();
  const modeOpts = { rejudge: Boolean(opts.rejudge), upgrade: Boolean(opts.upgradeVerdicts), stalePrompt: opts.rejudgeStalePrompt ?? null, loanOnly: Boolean(opts.loanOnly) };
  // 저장된 딜 — Set(키만 — 테스트·옛 호출부)이든 Map(키 → { stage, settled_at })이든 받는다. 저장된 값은 Map일 때만 있다
  const existing = opts.existingKeys ?? new Set();
  const storedDeal = (k) => (existing instanceof Map ? (existing.get(k) ?? null) : null);
  const warnings = [];
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };

  // 같은 보도는 대표 한 행만 본다(나머지는 딜에 묶이지 않고 판정·요약 대상도 아니다)
  const { reps, duplicates } = dedupeRows(rows.map(withCanonicalVerdictClubs));
  if (duplicates) skipped["중복 보도"] = duplicates;
  const candidates = reps.filter((r) => {
    if (isCandidate(r, startMs) || isSoftCandidate(r, startMs)) return true;
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
    // "이동 아님"으로 끝난 행은 지시문이 바뀌었거나(`--rejudge-stale`) 본문 없이 났을 때만 다시 묻는다(`judgeMode`가 가른다)
    const mode = opts.requireVerdict ? judgeMode(r, r.verdict_player ?? null, opts.nowMs, modeOpts) : null;
    if (mode && [...mentioned].some(isTopLeague) && (verdictOf(r, r.verdict_player) !== "not_move" || modeOpts.stalePrompt || r.verdict_article_chars === 0)) {
      judgeNeeds.push(judgeNeed(r, { playerKey: null, player: null, clubs: [...mentioned], mode, tier: JUDGE_TIER.explore }));
      skip("선수 없음(판정 대기)");
    } else skip("선수 없음");
  }

  const { groups: byPlayer, aliases } = groupByPlayer(named, names);
  for (const [key, grouped] of byPlayer) {
    /*
     * 딜 키 — 묶음 키의 것이 기본이다. ⚠ 묶음이 **다른 키를 흡수했고 그 키의 딜이 저장돼 있으면** 그 딜을 잇는다(묶음 키의 딜이
     *   이미 있으면 그쪽이 먼저다). 사전의 "Estevao" 딜에 "Estevao Willian" 보도가 한 건 들어오면 묶음 키가 긴 이름이 되는데, 그대로
     *   새 키를 쓰면 옛 딜은 보도가 끊겨 지워지고(관심은 cascade) 새 딜이 "새 이적설"로 다시 알려졌다. 판정은 여전히 묶음 키로 찾는다.
     */
    const absorbed = [...(aliases.get(key) ?? [])].sort();
    const ownKey = existing.has(dealKey(key)) ? key : (absorbed.find((k) => existing.has(dealKey(k))) ?? key);
    const groupDealKey = dealKey(ownKey);
    // LLM이 "이 선수의 이동이 아니다"라고 한 보도는 딜에서 뺀다 — 단계·이적료·방향에도 들어가지 않는다
    let group = grouped;
    if (opts.requireVerdict) {
      group = grouped.filter((r) => verdictOf(r, key) !== "not_move");
      /*
       * "이동 아님" 보도도 다시 물을 때가 있다 — 지시문이 바뀌었거나(`--rejudge-stale`·`--rejudge`) 매체 기사 본문 없이 난 판정이다
       * (발췌만 보고 "이동 아님"이 영구히 남지 않게). 그 행은 딜에 들지 않으니 여기서 따로 넘긴다(5대 리그 구단이 걸린 것만).
       */
      let groupedName = null; // 묶음 전체의 표시 이름 — 행마다 다시 세지 않는다
      for (const r of grouped.filter((x) => verdictOf(x, key) === "not_move")) {
        const mode = judgeMode(r, key, opts.nowMs, modeOpts);
        const mentioned = mentionedClubs(memo.sentences(r));
        if (!mode || ![...mentioned].some(isTopLeague)) continue;
        groupedName ??= displayName(grouped, key);
        judgeNeeds.push(judgeNeed(r, { playerKey: key, player: groupedName, clubs: [...mentioned], mode, tier: existing.has(groupDealKey) ? JUDGE_TIER.existing : JUDGE_TIER.newDeal }));
      }
      for (let i = group.length; i < grouped.length; i++) skip("이동 아님(LLM 판정)");
      if (!group.length) continue;
    }
    const player = displayName(group, key, grouped);
    const surname = tokens(key).at(-1);
    const first = tokens(key)[0];
    // 풀네임 + 성(짧은 성 ≤2는 뺀다 — 다른 단어에 너무 자주 나온다) + 사람 사전에 있는 한 이름(브라질식 "Estevao")
    const alts = [mentionRe(player).source];
    if (tokens(key).length > 1 && surname.length > 2) alts.push(mentionRe(surname).source);
    if (tokens(key).length > 1 && names.playerInfo(first)) alts.push(mentionRe(first).source);
    const mentions = new RegExp(alts.join("|"), "iu");

    let items = [];
    for (const r of group) {
      // 문맥 보도(진행 중 임대의 설명)는 단계가 없다 — 규칙 단계로 떨어뜨리지 않는다(규칙은 "agreement"를 읽어 딜을 "합의 임박"으로 만들었다)
      const context = isContext(r, key);
      const stage = context ? null : stageFor(r, key, mentions, memo);
      if (!context && stage === "unknown") { skip("그 선수의 단계 없음"); continue; }
      const all = memo.sentences(r);
      const sentences = all.filter((s) => mentions.test(s));
      // 계약·이적료·주급은 추출기가 **그 선수 한 명만** 잡은 기사라면 기사 전체에서 읽는다 — 로마노는 둘째 문장을
      // "Former … centre back signs a one year deal until June 2027"처럼 이름 없이 쓴다
      const single = playersOf(r).every((p) => mentions.test(p));
      const storySentences = single ? all : sentences;
      items.push({ row: r, stage, context, sentences, storySentences, fee: feeFor(r, key, storySentences, memo) });
    }
    if (!items.length) continue;
    // 판정을 다시 물을 대상은 접기 전의 전 보도다 — 접힌 행도 판정 갱신(옛 형식·요약 재시도)은 받는다
    const reportedAll = items;
    // 같은 보도를 옮긴 두 매체는 판정 뒤의 신호로 한 보도로 접는다(`foldEchoes`) — 보도 수·배정·단계·방향·금액에서 대표 하나만 센다
    const echoes = foldEchoes(items, key);
    // 접힌 행의 게시 시각 — 보도 수에는 들지 않지만 첫·최근 보도 시각에는 든다(위 절)
    const echoTimes = echoes.dropped.map((it) => ts(it.row));
    if (echoes.folded) {
      skipped["같은 보도 인용(판정 뒤)"] = (skipped["같은 보도 인용(판정 뒤)"] ?? 0) + echoes.folded;
      items = echoes.kept;
    }
    /*
     * 판정받은 보도가 있는 딜은 **단계·방향·금액·관심 구단을 판정받은 보도만으로** 정한다. 아직 판정 전인 보도는 규칙이 읽은
     * 단계·금액·방향을 들고 있는데, 그 값이 판정받은 값을 덮는다 — 이름만으로 묶인 부상 기사의 "medical"이 루머 딜의 단계가 됐다.
     * 판정이 하나도 없는 딜(판정이 멎은 동안의 기존 딜)은 지금처럼 전부 쓴다.
     * ⚠ **보도 수·첫/최근 보도 시각·보도 배정은 "이동 아님"을 뺀 전 보도로** 센다(`reported`). 판정받은 보도만 세면 판정이 한 건씩
     *   도착할 때마다 보도 수와 최근 시각이 오르내렸다(판정 상한 60건이 실행마다 일부만 판정한다).
     */
    const reported = items;
    if (opts.requireVerdict && items.some((it) => verdictOf(it.row, key) === "move")) items = items.filter((it) => verdictOf(it.row, key) === "move");
    /*
     * 판정 커버리지 — 판정을 기다리는 보도(그 선수의 판정이 없고, 반복 실패로 포기하지 않은 것)가 남았는가. 남았으면 단계의 **후퇴**는
     * 미룬다(아래 `holdStage`) — 루머 10건 딜에 부인 1건만 먼저 판정되면 "부인" 알림이 나가고 다음 시간에 루머로 돌아왔다.
     */
    const awaiting = reported.some((it) => verdictOf(it.row, key) == null && (Number(it.row.verdict_attempts) || 0) < REPEATED_FAILURE_ATTEMPTS);
    /*
     * 사건 보도와 문맥 보도(진행 중 임대의 설명 — `isContext`)를 가른다. 단계·방향·결과 시각·확인 관문·같은 보도 접기는 사건 보도로 정하고,
     * 문맥 보도는 보도 수·배정(`reported`)과 임대 상태·조항·조항 금액에만 든다. 사건 보도가 없으면(문맥뿐) 방향은 문맥 보도로 읽고
     * 단계는 오피셜이다(진행 중인 임대가 있다는 것은 임대가 성사됐다는 뜻이다) — 그런 딜은 이미 있는 딜일 때만 남는다(아래 판정 관문).
     */
    const context = items.filter((it) => it.context);
    const events = items.filter((it) => !it.context);
    const contextOnly = !events.length;
    const stored = storedDeal(groupDealKey);
    /*
     * 문맥 보도만 판정됐는데 **판정을 기다리는 사건 보도**가 남은 기존 딜은 그 판정이 올 때까지 저장된 단계·결과 시각·형태·조항을 그대로 둔다
     * (양방향 동결). 문맥뿐으로 보면 그 사건(제3구단 루머)이 있는 딜에 오피셜을 지어내고, 판정 전 보도의 규칙 단계로 정하면 규칙이 읽은
     * "합의 완료"가 딜을 올려 알림까지 나간다(가르나초 사고와 같은 경로). 반복 실패로 포기한 보도는 기다리지 않는다.
     */
    const frozen = contextOnly && stored && reported.some((it) => !it.context && verdictOf(it.row, key) == null && (Number(it.row.verdict_attempts) || 0) < REPEATED_FAILURE_ATTEMPTS) ? stored : null;
    // 단계·방향·결과 시각은 지금의 사건(`currentEvent`)의 보도로 정한다 — 한 창 안의 두 사건이 한 딜에 섞인다
    const segment = contextOnly ? null : currentEvent(events, key);
    const form = frozen ? (frozen.form ?? null) : segment ? segment.form : resolveForm(events, context, key);
    items = contextOnly ? context : segment ? segment.items : events;
    // 임대 상태 — 보도 시점에 선수가 임대 중이면 보유 구단과 임대 구단(최신 판정). 문맥 보도까지 본다(지금의 사실이다)
    const allJudged = [...events, ...context];
    let loanOwner = latestJudged(allJudged, key, (r) => r.verdict_loan_owner);
    let loanClubName = latestJudged(allJudged, key, (r) => r.verdict_loan_club);
    const loanClause = frozen ? (frozen.loan_clause ?? null) : ["loan", "loan_convert", "loan_extend"].includes(form) ? latestJudged(allJudged, key, (r) => r.verdict_loan_clause) : null;

    const dir = resolveDirection(items, player, key);
    /*
     * 출발은 **선수를 보유한 구단**이다(조기 복귀만 임대 구단이 계약을 넘긴다). 판정이 보유 구단을 읽었으면 출발이 비었을 때 그 구단을 쓰고,
     * 임대 구단을 출발로 적은 옛 판정이 이겼으면(지시문이 "임대 중이면 임대로 뛰는 구단"이던 때) 보유 구단으로 바로잡는다
     * — 디 그레고리오의 볼로냐 이적설이 "본머스 → 볼로냐"로 나갔다(파는 쪽은 유벤투스).
     */
    if (loanOwner && form !== "loan_recall" && loanOwner !== dir.to && (!dir.from || (loanClubName && dir.from === loanClubName))) dir.from = loanOwner;
    /*
     * 출발 구단 폴백 — 보도가 소속을 말하지 않으면 사전의 현 소속(위키데이터 P54 캐시 — `names.currentClub`)을 쓴다.
     * 유명 선수의 출발이 "미확인"으로 뜨는 것은 기사가 소속을 굳이 적지 않아서다(케인 — 운영). 자유계약은 소속이 없고,
     * 행선지와 같은 구단은 이미 옮긴 뒤의 기록이라 쓰지 않는다. 보도가 소속을 말하면(규칙·LLM 표) 그쪽이 먼저다.
     */
    let usedFallback = false;
    // 출발을 위키데이터 캐시(현 소속·보유 구단)로 정했는가 — 그 캐시는 낡을 수 있어 재확인 대상이다(아래 `clubNeeds`)
    let usedClubCache = false;
    /*
     * 판정이 임대 상태를 읽지 못한 딜 — 위키데이터 캐시가 임대를 안다면(`names.ownerClub` — 현 소속 기록에 임대 한정자) 같은 바로잡기를 한다.
     * 출발이 비었거나 캐시의 현 소속(= 임대 구단)이면 보유 구단으로 바꾸고 임대 구단을 함께 둔다. 원소속 → 현 임대 구단 전환설은
     * 현 소속이 행선지와 같아 출발이 비던 자리다. 조기 복귀는 임대 구단이 계약을 넘기는 쪽이라 바꾸지 않는다.
     */
    const cachedOwner = loanOwner || dir.isFree || form === "loan_recall" ? null : names.ownerClub(key);
    if (cachedOwner && cachedOwner !== dir.to) {
      const cachedCurrent = names.currentClub(key);
      if (!dir.from || dir.from === cachedCurrent) {
        if (!dir.from) usedFallback = true;
        usedClubCache = true;
        dir.from = cachedOwner;
        loanOwner = cachedOwner;
        loanClubName ??= cachedCurrent;
      }
    }
    // 임대 중인 선수의 현 소속(위키데이터)은 임대 구단일 수 있다 — 임대 상태를 아는 딜에는 쓰지 않는다(보유 구단은 위에서 채웠다)
    if (!dir.from && !dir.isFree && !loanClubName) {
      const current = names.currentClub(key);
      if (current && current !== dir.to) {
        dir.from = current;
        usedFallback = true;
        usedClubCache = true;
      }
    }
    // 재계약·첫 프로 계약 표현이 있고 **옮긴다는 표현이 하나도 없으면** 이적이 아니다("first professional contract" 공지,
    // "Napoli reach agreement to extend X contract"처럼 소속 구단이 행선지로 읽히는 재계약)
    const story = items.flatMap((it) => it.storySentences);
    // 임대 형태로 판정된 딜은 이 가드를 타지 않는다 — 임대 연장("loan extended")·진행 중 임대("will stay")가 재계약 낱말에 걸린다
    if (!dir.isFree && !isLoanForm(form) && story.some((s) => RENEWAL.test(s)) && !story.some((s) => MOVE.test(s))) {
      skip("재계약·첫 프로 계약");
      continue;
    }
    /*
     * 5대 리그 관문(1차) — 보도가 언급한 구단(규칙이 잡은 것 + LLM이 읽은 것) 중 5대 리그 구단이 없으면 딜이 아니다.
     * 비5대 리그 사이의 이동은 보드에 싣지 않고, **LLM도 부르지 않는다**(부르면 비용만 든다). 5대 리그 → 비5대 리그
     * (아스날 → 알힐랄)는 출발 구단이 걸려 통과한다.
     */
    const mentioned = mentionedClubs(story);
    for (const it of items) {
      if (verdictOf(it.row, key) !== "move") continue;
      for (const c of [it.row.verdict_from, it.row.verdict_to, ...(it.row.verdict_suitors ?? [])]) if (c) mentioned.add(c);
    }
    if (![...mentioned].some(isTopLeague)) {
      skip("5대 리그 밖");
      continue;
    }
    // 행선지 밖의 관심 구단(정규명, 유력한 순) — 이름 조회 대상이고 관문·자식 행의 근거다
    const suitorCanonicals = rankSuitors(items, key).filter((c) => c !== dir.from && c !== dir.to);
    const resolved = frozen ? frozen.stage : contextOnly ? "official" : resolveStage(items);
    const stage = opts.requireVerdict && awaiting && stored ? holdStage(resolved, stored.stage) : resolved;
    // 딜 금액 후보 — 딜의 상대(행선지, 없으면 관심 구단 맨 앞)가 낸 지금의 금액만(`dealFee`). 직전 보도·범위도 이 후보로 센다.
    // 임대 계열 딜은 문맥 보도의 금액(조항 금액·임대료)도 후보다 — 진행 중 임대의 조항 금액은 문맥 보도가 말한다(가르나초의 £42.5m 의무)
    const feeCtx = { judged: allJudged.some((it) => verdictOf(it.row, key) === "move"), target: dir.to ?? suitorCanonicals[0] ?? null, sellers: new Set([dir.from, loanOwner].filter(Boolean)) };
    const feePool = (isLoanForm(form) && !contextOnly ? [...items, ...context] : items).sort((a, b) => ts(a.row) - ts(b.row) || a.row.id - b.row.id);
    const feeCandidates = feePool.map((it) => ({ ...it, fee: dealFee(it, feeCtx, memo) })).map((it) => (it.fee && !feeKindAllowed(form, it.fee.kind) ? { ...it, fee: null } : it));
    // 대표 금액 — 조항 금액이 있으면 임대료는 대표가 아니다(임대료는 계약 조건 줄의 `loan_fee_text`로 따로 그린다)
    const hasClauseFee = feeCandidates.some((it) => it.fee?.kind === "buy_clause");
    const { fee, prev, low, high } = resolveFee(feeCandidates.map((it) => (hasClauseFee && it.fee?.kind === "loan_fee" ? { ...it, fee: null } : it)));
    const loanFee = isLoanForm(form) ? feeCandidates.filter((it) => it.fee?.kind === "loan_fee").at(-1)?.fee ?? null : null;
    const addOn = fee ? firstOf(items.flatMap((it) => it.storySentences), (ex) => (ex.addOnAmount != null && ex.addOnCurrency === fee.currency ? ex.addOnAmount : null), memo) : null;
    const wage = firstOf(items.flatMap((it) => it.storySentences), (ex) => ex.wageText, memo);
    const contract = contractText(parseContract(items.flatMap((it) => it.storySentences)));

    const fromClub = dir.from ? clubRecord(dir.from, names) : null;
    let toClub = dir.to ? clubRecord(dir.to, names) : null;
    if (fromClub && toClub && fromClub.code === toClub.code) toClub = null; // CHECK from <> to

    // 표기·선수 정보는 묶음 키로 찾고, 없으면 합쳐진 키로 — 사전의 한 이름("Estevao")에 성을 붙인 묶음이 영문으로 떨어지지 않게
    const playerKo = names.playerKo(key) ?? absorbed.map((k) => names.playerKo(k)).find(Boolean) ?? null;
    const info = names.playerInfo(key) ?? absorbed.map((k) => names.playerInfo(k)).find(Boolean) ?? null;
    nameNeeds.push({ player, playerKey: key, fromCanonical: fromClub ? dir.from : null, toCanonical: toClub ? dir.to : null, suitorCanonicals });
    /*
     * 확인된 선수 관문 — 추출은 규칙이라 처음 보는 문형에서 틀린다("South American star", 감독 이름). 이름 조회는 이 뒤에
     * 돈다(`nameNeeds`에는 넣는다) — 찾으면 같은 실행에서 다시 파생해 곧바로 열린다. 못 찾은 선수는 경고로 남긴다
     * (사람이 보고 `players-ko.json`에 넣으면 열린다).
     */
    // 이 딜의 보도 중 지금 물어야 할 것 — 아래 두 관문(미확인 선수 · 판정)이 함께 쓴다
    const askJudge = () => {
      const tier = existing.has(groupDealKey) ? JUDGE_TIER.existing : JUDGE_TIER.newDeal;
      for (const it of reportedAll) {
        const mode = judgeMode(it.row, key, opts.nowMs, modeOpts);
        if (mode) judgeNeeds.push(judgeNeed(it.row, { playerKey: key, player, clubs: [...mentioned], mode, tier }));
      }
    };
    if (opts.requireVerified && !names.isVerifiedPlayer(key)) {
      // 확인되지 않은 선수도 판정은 받는다 — 완료·확정이거나 출처 두 곳이 이동이라 하면 연다(`canOpenUnverified`)
      // 이미 저장된 딜은 남긴다 — 판정이 없는 기존 딜을 남기는 규칙과 같은 정신이다. 같은 보도 접기(`foldEchoes`)로 출처 수가 줄어
      // 한 번 열린 딜이 다음 실행에 사라지면 보드·관심 목록에서 딜이 깜빡인다. 새 딜만 접은 뒤의 출처 수로 연다
      const open = opts.requireVerdict && (existing.has(groupDealKey) || canOpenUnverified(items, key));
      if (!open) {
        if (opts.requireVerdict && tokens(key).length >= 2) askJudge();
        unverified.push({ player, stage });
        skip("미확인 선수");
        continue;
      }
    }
    /*
     * 출발 구단을 보도가 말하지 않았으면(비었거나 캐시로 채웠다) 현 소속을 찾을 대상이다 — 확인된 선수만(항목 id가 있으면 함께 넘긴다).
     * ⚠ 캐시로 채운 딜도 넣는다 — 빈 출발만 보면 캐시가 한 번 생긴 선수는 다시 확인되지 않아, 임대가 끝난 선수의 옛 보유 구단이 출발로 남고
     *   보유 구단 행이 생기기 전에 찾은 선수는 영영 보유 구단을 모른다(재확인 주기는 `needsClubLookup`이 정한다).
     */
    if ((!dir.from || usedClubCache) && !dir.isFree && names.needsClubLookup(key, opts.nowMs)) {
      clubNeeds.push({ playerKey: key, player, wikidataId: names.entry("player", key)?.wikidata_id ?? null });
    }
    if (usedFallback) fromFallback += 1;
    /*
     * LLM 판정 관문 — 새 딜은 "이동" 판정이 한 건 이상 있어야 연다. 아직 묻지 않은(또는 다시 물어야 하는) 보도는
     * `judgeNeeds`로 넘긴다(호출부가 묻고 같은 실행에서 다시 파생한다). 이미 있는 딜은 판정이 없어도 둔다 — 판정이
     * 멎은(키 없음·API 장애) 시간에 보드가 통째로 비지 않게. 이미 있는 딜도 "이동 아님" 보도는 위에서 빠진다.
     */
    if (opts.requireVerdict) {
      askJudge();
      const confirmed = items.some((it) => verdictOf(it.row, key) === "move");
      if (!confirmed && !existing.has(groupDealKey)) {
        unconfirmed.push(player);
        skip("판정 대기(LLM)");
        continue;
      }
    }
    // 문맥 보도만으로는 새 딜을 열지 않는다 — 진행 중인 임대의 설명은 소식이 아니다(판정자는 지울 수만 있다). 이미 있는 딜은 남긴다.
    // 판정을 기다리는 사건 보도가 있어도 같다 — 새 딜은 "이동" 판정을 받은 사건 보도가 있어야 연다
    if (!events.length && !existing.has(groupDealKey)) {
      skip("진행 중 임대 문맥만");
      continue;
    }
    /*
     * 임대 관문 — 형태가 임대·임대 연장이면 **5대 리그로 들어오는** 것만 싣는다: 행선지가 5대 리그, 행선지가 없으면 관심 구단 중 하나가
     * 5대 리그. 5대 리그 구단이 하부 리그로 보내는 유망주 임대는 한 창에 구단마다 십여 건이라 보드를 덮는다. 완전 영입 전환·조기 복귀는
     * 지금의 관문(출발·행선지 중 하나가 5대 리그)을 그대로 쓴다.
     */
    if ((form === "loan" || form === "loan_extend") && ![dir.to, ...suitorCanonicals].some(isTopLeague)) {
      skip("5대 리그 밖으로 가는 임대");
      continue;
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
    // 지금 임대로 뛰는 구단 — 출발(보유 구단)과 같은 코드면 뜻이 없다(조기 복귀의 출발은 임대 구단이다 — 그때도 같은 구단이라 비운다)
    const loanClubRec = loanClubName ? clubRecord(loanClubName, names) : null;
    const loanClub = loanClubRec && loanClubRec.code !== fromClub?.code ? loanClubRec : null;
    // 구단 행은 관문을 지난 딜의 것만 쓴다
    for (const c of [fromClub, toClub, loanClub, ...suitorClubs]) if (c) clubs.set(c.code, c);
    if (!playerKo) missingKo.push(player);

    const times = [...reported.map((it) => ts(it.row)), ...echoTimes];
    deals.push({
      deal_key: groupDealKey,
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
      fee_kind: fee?.kind ?? null,
      prev_fee_amount: fee ? prev : null,
      fee_low_amount: fee ? low : null,
      fee_high_amount: fee ? high : null,
      add_on_amount: addOn,
      contract_text: contract ? clampCp(contract, 20) : null,
      wage_text: wage ? clampCp(wage, 20) : null,
      // ⚠ 이적료가 확인되면 자유계약이 아니다(DB CHECK `transfer_deal_free_agent_no_fee`) — 화면은
      //   이적료가 있으면 금액, 없고 이 값이 켜졌으면 "FA(자유 계약)", 둘 다 아니면 "미공개"를 그린다
      // 임대 계열은 자유계약이 아니다 — 소속이 없는 선수는 빌려줄 수 없다(기사 문장의 "free agent"가 다른 선수의 것이거나 지난 일이다)
      is_free_agent: dir.isFree && !fee && !isLoanForm(form),
      form,
      loan_club_code: loanClub?.code ?? null,
      loan_clause: loanClause,
      // 임대료는 대표 금액이 조항 금액일 때만 따로 둔다 — 대표 금액이 곧 임대료면 같은 금액이 계약 조건에 두 줄로 그려진다
      loan_fee_text: loanFee && fee?.kind === "buy_clause" ? clampCp(loanFee.text, 40) : null,
      settled_at: frozen ? (frozen.settled_at ?? null) : settledAtFor(items, stage, awaiting ? stored : null, reported),
      first_reported_at: new Date(Math.min(...times)).toISOString(),
      latest_reported_at: new Date(Math.max(...times)).toISOString(),
      report_count: reported.length,
      rowIds: reported.map((it) => it.row.id),
      // 관심 구단 코드(유력한 순 — `rankSuitors`) — `transfer_deal` 컬럼이 아니라 자식 행(`transfer_deal_suitor`)으로 쓴다
      suitorCodes: suitorClubs.map((c) => c.code),
      // 단계가 문맥 보도만으로 정해졌는가 — 알림이 이 변화를 보내지 않는다(컬럼이 아니다)
      contextOnly,
    });
    for (const it of reported) assignments.set(it.row.id, groupDealKey);
  }

  if (unconfirmed.length) warnings.push(`이동 판정(LLM)을 받지 못한 새 딜 ${unconfirmed.length}건 — 보드에 올리지 않았다: ${unconfirmed.join(", ")}`);
  if (unverified.length) warnings.push(`확인되지 않은 선수 ${unverified.length}명 — 보드에 올리지 않았다(완료·확정 판정이나 출처 두 곳의 이동 판정이 오면 열린다. 선수가 맞으면 players-ko.json에 넣어 바로 연다): ${unverified.map((u) => u.player).join(", ")}`);
  if (missingKo.length) warnings.push(`한국어 표기가 없는 선수 ${missingKo.length}명(사람 사전·위키데이터 모두 없음) — 영문명으로 그려진다: ${missingKo.join(", ")}`);
  deals.sort((a, b) => b.latest_reported_at.localeCompare(a.latest_reported_at));
  // 같은 이유로 연달아 실패한 행 — 실행 요약과 Actions 경고가 센다(사람이 원인을 봐야 한다). **판정이 없는** 행만 센다 — 본문만 못 받은
  // 성공 판정(`verdict_attempts`가 본문 재시도로 오른다)은 판정이 있어 실패가 아니다
  const repeatedFailures = reps.filter((r) => r.verdict == null && (Number(r.verdict_attempts) || 0) >= REPEATED_FAILURE_ATTEMPTS).length;
  return {
    deals, clubs: [...clubs.values()], assignments, nameNeeds, judgeNeeds: orderJudgeNeeds(judgeNeeds, { limit: opts.judgeLimit ?? JUDGE_MAX_PER_RUN }),
    clubNeeds, fromFallback, warnings, skipped, startMs, repeatedFailures,
  };
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

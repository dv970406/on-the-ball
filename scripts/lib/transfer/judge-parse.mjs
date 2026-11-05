/**
 * 판정 해석 — 모델이 낸 JSON을 받을 값으로 바꾼다(`parseJudgement`와 그 대조·정규화 헬퍼). 순수 함수만 둔다: API·DB·cheerio 없이 돌고
 * 파생(`derive-deals.mjs`·`judge-queue.mjs`·`deal-fee.mjs`)이 SDK를 끌어오지 않고 이 파일만 본다. 출력 필드를 더하면 요청(`judge-prompt.mjs`의 스키마)·
 * 저장(`judge.mjs`의 `settleJudgement`)·판정 컬럼(`verdict-columns.mjs`)이 함께 바뀐다. 호출·저장·재생은 `judge.mjs`에 남는다.
 */
import { detectClubs, isClubName } from "./clubs.mjs";
import { FROM, collectVotes } from "./direction.mjs";
import { personName } from "./extract.mjs";
import { FEE_CURRENCIES, FEE_KINDS, JUDGE_STAGES, LOAN_CLAUSES, LOAN_FEE_KINDS, LOAN_FORMS, MOVE_FORMS, SUITORS_MAX } from "./judge-prompt.mjs";
import { loadGlossary, renameInSummary } from "./names-ko.mjs";
import { normalizePlayer } from "./player-key.mjs";
import { DEAD, RENEWAL, isRoundupItem } from "./story.mjs";
import { DAY_MS, escapeRe, HOUR_MS, MAX_FEE_M, sameAmount } from "./util.mjs";
import { clampCp } from "../sync-db.mjs";

/** 한 번 실행의 호출 상한 — 백필·버그가 한 시간에 비용을 태우지 않게 한다. 남은 행은 다음 실행이 잇는다 */
export const JUDGE_MAX_PER_RUN = 60;
/** 판정 불가·요약 실패로 끝난 행을 다시 묻기까지의 간격 */
export const JUDGE_RETRY_MS = 24 * HOUR_MS;
/** 요약 실패를 다시 시도하는 기간 — 이보다 오래된 보도는 영문 발췌로 둔다 */
export const SUMMARY_RETRY_WINDOW_MS = 14 * DAY_MS;
/** 근거 인용 상한 — DB CHECK(`transfer_news_verdict_evidence_len`)와 같은 값 */
export const EVIDENCE_MAX_CHARS = 300;
/** 요약 상한 — DB CHECK(`transfer_news_summary_ko_len`)와 같은 값. 지시문은 120자 안팎을 요구한다 */
export const SUMMARY_MAX_CHARS = 160;
/** 단일 이적의 금액 상한(백만) — DB CHECK(`transfer_news_verdict_fee_amount_range`)와 같은 값 */
const FEE_MAX_M = MAX_FEE_M;

/**
 * 기사 본문을 받을 보도인가 — 매체 RSS만. 텔레그램·블루스카이는 저장된 글이 전문이고, 구글 뉴스 링크는 리다이렉트다.
 * 가십 칼럼의 항목 행은 받지 않는다 — 저장된 문단이 그 이적설의 전부이고 URL은 칼럼 전체다.
 */
export const wantsArticle = (row) =>
  typeof row.source_id === "string" && row.source_id.startsWith("rss:") && /^https?:\/\//u.test(row.url ?? "") && !isRoundupItem(row);

/** 인용 대조용 정규형 — 공백·따옴표·대소문자·말줄임·이모지 차이만 접는다(글자 자체는 바꾸지 않는다) */
export function normalizeQuote(s) {
  return String(s)
    .normalize("NFC")
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu, " ")
    .replace(/[‘’‛′`]/gu, "'")
    .replace(/[“”„″]/gu, '"')
    .replace(/…/gu, "...")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

const quotedIn = (text, quote) => quote !== "" && normalizeQuote(text).includes(normalizeQuote(quote));

/** 대조용 낱말 — 앞뒤 문장부호를 걷는다("kone,"와 "kone"은 같은 낱말이다). 통화 기호·퍼센트는 남긴다 */
const wordsOf = (s) => normalizeQuote(s).split(" ").map((w) => w.replace(/^[^\p{L}\p{N}£€$]+|[^\p{L}\p{N}%]+$/gu, "")).filter(Boolean);
/** 조각 안에서 건너뛸 수 있는 낱말 수(한 번에 · 조각 전체) — 나이 표기(", 26,")나 수식어("20-year-old Austrian international") 정도 */
const GAP_MAX = 6;
const GAP_TOTAL = 8;
/** 조각 하나로 치는 최소 낱말 수 — 한두 낱말은 어디서든 맞는다 */
const FRAGMENT_MIN_WORDS = 3;

/** `words`가 `text`의 `from` 뒤에서 **순서대로**(낱말 사이 건너뛰기는 한도 안에서) 나오면 끝 위치, 아니면 -1 */
function matchFragment(text, words, from) {
  for (let start = from; start < text.length; start += 1) {
    if (text[start] !== words[0]) continue;
    let pos = start;
    let skipped = 0;
    let ok = true;
    for (let i = 1; i < words.length && ok; i += 1) {
      let next = -1;
      for (let j = pos + 1; j <= pos + 1 + GAP_MAX && j < text.length; j += 1) if (text[j] === words[i]) { next = j; break; }
      if (next < 0) ok = false;
      else {
        skipped += next - pos - 1;
        pos = next;
        if (skipped > GAP_TOTAL) ok = false;
      }
    }
    if (ok) return pos + 1;
  }
  return -1;
}

/**
 * 근거 인용이 원문에 있는가 — 통째 일치, 또는 **줄인 인용**.
 *
 * 근거를 25단어로 제한한 탓에 모델이 인용을 줄인다 — 나이 표기를 빼거나("Ethan Ampadu, despite" ← "Ethan Ampadu, 26, despite")
 * 가운데를 "..."로 건너뛴다. 통째 일치만 받았더니 판정의 5.5%가 "근거가 원문에 없다"로 버려졌고(감사 183건 중 10건, 9건이 줄인 인용),
 * 버려진 행은 딜에서 빠진 채 24시간마다 다시 물렸다(운영에서 알라바·미첼·토모리의 판정이 그렇게 비워졌다).
 *
 * 받는 조건 — 인용을 "..."와 문장 끝에서 나눈 조각마다 원문에 있고, 조각 안의 낱말은 순서대로(건너뛰기 한 번에 `GAP_MAX`,
 * 조각 전체 `GAP_TOTAL` 낱말까지) 있어야 한다. 조각 안의 낱말이 원문에 그 순서로 있으므로 "지어낸 근거로 딜을 열지 않는다"는 그대로다.
 * ⚠ 이름 대조(`mentionIn`)에는 쓰지 않는다 — "Real … Madrid"를 건너뛰어 맞추면 없는 구단이 생긴다.
 */
export function evidenceIn(text, quote) {
  if (quote === "") return false;
  if (quotedIn(text, quote)) return true;
  const textWords = wordsOf(text);
  // 조각 — "..."와 **문장 끝**에서 나눈다. 모델은 떨어진 두 문장을 "..." 없이 이어 적거나("…here we go! Medical underway right now" —
  // 사이에 한 문장이 있다) 뒤 문단의 문장을 먼저 적는다. 순서까지 요구했더니 실제 이적 보도의 판정이 3.5% 버려졌다(재실행 230건 중 8건,
  // 7건이 진짜 이적 보도). 조각마다 원문에 있으면 받는다 — 모든 낱말이 원문의 한 자리에 그 순서로 있다는 것은 그대로다.
  const fragments = normalizeQuote(quote).split(/\.\.\.|(?<=[.!?])\s+/u).map(wordsOf).filter((f) => f.length);
  // 짧은 조각(한두 낱말 — "Why?"·"Yes.")은 어디서든 맞아 뜻이 없다. 버리되, 남은 조각이 인용의 대부분이어야 한다
  const solid = fragments.filter((f) => f.length >= FRAGMENT_MIN_WORDS);
  if (!solid.length || solid.reduce((n, f) => n + f.length, 0) < fragments.reduce((n, f) => n + f.length, 0) * 0.8) return false;
  return solid.every((f) => matchFragment(textWords, f, 0) >= 0);
}

/** 모델이 적은 이름(구단·선수)이 원문에 있으면 다듬어 돌려준다, 없으면 null */
export function mentionIn(mention, sentText) {
  if (typeof mention !== "string") return null;
  const raw = mention.trim().replace(/\s+/gu, " ");
  return raw && quotedIn(sentText, raw) ? raw : null;
}

/**
 * 모델이 적은 구단 — 원문 표기 그대로면 그 표기, 아니면 **구단 사전으로 풀리고 그 구단이 원문에서도 잡힐 때** 정규명.
 * 모델이 "Stuttgart's Finn Jeltsch"의 출발을 "VfB Stuttgart"로 다듬어 적어 원문 대조에 걸려 출발이 비었다(회귀 실측 — 운영에서
 * 출발이 빈 판정의 원인이다). 원문에 없는 구단은 여전히 받지 않는다.
 */
function clubMentionIn(mention, sentText) {
  const verbatim = mentionIn(mention, sentText);
  if (verbatim || typeof mention !== "string") return verbatim;
  const canonical = detectClubs(mention)[0];
  return canonical && detectClubs(sentText).includes(canonical) ? canonical : null;
}

/**
 * 선수 한글 표기의 형식 — 낱말들(사이 공백·가운뎃점·붙임표), 40자 이내. 낱말은 한글이거나 **라틴 대문자 머리글자 1~3자**("JJ 가브리엘"·
 * "CJ 이건")이고 한글 낱말이 하나는 있어야 한다. 머리글자를 거부했더니 통용 표기가 캐시에 앉지 못해 요약마다 "JJ 가브리엘"·"JJ Gabriel"·
 * "JJ 개브리얼"로 갈렸다. 그 밖의 문자(히브리·가나 — "빅토르 עיוケレス")는 받지 않는다.
 */
export function isKoName(v) {
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (!t || [...t].length > 40 || !/^[^\s·-]+(?:[\s·-][^\s·-]+)*$/u.test(t)) return false;
  const tokens = t.split(/[\s·-]/u);
  return tokens.every((w) => /^[가-힣]+$/u.test(w) || /^[A-Z]{1,3}$/u.test(w)) && tokens.some((w) => /^[가-힣]+$/u.test(w));
}

/** 요약문의 옛·틀린 표기를 저장 직전에 바로잡는다 — 긴 키부터(“스포팅 디렉터”가 “스포팅”보다 먼저) */
export function applyCorrections(text, corrections = loadGlossary().corrections) {
  let out = text;
  for (const [wrong, right] of Object.entries(corrections).sort(([a], [b]) => b.length - a.length)) out = out.split(wrong).join(right);
  return out;
}

/**
 * 모델이 적은 선수 한글 표기 → 받을 값. 요약과 같은 교정표를 먼저 적용한다 — 요약은 "각포"로 고쳐지는데 표기는 "가크포"로 남아
 * 딜 제목과 요약이 갈렸다. 형식이 틀리면 null.
 */
export function koNameOf(v, corrections) {
  if (typeof v !== "string") return null;
  const ko = applyCorrections(v.replace(/\s+/gu, " ").trim(), corrections);
  return isKoName(ko) ? ko : null;
}

/**
 * 요약의 기계적 손질 — 교정표(한국어 → 한국어)로 적을 수 없는 것. "시티行"(한자 行 → 행)과, 용어 표기를 괄호로 되풀이한
 * "확정되었으며(이적 확정)"이 운영에 나갔다.
 */
const tidySummary = (text) => text.replace(/(?<=[가-힣A-Za-z])行/gu, "행").replace(/(확정[가-힣]*)\s?\(이적 확정\)/gu, "$1").replace(MONEY_WORD, (_, cur, n, unit) => `${cur}${n}${MONEY_UNIT[unit.toLowerCase()]}`);
/**
 * 금액 단위 낱말을 기호로 접는다 — "€45million"·"£64 million"과 "£64m"이 같은 딜의 요약마다 섞였다(원문 표기를 그대로 옮기라는 지시
 * 때문에 매체마다 갈린다). 화면의 금액 칸이 쓰는 꼴(`m`·`bn`·`k`)로 맞춘다.
 */
const MONEY_WORD = /([€£$])\s?(\d[\d.,]*)\s?(million|billion|thousand|mn)(?![A-Za-z])/giu;
const MONEY_UNIT = { million: "m", mn: "m", billion: "bn", thousand: "k" };

/**
 * 원문을 두고 하는 말("원문에는 금액이 나와 있지 않다") — 요약은 보도의 내용이지 원문에 대한 설명이 아니다. "두 문장으로, 둘째 문장에
 * 금액 등"이라는 지시를 채우려고 모델이 없는 정보를 "없다"고 적었다(블라인드 채점: 새 요약의 12%, 옛 요약 1%).
 * ⚠ "이적료는 공개되지 않았다"(비공개 이적료)·"밝혀지지 않았다"는 보도가 말한 사실이라 걷지 않는다 — 원문·정보 부재를 말하는 표현만.
 */
const META_SENTENCE = /원문(?!\s?에\s?따르면)|기사(?:에는|에서는)\s|(?:언급되지|명시되지)\s?않(?:는다|았다)|(?:기사|원문|본문|보도)(?:에는|에서는|에)\s[^.]*(?:나와 있지|나오지)\s?않(?:는다|았다)|언급(?:은|이) 없(?:다|었다)|정보(?:는|가) 없다/u;
/** 메타 절이 쉼표 뒤 마지막 절로 붙은 경우("…분석이 나왔고, 금액은 언급되지 않았다.") — 앞 절의 "-고"를 "-다"로 맺는다 */
const META_TAIL = /([가-힣])고,\s*(?:[^,.]*(?:언급되지|명시되지)|(?:기사|원문|본문|보도)[^,.]*(?:나와 있지|나오지))\s?않(?:는다|았다)\.?$/u;

/** 요약에서 메타 문장을 걷는다. 걷고 나서 남는 문장이 없으면 원래 글을 돌려준다(요약 검증이 판단한다) */
export function stripMetaSentences(text) {
  const sentences = String(text).split(/(?<=[.!?])\s+/u).map((x) => x.replace(META_TAIL, "$1다.")).filter(Boolean);
  const kept = sentences.filter((x) => !META_SENTENCE.test(x));
  return kept.length ? kept.join(" ") : String(text);
}

/** 한국어 요약에 섞이면 안 되는 문자 — 한자·가나·아랍·키릴·그리스·히브리·태국·데바나가리 */
const FOREIGN_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}]/u;

/**
 * 원문의 금액 표기 → 백만 단위 숫자와 통화. "£60m"·"€30.57m"·"£500k"·"€500,000"·"60 million euros"·범위 "€20-25m"를 읽는다.
 * 판정자가 적은 금액이 원문에 있는지 대조하는 데만 쓴다(성격·선수 귀속은 모델이 판단한다).
 */
export function moneyMentions(text) {
  const out = [];
  const num = (raw) => Number(raw.replace(/,(?=\d{3}\b)/gu, "").replace(",", "."));
  const scale = (n, unit) => {
    const u = (unit ?? "").toLowerCase();
    if (u.startsWith("b")) return n * 1000;
    if (u.startsWith("m")) return n;
    if (u.startsWith("k") || u === "thousand") return n / 1000;
    return n >= 10_000 ? n / 1_000_000 : null; // 단위 없는 작은 수는 주급·등번호다
  };
  const push = (n, unit, currency) => {
    const m = scale(n, unit);
    if (Number.isFinite(m) && m > 0) out.push({ amount: Math.round(m * 100) / 100, currency });
  };
  const SYMBOL = { "£": "GBP", "€": "EUR", "$": "USD" };
  // 범위("€20-25m"·"£40m-£50m") — 앞 숫자에는 단위가 없어 아래 표기로는 읽히지 않는다. 두 끝을 모두 금액으로 본다
  for (const m of text.matchAll(/([€£$])\s?(\d[\d.,]*)\s?(?:million|mn|m|bn|billion|k)?\s?[-–]\s?[€£$]?(\d[\d.,]*)\s?(million|mn|m|billion|bn|thousand|k)\b/giu)) {
    push(num(m[2]), m[4], SYMBOL[m[1]]);
    push(num(m[3]), m[4], SYMBOL[m[1]]);
  }
  for (const m of text.matchAll(/([€£$])\s?(\d[\d.,]*\d|\d)\s?(million|mn|m|billion|bn|thousand|k)?\b/giu)) push(num(m[2]), m[3], SYMBOL[m[1]]);
  const WORD = { euro: "EUR", pound: "GBP", dollar: "USD" };
  for (const m of text.matchAll(/(\d[\d.,]*\d|\d)\s?(million|mn|m|billion|bn|thousand|k)?\s+(euro|pound|dollar)s?\b/giu)) push(num(m[1]), m[2], WORD[m[3].toLowerCase()]);
  return out;
}

/**
 * 판정자가 적은 금액을 받을지 — 형식이 맞고 **원문에 그 금액(같은 통화)이 있어야** 받는다. 아니면 null(판정은 그대로 둔다).
 * @returns {{ amount: number, currency: string, kind: string } | null}
 */
export function judgeFee(fee, sentText) {
  if (!fee || typeof fee !== "object") return null;
  const amount = Math.round(Number(fee.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > FEE_MAX_M) return null;
  if (!FEE_CURRENCIES.includes(fee.currency) || !FEE_KINDS.includes(fee.kind)) return null;
  const same = (m) => m.currency === fee.currency && sameAmount(m.amount, amount);
  // 모델이 옮긴 원문 표기(`text` — "£60m")가 원문에 그대로 있으면 그 표기로 대조한다 — 표기 읽기(`moneyMentions`)가 모르는 꼴
  // ("60 million pounds plus add-ons")도 받는다. 단 그 표기가 읽히는 금액과 어긋나면(표기 £60m인데 amount 65) 받지 않는다.
  const text = typeof fee.text === "string" ? fee.text.trim() : "";
  if (text && quotedIn(sentText, text)) {
    const read = moneyMentions(text);
    if (!read.length || read.some(same)) return { amount, currency: fee.currency, kind: fee.kind };
    return null;
  }
  if (!moneyMentions(sentText).some(same)) return null;
  return { amount, currency: fee.currency, kind: fee.kind };
}

/**
 * 원문이 임대를 말하는 낱말 — 판정자가 적은 임대 형태·임대 상태·임대 금액은 이것이 원문에 있어야 받는다. 모델이 이적설을 "임대"로
 * 지어 적으면 딜에 없는 임대 표지가 붙는다(이름·구단·금액을 원문과 대조하는 것과 같은 원칙).
 */
export const LOAN_CUE = /\b(?:loan(?:s|ed|ee|ees)?|on-loan|recall(?:s|ed|ing)?|cut short|spending the season at)\b|임대/iu;
/** 완전 이적 조항을 말하는 낱말 — 옵션·의무 표지는 이것이 원문에 있어야 받는다 */
export const CLAUSE_CUE = /\b(?:option\s+to\s+(?:buy|sign|make)|(?:buy|purchase|buy-back|buyback)\s+option|option\s+(?:clause|of|worth|for|fee)|(?:with|an|the|includes?|including)\s+(?:an?\s+|the\s+)?option|obligat(?:ion|ory|ed)|mandatory|compulsory|buy(?:-|\s)?clause|purchase clause|permanent (?:deal|transfer|move|basis)|make (?:the|his|it|that) (?:move|deal|loan) permanent|made permanent|becomes? permanent)\b|옵션|의무/iu;
/** 임대의 금액 — 임대 형태가 아닌 판정에서 이 성격의 금액은 받지 않는다 */
/** 조항(옵션·의무)이 붙을 수 있는 형태 — 조기 복귀에는 조항이 없다 */
const CLAUSE_FORMS = new Set(["loan", "loan_convert", "loan_standing", "loan_extend"]);

/**
 * 판정자가 적은 형태·임대 상태·조항 → 받을 값. 판정은 그대로 두고 **필드만** 버린다(금액 대조와 같은 원칙).
 * - 형태가 없으면 null(형태를 묻기 전의 옛 원출력 — 재생). 임대 형태인데 원문에 임대 낱말이 없으면 완전 이적으로 접는다.
 * - 임대 상태(owner·at)는 원문에 임대 낱말이 있고 그 구단이 원문에 있을 때만. 둘이 같은 구단이면 at을 버린다.
 * - 조항은 조항이 붙는 형태이고 원문에 조항 낱말이 있을 때만.
 * @returns {{ form: string | null, owner: string | null, at: string | null, clause: string | null }}
 */
export function judgeLoan(obj, sentText) {
  const loanText = LOAN_CUE.test(sentText);
  let form = MOVE_FORMS.includes(obj?.form) ? obj.form : null;
  if (form && LOAN_FORMS.includes(form) && !loanText) form = "permanent";
  const status = obj?.on_loan && typeof obj.on_loan === "object" && loanText ? obj.on_loan : null;
  const owner = status ? clubMentionIn(status.owner, sentText) : null;
  let at = status ? clubMentionIn(status.at, sentText) : null;
  if (owner && at && normalizeQuote(owner) === normalizeQuote(at)) at = null;
  const clause = form && CLAUSE_FORMS.has(form) && LOAN_CLAUSES.includes(obj?.loan_clause) && CLAUSE_CUE.test(sentText) ? obj.loan_clause : null;
  return { form, owner, at, clause };
}

/**
 * 한 토큰 이름을 전체 이름으로 푼다 — 판정자가 "Haaland"·"Alaba"만 적은 보도. 원문에 그 성으로 끝나는 전체 이름이 하나뿐이면
 * 그것, 아니면 이름 사전(사람 사전 · 확인된 선수)에서 그 성을 가진 선수가 한 명뿐일 때 그 선수다. 못 풀면 null — 한 토큰 이름
 * 하나로는 누구인지 특정하지 않는다(진짜 한 이름 선수는 사람 사전이 맡는다).
 * @param {{ playersBySurname?: (token: string) => { key: string, name: string }[] }} names
 */
export function fullNameFor(token, sentText, names) {
  const t = String(token).trim();
  if (!t || /\s/u.test(t)) return null;
  const inText = new Set();
  for (const m of sentText.matchAll(new RegExp(`(\\p{Lu}[\\p{L}\\p{M}'’‑-]+)[^\\S\\n]+${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}])`, "gu"))) {
    const full = personName(`${m[1]} ${t}`);
    if (full && full.split(/\s+/u).length >= 2) inText.add(full);
  }
  if (inText.size === 1) return [...inText][0];
  if (inText.size > 1) return null;
  const known = names?.playersBySurname?.(normalizePlayer(t)) ?? [];
  return known.length === 1 ? known[0].name : null;
}

/**
 * 요약 검증 — 한글이 있고 상한 안이어야 저장한다.
 * @returns {{ text: string } | { reason: string }}
 */
export function judgeSummary(raw, corrections) {
  if (typeof raw !== "string") return { reason: "요약이 없다" };
  // 문장이 끝난 뒤의 JSON 꼬리(`.”}, `)를 걷는다 — 모델이 요약 문자열 안에 닫는 따옴표·괄호를 흘린 것이 화면에 나갔다(벤치 실측)
  const trimmed = raw.replace(/\s+/g, " ").trim().replace(/(?<=[.!?다요])[\s"'“”‘’{}[\],]+$/u, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  const text = tidySummary(applyCorrections(stripMetaSentences(trimmed), corrections));
  if (!text) return { reason: "요약이 비었다" };
  // 그래도 괄호가 남았으면 출력 형식이 요약에 섞인 것이다 — 버리고 다시 묻는다
  if (/[{}]/u.test(text)) return { reason: "요약에 출력 형식 조각({ })이 섞였다" };
  if (!/[가-힣]/.test(text)) return { reason: "한글이 없다" };
  // 한글·라틴 문자 밖의 글자가 섞이면 버린다 — "메دي컬"(아랍 문자)·"맨체스터 시티行"(한자)이 화면에 나갔다(운영).
  // 흔한 것은 앞의 손질(`tidySummary` — 行 → 행)이 고치고, 남은 것은 다시 묻는다.
  const foreign = text.match(FOREIGN_SCRIPT);
  if (foreign) return { reason: `한글·영문 밖의 문자(${foreign[0]})` };
  if ([...text].length > SUMMARY_MAX_CHARS) return { reason: `${[...text].length}자 — 상한 초과` };
  return { text };
}

/** 근거 문장 번호 상한 — 지시문이 1~3개를 요구한다(구조화 출력은 개수 제한을 지원하지 않아 코드가 자른다) */
const EVIDENCE_IDS_MAX = 3;

/**
 * 근거 — 새 형식은 문장 번호(`evidence_ids`)를 원문 번호표(`sentences`)로 문장으로 바꾼다. 옛 형식(`evidence` 자유 인용)은
 * 원문 대조(`evidenceIn`)로 받는다 — `--replay`가 저장된 옛 원출력을 다시 읽는다.
 * 자유 인용을 버린 이유: 같은 보도를 다시 물으면 모델이 인용을 실행마다 다르게 줄여 판정의 7%쯤이 대조에서 갈렸고, 버려진 행이
 * 24시간마다 같은 이유로 다시 물렸다. 번호는 대조할 것이 없다 — 범위 안이면 그 문장이 근거다.
 * @returns {{ evidence: string, ok: boolean, issue?: string, quote?: string }} `ok`는 "원문에 있는 근거가 있다"
 */
function evidenceOf(obj, sentText, sentences) {
  if (Array.isArray(obj.evidence_ids)) {
    if (!Array.isArray(sentences)) return { evidence: "", ok: false, issue: "문장 번호표 없이 번호 근거를 읽을 수 없다" };
    const ids = [...new Set(obj.evidence_ids)];
    const bad = ids.filter((i) => !Number.isInteger(i) || i < 1 || i > sentences.length);
    const text = ids.filter((i) => !bad.includes(i)).slice(0, EVIDENCE_IDS_MAX).map((i) => sentences[i - 1].trim()).filter(Boolean).join(" ");
    if (bad.length) return { evidence: text, ok: false, issue: `근거 문장 번호가 범위 밖이다(${bad.join(", ")} / ${sentences.length}문장)` };
    if (!text) return { evidence: "", ok: false, issue: "이동이라면서 근거가 없다" };
    return { evidence: text, ok: true };
  }
  const evidence = typeof obj.evidence === "string" ? obj.evidence.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "").trim() : "";
  if (!evidence) return { evidence: "", ok: false, issue: "이동이라면서 근거가 없다" };
  // 어떤 구절이 거부됐는지 남긴다 — 구절을 봐야 원인을 가른다
  return evidenceIn(sentText, evidence) ? { evidence, ok: true } : { evidence, ok: false, issue: "근거가 원문에 없다", quote: clampCp(evidence, 120) };
}

/**
 * 모델 출력 → 판정. 순수 함수라 테스트가 API 없이 돈다. 구단·선수는 **원문에 있는 표기(mention)** 까지만 가른다 —
 * 정규화·위키데이터 확인은 `resolveClubs`(비동기)가 한다.
 * @param {string} raw 모델이 낸 글자(JSON)
 * @param {string} sentText 모델에 보낸 원문의 평문(`prepareJudgeInput`의 `sentText`) — 구단·선수·금액 대조 대상
 * @param {{ corrections?: object, player?: string | null, names?: object | null, article?: string, sentences?: string[] }} opts `player`는 규칙이 뽑아 물은 선수
 *   (있으면 모델의 player를 무시한다) · `names`는 한 토큰 이름을 풀 이름 사전(`fullNameFor`) · `article`은 받은 기사 본문(제목뿐 판정) ·
 *   `sentences`는 번호표(`numbered.sentences` — `[n]`의 평문 문장이 `sentences[n-1]`)
 * @returns {{ kind: "move", rawClubs: string[], player: string, playerKo: string | null, stage: string | null, evidence: string, from: string | null,
 *   to: string | null, suitors: string[], form: string | null, loanOwner: string | null, loanClub: string | null, loanClause: string | null,
 *   fee: { amount: number, currency: string, kind: string } | null, summary: string | null, summaryIssue: string | null }
 *   | { kind: "not_move", evidence: string | null, retrospective?: true, unnamed?: true, mention?: string | null, titleOnly?: true, renewal?: true }
 *   | { kind: "invalid", reason: string, quote?: string }}
 */
export function parseJudgement(raw, sentText, { corrections, player = null, names = null, article = "", sentences } = {}) {
  let obj;
  try {
    obj = JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").match(/\{[\s\S]*\}/u)?.[0] ?? "");
  } catch {
    return { kind: "invalid", reason: "JSON 형식이 깨졌다" };
  }
  if (typeof obj?.move !== "boolean") return { kind: "invalid", reason: "move가 true/false가 아니다" };
  const ev = evidenceOf(obj, sentText, sentences);
  const evidence = ev.evidence;
  // "이동 아님"은 근거가 없어도 받는다 — 원문에서 확인된 근거만 남긴다
  const kept = ev.ok ? clampCp(evidence, EVIDENCE_MAX_CHARS) : null;
  if (!obj.move) return { kind: "not_move", evidence: kept };
  // 회고 — 모델이 "지난 일"이라 해 놓고도 이동으로 내는 일이 있다(운영: "이동" 95건 중 11건이 이번 여름 끝난 이적의 회고였다).
  // 지시문만으로는 안 잡혀 시점을 따로 적게 하고 코드가 접는다. 근거 대조보다 **먼저** 본다 — 딜을 열지 않는 판정이라 근거가
  // 필요 없고, 판정 불가로 두면 같은 회고를 24시간마다 다시 묻는다.
  if (obj.timing === "past") return { kind: "not_move", evidence: kept, retrospective: true };
  // "이동이다"는 원문에 실제로 있는 근거가 있어야 받는다 — 지어낸 근거로 딜을 열지 않는다
  if (!ev.ok) return { kind: "invalid", reason: ev.issue, ...(ev.quote ? { quote: ev.quote } : {}) };

  // 선수 — 규칙이 뽑아 물은 이름이 있으면 그대로, 없으면 모델이 읽은 이름(원문에 있고 사람 이름처럼 생겨야 한다 — "Argentine international"은 이름이 아니다)
  // 한 토큰 이름("Haaland")은 전체 이름으로 풀리면 받는다(`fullNameFor`) — 사람 사전에 없는 한 토큰 이름을 통째로 버렸더니
  // 보드에 있는 선수의 보도까지 "선수 미특정"으로 지워졌다(운영: "이동 아님" 95건 중 놓친 5건의 4건).
  const mention = mentionIn(obj.player, sentText);
  const found = player ?? personName(mention) ?? (mention ? fullNameFor(mention, sentText, names) : null);
  // 이동이라는데 선수를 특정할 수 없는 글("South American star"·"£60m full-back")은 **영영 딜이 될 수 없다** — 판정 불가로 두면 24시간마다
  // 같은 글에 다시 물어 비용만 반복된다(감사: 판정 불가 18건 중 8건). 후보가 아니라는 뜻으로 not_move에 접고 표시만 남긴다.
  // 정규형이 비는 이름(키릴·아랍 문자 등 — 딜 키를 만들 수 없다)도 같다. 그대로 두면 판정 저장이 CHECK(선수 키 1자 이상)에 걸려 매시 다시 물린다
  if (!found || !normalizePlayer(found)) return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), unnamed: true, mention: mention ?? found ?? null };
  // 기사 본문을 받았는데 **본문에 그 선수가 없으면** 제목의 낱말만으로 만든 이적설이다 — 라이브 블로그·소식 모음의 제목
  // ("Transfer news LIVE: Arsenal target Alexander-Arnold; …")이 본문(임원 선임)과 무관한 딜이 됐다. 지시문으로 막았는데도 모델이
  // 실행마다 다르게 읽어 코드가 접는다. 성(마지막 토큰)으로 본다 — 본문은 성만 쓰는 일이 많다.
  if (article && !normalizePlayer(article).includes(normalizePlayer(found).split(" ").at(-1))) {
    return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), titleOnly: true };
  }
  let from = clubMentionIn(obj.from, sentText);
  let to = clubMentionIn(obj.to, sentText);
  if (from && to && normalizeQuote(from) === normalizeQuote(to)) from = to = null; // 같은 구단이 양쪽에 오면 어느 쪽도 믿지 않는다
  let suitors = [...new Set((Array.isArray(obj.suitors) ? obj.suitors : []).map((s) => clubMentionIn(s, sentText)).filter((s) => s && s !== from && s !== to))].slice(0, SUITORS_MAX);
  ({ to, suitors } = normalizeDestination({ to, suitors }, sentText));
  const loan = judgeLoan(obj, sentText);
  // 진행 중인 임대를 말한다면서 원문에 임대 낱말이 없다 — 새 움직임이 없다는 판정이라 이동 아님이다. 완전 이적으로 접으면 단계가 비어
  // 파생이 그 보도의 규칙 단계("합의 임박" 등)로 딜을 움직인다(가르나초의 진행 중 임대 기사가 그렇게 "합의 임박"이 됐다)
  if (obj.form === "loan_standing" && loan.form !== "loan_standing") {
    return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), standingWithoutLoan: true };
  }
  // 모델이 행선지도 관심 구단도 비웠지만 짧은 글에 출발 구단 말고 구단이 하나뿐이면 그 구단이 행선지다 — 판정이 읽은 임대 구단·보유
  // 구단은 그 "하나"가 아니다("on loan at Bournemouth from Juventus"의 본머스는 사려는 쪽이 아니다). 단 완전 영입 전환·임대 연장은 지금
  // 임대로 뛰는 구단이 곧 상대라 행선지가 비었으면 그 구단이다
  if (!to && !suitors.length) to = (loan.form === "loan_convert" || loan.form === "loan_extend") && loan.at ? loan.at : loneOtherClub(sentText, from, [loan.at, loan.owner]);
  // 재계약 가드 — 근거가 **지금 구단과의 계약**(new contract·extension)이고 행선지가 없는데 단계가 진전(협상·합의·완료)이면 그 진전은
  // 재계약의 것이다. 모델이 같은 기사를 어떤 날은 "부인", 어떤 날은 "합의"로 읽어 케인의 재계약이 다시 "합의 임박"이 됐다(운영 재판정).
  // 이적설 부인·루머로 읽은 판정(rumour·denied·collapsed)은 그대로 둔다 — 재계약이 복귀설을 끝낸다는 보도는 부인이 맞다.
  // 진행 중인 임대를 설명할 뿐인 글은 단계가 없다 — 모델이 단계를 적어도 버린다(파생이 그 보도로 딜의 단계를 움직이지 않는다)
  const stage = loan.form === "loan_standing" ? null : JUDGE_STAGES.includes(obj.stage) ? obj.stage : null;
  // 임대 연장은 "extension"을 말해도 재계약이 아니다.
  // 관심 구단이 여럿인 이적설(행선지는 비어 있다)의 **제안**도 재계약이 아니다 — 근거 가운데 재계약 낱말이 없는 문장이 그 구단을 말하면
  // 제안은 그 구단의 것이다("rejected a new contract. Bids from Everton and Fulham"이 이동 아님으로 굳었다).
  // ⚠ 재계약 문장 안의 구단은 세지 않는다 — "new contract … rumours of a potential return to Tottenham come to an end"의 토트넘은
  //   관심 구단이 아니라 끝난 복귀설이다(케인 기사를 협상으로 되살렸다 — 벤치 재생). 협상·합의는 재계약 협상·합의와 가를 수 없어
  //   그대로 접는다(진짜 이적설 하나가 숨는 편이 없는 이적을 만드는 것보다 낫다)
  const suitorBid = stage === "offer" && evidence.split(/(?<=[.!?])\s+/u).some((sentence) =>
    !RENEWAL.test(sentence) && suitors.some((c) => quotedIn(sentence, c) || detectClubs(sentence).includes(c)));
  if (!to && !suitorBid && stage && !DEAD.includes(stage) && stage !== "rumour" && loan.form !== "loan_extend" && RENEWAL.test(evidence)) {
    return { kind: "not_move", evidence: clampCp(evidence, EVIDENCE_MAX_CHARS), renewal: true };
  }
  const s = judgeSummary(obj.summary_ko, corrections);
  // 임대 금액(임대료·조항 금액)은 임대 형태의 판정에서만 받는다 — 완전 이적으로 접힌 판정에 남으면 이적료처럼 그려진다
  let fee = judgeFee(obj.fee, sentText);
  if (fee && LOAN_FEE_KINDS.has(fee.kind) && !(loan.form && LOAN_FORMS.includes(loan.form))) fee = null;
  return {
    kind: "move",
    // 모델이 적은 그대로의 구단 표기 — 요약에 영문으로 남은 구단명을 한국어로 바꾸는 데 쓴다(`localizeSummary`)
    rawClubs: [obj.from, obj.to, ...(Array.isArray(obj.suitors) ? obj.suitors : []), obj.on_loan?.owner, obj.on_loan?.at].filter((c) => typeof c === "string" && c.trim()),
    player: found,
    playerKo: koNameOf(obj.player_ko, corrections),
    stage,
    evidence: clampCp(evidence, EVIDENCE_MAX_CHARS),
    from,
    to,
    suitors,
    form: loan.form,
    loanOwner: loan.owner,
    loanClub: loan.at,
    loanClause: loan.clause,
    fee,
    summary: s.text ?? null,
    summaryIssue: s.reason ?? null,
  };
}

/** 나열의 이음말 — "A, B and C"·"A as well as B"·"A, alongside B". 쉼표나 접속사 중 하나는 있어야 나열이다(공백만으로는 아니다) */
const LIST_JOIN = String.raw`(?:,\s*(?:(?:and|or|&|as well as|alongside|plus|along with)\s+)?|\s+(?:and|or|&|as well as|alongside|plus|along with)\s+)(?:the\s+)?`;

/** to가 원문에서 suitors 중 하나와 같은 나열에 묶여 있는가 — "Tottenham, Newcastle and Chelsea are interested"의 Tottenham */
export function isEnumeratedWith(text, to, suitors) {
  const t = normalizeQuote(text);
  const e = (s) => escapeRe(normalizeQuote(s));
  return suitors.some((s) => new RegExp(`${e(to)}${LIST_JOIN}${e(s)}|${e(s)}${LIST_JOIN}${e(to)}`, "u").test(t));
}

/** 그 구단이 "여럿 중 하나"로 언급됐다는 표지 — 이름이 하나뿐이어도 관심 구단은 여럿이다("Championship clubs and Celtic are eyeing …") */
const PLURAL_CUE = /\b(?:among|one of|also|several|a host of|number of|clubs|sides|teams)\b/iu;
/**
 * 같은 뜻의 **엄격한** 표지 — 모델이 직접 적은 행선지를 내릴 때 쓴다. 잘못 내리면 맞는 행선지를 잃으므로 "also"처럼 다른 뜻으로도
 * 쓰이는 낱말은 빼고("Bayern are also eyeing X"의 also는 다른 선수 얘기다), 구단·팀을 가리키는 복수 표현만 남긴다.
 */
const STRICT_PLURAL_CUE = /\b(?:among (?:the |those |several |many )?(?:clubs|sides|teams|suitors|those)|one of (?:the |several |many |a number of |[a-z]+ )?(?:clubs|sides|teams|suitors)|other (?:clubs|sides|teams|suitors)|several (?:[\w-]+ ){0,3}(?:clubs|sides|teams|suitors)|a (?:host|number) of (?:[\w-]+ ){0,3}(?:clubs|sides|teams|suitors))\b/iu;
const sentencesWith = (text, name) => String(text).split(/(?<=[.!?])\s+|\n+/u).filter((s) => normalizeQuote(s).includes(normalizeQuote(name)));
/** 영입 관심·행선지를 말하는 낱말 — 구단이 그냥 언급된 것과 가른다 */
const SUITOR_CUE = /\b(?:interest(?:ed)?|target(?:s|ed|ing)?|keen|monitor(?:ing|ed)?|tracking|eyeing|eye|wants?|bid|offer|approach(?:ed)?|linked|swoop|pursu(?:e|it|ing)|sign(?:ing)?|move for|radar)\b/iu;
/** 한 문장짜리 글로 치는 길이 — 가십 항목·트윗. 긴 기사는 구단이 여럿 스쳐 가서 "하나뿐"이 뜻을 잃는다 */
const LONE_CLUB_MAX_CHARS = 350;

/**
 * 모델이 행선지도 관심 구단도 비워 보냈는데, 짧은 글에 출발 구단 말고 **구단이 하나뿐**이고 영입 관심을 말하는 글이면 그 구단이
 * 행선지다(감사: 이카르디 → 토트넘, 코네 → 첼시). 전 소속("former X"·"from X")으로 나온 구단, 복수 표지가 있는 글은 받지 않는다.
 * @returns 정규 영문명 또는 null
 */
export function loneOtherClub(text, from, exclude = []) {
  if ([...text].length > LONE_CLUB_MAX_CHARS || text.includes("[기사 본문]")) return null;
  const origin = from ? (detectClubs(from)[0] ?? null) : null;
  if (!origin) return null; // 출발 구단을 모르면 남은 하나가 출발인지 행선지인지 알 수 없다
  // 행선지가 될 수 없는 구단(판정이 읽은 임대 구단·보유 구단)은 "하나뿐"을 셀 때도 뺀다
  const skip = new Set(exclude.filter(Boolean).map((c) => detectClubs(c)[0] ?? c));
  const others = detectClubs(text).filter((c) => c !== origin && !skip.has(c));
  if (others.length !== 1) return null;
  // 이름 없는 구단 무리("Championship clubs"·"several sides")가 함께 나오면 관심 구단이 여럿이다(`PLURAL_CUE`) — 하나로 확정하지 않는다
  if (/\b(?:former|ex-)/iu.test(text) || PLURAL_CUE.test(text) || !SUITOR_CUE.test(text)) return null;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/u);
  if (collectVotes(sentences, FROM, null, 1).has(others[0])) return null; // "joined from X" — 떠나온 구단이다
  return others[0];
}

/**
 * 이름이 적힌 관심 구단이 하나여도 원문이 **다른 관심 구단들**을 암시하면 행선지로 올리지 않는다 —
 * "Besiktas were among the sides interested"·"who is also attracting interest from Barcelona"가 행선지로 확정됐다(재측정).
 * 그 구단이 나오는 문장만 본다.
 */
function hintsOtherSuitors(text, suitor) {
  const name = normalizeQuote(suitor);
  return String(text).split(/(?<=[.!?])\s+|\n+/u).some((s) => normalizeQuote(s).includes(name) && PLURAL_CUE.test(s));
}

/**
 * 행선지 정규화 — 지시문("관심 구단이 하나뿐이면 to, 여럿이면 to는 null")을 모델이 **양방향으로** 어긴다
 * (감사 111건: 하나뿐인데 suitors에만 둔 것 7건, 여럿인데 첫 구단을 to로 확정한 것 2건). 지시문으로는 안 잡혀 코드가 정규화한다.
 * - to가 없고 suitors가 하나뿐이면 그 구단이 행선지다 — 단 원문이 다른 관심 구단을 암시하면(`hintsOtherSuitors`) 올리지 않는다.
 * - to가 suitors 중 하나와 같은 나열에 묶여 있으면 관심 구단 중 하나일 뿐이다 → suitors 맨 앞으로 내린다.
 *   "Chelsea are monitoring X but may face competition from United and Liverpool"처럼 to가 나열 밖이면(주된 구단) 그대로 둔다.
 * - to 하나만 있고 원문이 그 구단을 "여러 구단 중 하나"(`STRICT_PLURAL_CUE`)로 말하면 관심 구단으로 내린다.
 * @param {{ to: string | null, suitors: string[] }} m 원문 표기(mentionIn을 지난 값)
 */
export function normalizeDestination({ to, suitors }, sentText) {
  if (!to && suitors.length === 1 && !hintsOtherSuitors(sentText, suitors[0])) return { to: suitors[0], suitors: [] };
  // 모델이 하나만 적어 행선지로 확정했어도 원문이 "여러 구단 중 하나"라 하면 관심 구단이다(감사: 브랜스웨이트 → 레알, 엔드릭 → 맨유)
  if (to && !suitors.length && sentencesWith(sentText, to).some((s) => STRICT_PLURAL_CUE.test(s))) return { to: null, suitors: [to] };
  if (to && suitors.length && isEnumeratedWith(sentText, to, suitors)) return { to: null, suitors: [to, ...suitors].slice(0, SUITORS_MAX) };
  return { to, suitors };
}

/**
 * 요약의 이름을 사전 표기로 맞춘다 — 선수를 비워 물은 보도(규칙이 선수를 못 뽑았거나 넓힌 후보)는 <표기>에 선수가 실리지 않아
 * 모델이 제 표기로 적는다. 같은 선수가 요약마다 "JJ Gabriel"·"JJ 가브리엘"·"JJ 개브리얼", "마누/마뉴 코네"로 갈렸다(재실행).
 * - 선수: 영문 이름과 모델이 적은 한글 표기를 사전 표기(`ko`)로 바꾼다.
 * - 구단: 모델이 영문 그대로 남긴 구단명(`rawClubs`·정규명)을 사전의 한국어 이름으로 바꾼다.
 * 길이 상한을 넘기면 바꾸지 않은 요약을 돌려준다.
 */
export function localizeSummary(summary, { player, playerKoByModel, ko, rawClubs = [], clubKo = () => null }) {
  let out = summary;
  if (ko) {
    if (playerKoByModel && playerKoByModel !== ko) out = renameInSummary(out, playerKoByModel, ko);
    if (player) out = out.split(player).join(ko);
    // 영문 성만 남은 자리("Gakpo는") — 사전 표기의 성으로 바꾼다. 라틴 낱말 경계에서만(한글 조사는 바로 붙는다), 3자 이상만(짧은 성은
    // 다른 낱말 속에서 맞는다)
    const surname = player?.trim().split(/\s+/u);
    if (surname && surname.length >= 2 && [...surname.at(-1)].length >= 3) {
      const koSurname = ko.trim().split(/\s+/u).at(-1);
      out = out.replace(new RegExp(`(?<![\\p{Script=Latin}\\p{M}])${escapeRe(surname.at(-1))}(?![\\p{Script=Latin}\\p{M}])`, "gu"), koSurname);
    }
  }
  for (const raw of [...new Set(rawClubs)].sort((a, b) => b.length - a.length)) {
    if (!/[A-Za-z]/u.test(raw) || !out.includes(raw)) continue;
    const name = clubKo(raw);
    // 이미 그 한국어 이름이 적혀 있으면 건드리지 않는다 — "PSV 에인트호번"의 "PSV"를 또 바꿔 "PSV 에인트호번 에인트호번"이 됐다
    if (name && name !== raw && !out.includes(name)) out = out.split(raw).join(name);
  }
  // 원출력의 구단 칸에 없던 영문 구단명("Sporting", "Al-Ittifaq")도 구단 사전·확인 캐시로 풀리면 한국어로 바꾼다. 영문 구절이 **통째로**
  // 구단 하나로 풀릴 때만(사람 이름·다른 낱말 속 구단은 건드리지 않는다)
  out = out.replace(/(?<![\p{Script=Latin}\p{M}])\p{Lu}[\p{Script=Latin}\p{M}'’.&-]*(?:[ -][\p{Lu}0-9][\p{Script=Latin}\p{M}0-9'’.&-]*)*/gu, (phrase) => {
    // "Everton Soares"(선수)·"Bologna Rangers"처럼 구단 이름을 품은 다른 구절을 바꾸지 않는다 — 별칭과 통째로 같거나, 사전 밖이면 확인된 이름과 같아야 한다
    if (detectClubs(phrase).length && !isClubName(phrase)) return phrase;
    const name = clubKo(phrase);
    return name && name !== phrase && !out.includes(name) ? name : phrase;
  });
  return [...out].length <= SUMMARY_MAX_CHARS ? out : summary;
}

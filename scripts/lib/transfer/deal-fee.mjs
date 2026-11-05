/**
 * 딜 금액 규칙 — 보도 한 건의 금액(`feeFor`), 딜 금액 후보 거르기(`dealFee`·`feeKindAllowed`), 금액 문장의 시점·낸 구단 판정을 갖는다.
 * 판정 해석의 금액 대조(`judge-parse.mjs`의 `judgeFee` — `moneyMentions`·`sameAmount`)와 허용치가 맞물려 있어 함께 본다.
 * 금액 성격(`judge-prompt.mjs`의 `FEE_KINDS`·`LOAN_FEE_KINDS`)이 늘면 `feeKindAllowed`·`BUYER_BOUND_KINDS`도 함께 고친다.
 */
import { canonicalClubName } from "./clubs.mjs";
import { moneyMentions } from "./judge-parse.mjs";
import { LOAN_FEE_KINDS } from "./judge-prompt.mjs";
import { hasRawVerdict } from "./judge-queue.mjs";
import { sameAmount } from "./util.mjs";
import { verdictOf } from "./verdict-columns.mjs";

/** 그 행에서 그 선수의 이적료 — 행의 `fee_*`가 아니라 **선수가 나오는 문장**에서 다시 읽는다(다선수 기사에서 남의 금액이 섞인다) */
function feeOf(storySentences, memo) {
  for (const s of [...storySentences].reverse()) {
    const ex = memo.extract(s);
    if (ex.feeText && ex.feeAmount >= 0.005) return { amount: ex.feeAmount, currency: ex.feeCurrency, text: ex.feeText };
  }
  return null;
}

/**
 * 그 행에서 그 선수의 금액과 성격. **금액까지 읽는 형식으로 판정된 행(`verdict_raw`가 있다)은 판정자의 값이 전부다** — 판정자가
 * 금액이 없다고 했으면 없는 것이다. 규칙은 문장에서 가장 큰 금액을 집어 같은 기사의 남의 금액(다른 선수의 옵션 £47m)을 그 딜에 붙였다(운영).
 * 판정이 없거나 옛 형식이면 규칙이 읽은 금액이고 성격은 모른다(null).
 */
export function feeFor(r, key, storySentences, memo) {
  if (verdictOf(r, key) === "move" && hasRawVerdict(r)) {
    if (r.verdict_fee_amount == null) return null;
    const amount = Number(r.verdict_fee_amount);
    const symbol = { GBP: "£", EUR: "€", USD: "$" }[r.verdict_fee_currency] ?? "";
    return { amount, currency: r.verdict_fee_currency, text: `${symbol}${amount}m`, kind: r.verdict_fee_kind ?? null };
  }
  const fee = feeOf(storySentences, memo);
  return fee ? { ...fee, kind: null } : null;
}

/** 이적료 — 최신 보도의 값 + 같은 통화의 직전 다른 값 + 같은 통화 보도 범위 */
export function resolveFee(items) {
  const withFee = items.filter((it) => it.fee);
  if (!withFee.length) return { fee: null, prev: null, low: null, high: null };
  const latest = withFee.at(-1).fee;
  const same = withFee.map((it) => it.fee).filter((f) => f.currency === latest.currency);
  const prev = [...same].reverse().slice(1).find((f) => f.amount !== latest.amount)?.amount ?? null;
  const amounts = same.map((f) => f.amount);
  return { fee: latest, prev, low: Math.min(...amounts), high: Math.max(...amounts) };
}

/*
 * ── 딜 금액으로 쓸 수 있는 금액 ─────────────────────────────────────────
 * 보도 한 건의 금액(`feeFor`)이 곧 딜의 금액이 되지는 않는다. 판정자는 "그 선수의 금액 하나"를 고르는데, 이적설 기사는 그 선수의
 * **지난** 금액(지난 창에 거절된 제안 · 지금 구단이 데려올 때 낸 이적료)이나 **다른 구단의** 제안을 함께 적는다. 그 금액이 딜의
 * 금액이 되면 화면이 "첼시 → 제안액 £55.5M"처럼 남의 제안을 지금 딜의 값으로 그린다(운영 — 콴사: TO 맨 앞은 첼시인데 £55.5m은
 * 거절된 아스날의 제안 · 스콧: "지난여름 £64m 제안이 거절됐다" · 무하레모비치: 리즈가 사수올로에 낸 £34m이 "추정 이적료").
 * 그래서 딜 금액 후보는 아래를 모두 지난 것만이다(`dealFee`). 판정 원출력에는 금액별 시점이 없다(시점 `timing`은 보도 전체의 것이고
 * `past`면 이미 "이동 아님"으로 접혀 여기 오지 않는다) — 그래서 금액의 시점은 그 금액이 적힌 문장에서 읽는다.
 *   1. 판정이 있는 딜에서 **성격 없는 규칙 금액은 쓰지 않는다** — 판정자가 그 보도의 금액이 없다고 했거나(남의 금액),
 *      옛 형식 판정이라 누구의 금액인지 모른다.
 *   2. 사는 쪽에 묶인 금액(`fee` 이적료 · `bid` 제안액)은 **그 금액을 낸 구단이 딜의 상대**여야 한다 — 딜의 상대 = 행선지,
 *      없으면 관심 구단 맨 앞(화면의 TO 맨 앞). 낸 구단은 그 금액이 적힌 문장의 구단(출발 구단 빼고)이고, 문장에 구단이 없으면
 *      그 보도 판정의 행선지(없으면 관심 구단이 하나뿐일 때 그 구단)다. 요구액·바이아웃·평가액은 파는 쪽의 값이라 상대와 무관하다.
 *   3. **지난 금액은 쓰지 않는다** — 지난 때를 말하는 표현이 **그 금액에 붙어 있을 때만**(`isPastFee`). 같은 문장에 금액이 둘이면
 *      표현은 가장 가까운 금액의 것이다("submitted a £70m bid after a previous £60m offer was rejected"의 previous는 £60m의 것).
 *      완료·확정·합의 보도의 이적료는 보지 않는다(그 딜의 값이다).
 * ⚠ 한계 — 문장에서 구단을 못 읽으면(별칭 "the Blues") 판정의 행선지로 대신 본다. 금액이 원문 발췌에 없고 기사 본문에만 있으면
 *   (본문은 저장하지 않는다) 근거 구절·요약만 보므로 시점을 놓칠 수 있다. 한 문장이 두 구단의 제안을 함께 말하면 딜의 상대가
 *   그 문장에 있는 한 받는다(지우는 쪽보다 남기는 쪽으로 기운다 — 빈 칸보다 틀린 칸이 나쁘지만 이 경우는 상대의 금액일 수 있다).
 */
const BUYER_BOUND_KINDS = new Set(["fee", "bid", "loan_fee", "buy_clause"]);
/**
 * 임대의 금액(임대료·완전 이적 조항 금액)은 **시점을 보지 않는다** — 여름에 맺은 임대의 조항 금액은 시즌 내내 그 딜의 값이다
 * ("joined on loan last summer with a £42.5m obligation"의 last summer가 금액을 지난 것으로 만들면 안 된다).
 * 낸 쪽(임대 구단)이 딜의 상대인지는 본다 — 임대 중인 선수의 제3구단 이적설에 보유 구단–임대 구단 사이의 조항 금액이 붙지 않게.
 */
/**
 * 딜 형태별로 대표 금액이 될 수 있는 성격 — 임대(새 임대·연장·조기 복귀)는 임대료·조항 금액만이다. 임대설 기사가 곁들이는 선수의
 * 평가액·요구액을 헤드라인에 걸면 임대가 그 금액의 이적처럼 읽힌다(엔드릭: 임대설인데 "€40M 평가액" — 운영).
 * 완전 영입 전환은 임대료를 빼고 전부(조항 금액·이적료·제안액·평가액)다. 그 밖(완전 이적·모름)은 임대료·조항 금액만 뺀다.
 */
export function feeKindAllowed(form, kind) {
  if (kind == null) return true;
  if (form === "loan" || form === "loan_extend" || form === "loan_recall") return LOAN_FEE_KINDS.has(kind);
  if (form === "loan_convert") return kind !== "loan_fee";
  return !LOAN_FEE_KINDS.has(kind);
}
/**
 * 지난 때를 혼자서 말하는 표현. ⚠ "in the January window"·"over the summer"는 여기 없다 — 앞으로의 일("are planning a £60m bid
 * in the January transfer window"·"will table a £60m bid over the summer")에도 그대로 쓰여, 과거 동사와 함께일 때만 지난 때다(`AMBIGUOUS_TIME_EN`).
 */
const PAST_TIME_EN = /\b(?:last\s+(?:summer|season|year|window|january|winter|month)|earlier\s+(?:this|in\s+the)\s+(?:year|summer|window|month)|back\s+in|(?:a|one|two|three|four|\d+)\s+(?:years?|months?)\s+ago|previous(?:ly)?|this\s+past\s+summer)\b/giu;
/** 앞으로의 일일 수 있는 때 — 달 이름("in January")·창("in the summer window")·"over the summer". 과거 동사와 함께일 때만 지난 때다 */
const AMBIGUOUS_TIME_EN = /\b(?:(?:in|during|since)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|in\s+the\s+(?:summer|january|winter)\s+(?:transfer\s+)?window|(?:over|during|in)\s+the\s+summer)\b/giu;
const PAST_DEAL_VERB = /\b(?:had|was|were|been)\b[^.]{0,80}?\b(?:rejected|knocked\s+back|turned\s+down|snubbed|refused|rebuffed)\b|\b(?:paid|spent|splashed|forked\s+out|bought\s+him|signed\s+him)\b/iu;
/**
 * 지난 때 표현이 금액에 붙었다고 보는 거리(낱말 수). 운영 사례의 거리는 7낱말 이하다(스콧 "£64million offer knocked back by the
 * Cherries in July" — 7 · "a £64m offer for X rejected by Benfica last summer" — 7). 그보다 멀면 대개 다른 동사구의 때라 10에서 끊는다.
 * 같은 문장의 다른 금액이 더 가까우면 거리와 무관하게 그 금액의 것이다(`nearestMoney`).
 */
const PAST_CUE_WORDS = 10;
const PAST_TIME_KO = /지난\s?(?:여름|겨울|시즌|해|\d+\s?월|이적\s?시장|이적\s?창)|작년|지난해|당시|과거/gu;
/** 절 나누기 — 지난 제안과 지금의 관심이 한 문장에 함께 나온다("had a £64m offer knocked back in July but their interest remains") */
const CLAUSE_EN = /[,;:—–]|\s(?:but|while|whereas|although|though|however)\s/iu;
const CLAUSE_KO = /[,，.;]|(?:으나|지만|는데)\s/u;

/** 그 금액(같은 통화)이 적힌 문장 — 저장된 글과 판정 근거 구절에서 찾는다 */
function feeSentences(r, fee, memo) {
  const same = (m) => m.currency === fee.currency && sameAmount(m.amount, fee.amount);
  const pool = [...memo.sentences(r), ...(r.verdict_evidence ? [r.verdict_evidence] : [])];
  return pool.filter((s) => moneyMentions(s).some(same));
}

/** 글을 낱말로 나눈다 — 각 낱말의 시작 위치와 함께(정규식 일치 위치를 낱말 번호로 옮기는 데 쓴다) */
function wordsOf(text) {
  return [...text.matchAll(/\S+/gu)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
}
const wordAt = (words, index) => Math.max(0, words.findIndex((w) => w.end > index));

/** 영문 절의 금액 위치 — 금액 표기가 **시작되는** 낱말 번호와 그 금액들(`moneyMentions` — "60 million euros"처럼 세 낱말까지) */
function moneyWordsEn(words) {
  const out = [];
  const read = (from) => moneyMentions(words.slice(from, from + 3).map((w) => w.text).join(" "));
  for (let i = 0; i < words.length; i++) {
    if (!/^[("'“‘]?[£€$\d]/u.test(words[i].text)) continue;
    // 이 낱말에서 시작하는 금액만 — 뒤 낱말에서 시작하는 금액("20 goals £60m"의 £60m)은 그 낱말의 몫이다
    const rest = read(i + 1).map((m) => `${m.currency}:${m.amount}`);
    const mentions = read(i).filter((m) => {
      const at = rest.indexOf(`${m.currency}:${m.amount}`);
      if (at < 0) return true;
      rest.splice(at, 1);
      return false;
    });
    if (mentions.length) out.push({ index: i, mentions });
  }
  return out;
}

/** 표현(낱말 범위 [from, to])에서 가장 가까운 금액 위치와 거리 — 같으면 뒤의 금액("previous £60m"처럼 앞에서 꾸민다) */
function nearestMoney(spots, from, to) {
  let best = null;
  for (const spot of spots) {
    const d = spot.index > to ? spot.index - to : spot.index < from ? from - spot.index : 0;
    if (!best || d < best.d || (d === best.d && spot.index > best.spot.index)) best = { spot, d };
  }
  return best;
}

/** 영문 절에서 지난 때 표현이 그 금액에 붙어 있는가 — 가장 가까운 금액이 그 금액이고 `PAST_CUE_WORDS` 안 */
function pastCueOnAmountEn(clause, same) {
  const words = wordsOf(clause);
  const spots = moneyWordsEn(words);
  if (!spots.some((x) => x.mentions.some(same))) return false;
  const attached = (re) => [...clause.matchAll(re)].some((m) => {
    const near = nearestMoney(spots, wordAt(words, m.index), wordAt(words, m.index + m[0].length - 1));
    return near && near.d <= PAST_CUE_WORDS && near.spot.mentions.some(same);
  });
  return attached(PAST_TIME_EN) || (PAST_DEAL_VERB.test(clause) && attached(AMBIGUOUS_TIME_EN));
}

/** 한국어 금액 표기 → 백만 단위("£64m"·"6400만 파운드"·"1억 2000만 유로")와 시작 위치 */
function koMoney(clause) {
  const out = [];
  const SYMBOL = { "£": "GBP", "€": "EUR", "$": "USD" };
  const WORD = { 파운드: "GBP", 유로: "EUR", 달러: "USD" };
  const num = (raw) => Number(String(raw).replace(/,/gu, ""));
  // 뒤에 한국어 조사가 붙는다("£60m을") — 영문 글자·숫자만 이어지지 않으면 된다
  for (const m of clause.matchAll(/([£€$])\s?(\d[\d.,]*)\s?(bn|billion|million|mn|m|k)?(?![A-Za-z\d])/giu)) {
    const unit = (m[3] ?? "").toLowerCase();
    const n = num(m[2]);
    const amount = unit.startsWith("b") ? n * 1000 : unit.startsWith("k") ? n / 1000 : unit ? n : n >= 10_000 ? n / 1_000_000 : null;
    if (Number.isFinite(amount) && amount > 0) out.push({ amount: Math.round(amount * 100) / 100, currency: SYMBOL[m[1]], index: m.index });
  }
  // "6400만 파운드" — 만은 1만(1e4), 억은 1e8. 백만 단위로 옮기면 만 ÷ 100, 억 × 100
  for (const m of clause.matchAll(/(?:(\d[\d.,]*)\s?억\s?)?(?:(\d[\d,]*)\s?만\s?)?(파운드|유로|달러)/gu)) {
    if (m[1] == null && m[2] == null) continue;
    const amount = (m[1] != null ? num(m[1]) * 100 : 0) + (m[2] != null ? num(m[2]) / 100 : 0);
    if (amount > 0) out.push({ amount: Math.round(amount * 100) / 100, currency: WORD[m[3]], index: m.index });
  }
  return out;
}

/**
 * 관형형으로 끝나는 낱말("거절된"·"낸"·"넣은"·"제시했던") — 끝 음절의 받침이 ㄴ이거나 "던". 한 글자 관형형("낸")은 금액 바로 앞에서만
 * 센다(`minLength` 1) — 사이의 낱말로는 한 글자 이름("존 도"의 "존")과 갈리지 않는다.
 */
function isAdnominal(word, minLength = 2) {
  const w = word.replace(/[^가-힣]+$/u, "");
  if ([...w].length < minLength) return false;
  const last = w.at(-1);
  if (last === "던") return true;
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 === 4;
}

/**
 * 한국어 요약 절에서 "지난 …" 표현이 그 금액을 **꾸미는가**. 받는 형태는 둘이다:
 *   - 바로 앞("지난여름 £64m 제안" · "당시 £64m")
 *   - 표현이 여는 관형절이 그 금액 바로 앞에서 닫힌다("지난여름 본머스의 존 도에게 낸 £64m 제안" · "지난여름 거절된 £64m 제안").
 *     그 사이에 다른 관형형이 끼면 표현은 다른 명사를 꾸민다("지난 시즌 20골을 넣은 벤피카의 존 도에게 6000만 파운드 제안" —
 *     "지난 시즌"은 선수의 활약이다).
 * 절 첫머리의 때 부사("지난 7월 본머스 소속 존 도에게 £64m 제안을 넣었지만")는 받지 않는다 — 한국어 요약은 지금의 소식도
 * 과거형으로 쓰므로 그 꼴로는 지금의 제안과 가를 수 없다. 영문 쪽(근거 구절·원문)이 시점을 말하면 그쪽이 거른다.
 */
function pastCueOnAmountKo(clause, fee) {
  const words = wordsOf(clause);
  const targets = koMoney(clause).filter((m) => m.currency === fee.currency && sameAmount(m.amount, fee.amount)).map((m) => wordAt(words, m.index));
  if (!targets.length) return false;
  return [...clause.matchAll(PAST_TIME_KO)].some((m) => {
    const cueEnd = wordAt(words, m.index + m[0].length - 1);
    return targets.some((t) => {
      if (t <= cueEnd) return false;
      if (t === cueEnd + 1) return true;
      const between = words.slice(cueEnd + 1, t);
      return isAdnominal(between.at(-1).text, 1) && !between.slice(0, -1).some((w) => isAdnominal(w.text));
    });
  });
}

/** 그 금액이 지난 일의 것인가 — 영문 절 또는 한국어 요약 절에서 지난 때 표현이 그 금액에 붙어 있다 */
function isPastFee(r, fee, sentences) {
  if (fee.kind === "fee" && ["official", "here_we_go", "agreement"].includes(r.verdict_stage)) return false;
  if (LOAN_FEE_KINDS.has(fee.kind)) return false;
  const same = (m) => m.currency === fee.currency && sameAmount(m.amount, fee.amount);
  for (const s of sentences) for (const clause of s.split(CLAUSE_EN)) if (pastCueOnAmountEn(clause, same)) return true;
  if (r.summary_ko) for (const clause of r.summary_ko.split(CLAUSE_KO)) if (pastCueOnAmountKo(clause, fee)) return true;
  return false;
}
/** 그 금액을 낸 구단 — 금액 문장에 나온 구단(출발 구단 빼고). 없으면 그 보도 판정의 행선지 · 관심 구단이 하나뿐이면 그 구단 */
function feePayers(r, sentences, sellers, memo) {
  const named = new Set(sentences.flatMap((s) => memo.extract(s).clubs).map((c) => canonicalClubName(c)).filter((c) => !sellers.has(c)));
  if (named.size) return named;
  const fallback = r.verdict_to ?? (r.verdict_suitors?.length === 1 ? r.verdict_suitors[0] : null);
  return new Set(fallback ? [fallback] : []);
}
/**
 * 딜 금액 후보로 쓸 수 있는 금액만 남긴다(위 절의 1~3). 판정이 없는 딜(규칙만으로 열린 옛 딜)은 지금처럼 규칙 금액을 쓴다.
 * @param {{ judged: boolean, target: string | null, sellers: Set<string> }} ctx target = 딜의 상대(행선지, 없으면 관심 구단 맨 앞)
 */
export function dealFee(it, ctx, memo) {
  const fee = it.fee;
  if (!fee) return null;
  if (ctx.judged && fee.kind == null) return null;
  if (fee.kind == null) return fee;
  const sentences = feeSentences(it.row, fee, memo);
  if (isPastFee(it.row, fee, sentences)) return null;
  if (BUYER_BOUND_KINDS.has(fee.kind)) {
    const sellers = new Set([...ctx.sellers, it.row.verdict_from].filter(Boolean));
    const payers = feePayers(it.row, sentences, sellers, memo);
    if (!ctx.target || !payers.has(ctx.target)) return null;
  }
  return fee;
}

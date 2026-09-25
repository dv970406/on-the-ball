import { detectClubs, isClubName } from "./clubs.mjs";

/**
 * 규칙 기반 구조화 추출.
 *
 * LLM 을 붙이면 정확도가 올라가지만, 우선 규칙으로 시작한다.
 * `extractTransfer`의 시그니처(text → 결과)를 지키는 한 나중에 갈아끼울 수 있다.
 * 규칙을 고쳤으면 `node scripts/test-transfer-extract.mjs`로 회귀를 확인하고
 * `node scripts/sync-transfer-news.mjs --reprocess`로 저장분을 다시 추출한다.
 */

/**
 * 단계 판정 규칙. 위에서부터 먼저 매칭되는 것이 이긴다.
 * 순서가 곧 우선순위다 — 무산/공식 발표가 협상 표현보다 앞서야 한다.
 */
const STAGE_RULES = [
  // 무산·중단이 최우선. "합의했지만 무산" 같은 문장에서 뒤집히면 안 된다.
  //
  // ⚠️ "never in doubt" 함정: 로마노의 확정 트윗은 "never in doubt and now done" 으로 끝난다.
  //    단순히 /in doubt/ 로 잡으면 HERE WE GO 확정 건이 '무산'으로 뒤집힌다(실제로 발생했다).
  //    부정어가 앞에 붙은 경우를 반드시 배제할 것.
  {
    stage: "collapsed",
    pattern:
      /\b(collapsed|called off|broken down|rebuffed|(?<!not )(?<!never )(?:turned down|reject(?:s|ed)?)|will not negotiate|no longer (?:interested|pursuing)|not going to join|off the table)\b|(?<!never )(?<!not )\bin (?:serious )?doubt\b/i,
  },
  // 로마노 확정 시그널
  // ⚠ "아직 아니다"를 말하는 문장을 배제한다. 로마노는 합의 단계에서 "Formal steps needed
  //   **ahead of the here we go**"라고 쓰는데, 문구만 보면 확정으로 뒤집힌다(실제 수집 글에서 났다 —
  //   구두 합의 보도가 확정으로 분류됐다). "never in doubt"와 같은 유형의 함정이다.
  // ⚠ 판정은 `detectStage`가 따옴표를 걷고 공백을 한 칸으로 접은 사본으로 한다 —
  //   `ahead of the “here we go”`·줄바꿈이 끼면 부정 문맥이 문자 그대로 어긋나 확정으로 빠졌다.
  // ⚠ "yet again"은 확정이다(원본이 맞히던 것) — "yet"만 막으면 그 문장이 unknown으로 떨어진다.
  {
    stage: "here_we_go",
    pattern:
      /(?<!\b(?:ahead of|before|prior to|pending|awaiting|waiting for|no more|no|not yet|until) (?:the )?)\bhere we go\b(?!(?:\W{1,3}(?:is|could|would|will|now|very|come|coming|be|get|set|to)){0,3}\W{1,3}(?:soon|expected|imminent|close|to follow)\b|\s*\?|\s+yet\b(?! again))/i,
  },
  // 공식 발표
  {
    stage: "official",
    pattern:
      /\b(have announced|has announced|official(?:ly)? (?:announced|confirmed|signing)|completes? (?:a )?(?:move|transfer|signing)|completed the signing|complete[sd]? (?:the )?signing|club statement|(?:is|has) join(?:ing|ed)|announce the signing|confirm(?:s|ed)? (?:his |the )?(?:move|signing|transfer)|confirm(?:s)? .{0,30}has joined|unveil(?:s|ed)?)\b/i,
  },
  // 공식 발표 헤드라인 — 로마노는 공식 발표를 "Official, …"·"OFFICIAL: …"로 **글머리에** 쓴다.
  // ⚠ 글머리(앞의 이모지·"RT @계정:" 제외)로만 좁힌다. 본문 중간의 "official"은 "official bid"·
  //   "not official yet"처럼 단계를 말하지 않는 경우가 많다.
  // ⚠ **공식 발표가 전부 이적은 아니다** — 재계약·경기 연기·감독 경질/선임·"not for sale"까지
  //   공식 발표로 올라갔다(QA: 적대 문장 11건 중 9건, 실제 수집 글 1건 — 여자팀 재계약).
  //   그래서 이적 동사가 함께 있어야 하고, 재계약·운영 공지 표현이 있으면 빠진다.
  {
    stage: "official",
    pattern:
      /^(?:RT @\w+:\s*)?[^\p{L}\p{N}]*official\b\s*[,:!.—–-](?![\s\S]*\b(?:new (?:deal|contract)|contract extension|extends?|extension|renew(?:s|ed|al)?|(?:first )?professional (?:contract|deal)|first senior (?:deal|contract)|postponed|sacked|appoint(?:s|ed|ment)?|not for sale|full[- ]time)\b)(?=[\s\S]*\b(?:joins?|joined|signs?|signed|signing|completes?|completed|move|transfer|loan|arrives?)\b)/iu,
  },
  { stage: "medical", pattern: /\bmedical\b/i },
  // 개인 조건. "on personal terms" 처럼 전치사가 붙는 형태까지 포함한다.
  { stage: "personal_terms", pattern: /\bpersonal terms\b/i },
  // 합의. 로마노는 "verbal agreement" 를 상시 사용하므로 반드시 포함해야 한다.
  {
    stage: "agreement",
    pattern:
      /\b(?:verbal |full |total |complete )?agreement\b|\b(?:reach(?:ed|es)? (?:an? )?agreement|agreement in principle|strike[sd]? (?:an? )?agreement|accept(?:ed|s)? (?:a|an|the)? ?(?:€|£|\$)?[\d.]*m? ?(?:bid|offer)|agree[sd]? (?:a |an |the )?(?:£|€|\$)?[\d.,]*m? ?(?:deal|fee|move|transfer)|deal (?:is )?(?:agreed|done)|finalising (?:an? )?(?:agreement|deal)|close to (?:finalising|completing))\b/i,
  },
  {
    stage: "offer",
    pattern:
      /\b(submit(?:ted|s)? (?:an? )?(?:offer|bid|proposal)|make[sd]? (?:an? )?(?:offer|bid|approach)|made (?:an? )?(?:offer|bid|approach)|(?:offer|bid|proposal) (?:of|worth)|opening (?:bid|offer)|enquir(?:y|ed)|approach(?:ed)? (?:for|to)|loan offer)\b/i,
  },
  {
    stage: "talks",
    pattern:
      /\b((?:in|holding|advancing in|advanced) talks|negotiat(?:ing|ions)|discussions? (?:with|over)|working on (?:a )?deal|close to (?:an? )?(?:deal|agreement)|closing in on|advanced negotiations)\b/i,
  },
  {
    stage: "rumour",
    pattern:
      /\b(interested in|monitor(?:ing)?|eye(?:ing)?|target(?:ing)?|linked with|considering|exploring (?:a )?(?:deal|move)|keen on|weighing|scouting)\b/i,
  },
];

/** 부상 보도 표현 — "구단이 발표했다"가 이적 발표가 아닌 가장 흔한 경우다 */
const INJURY = /\b(?:injur(?:y|ies|ed)|ligament|ruled out|surgery|fracture|diagnosed|hamstring|sidelined)\b/i;
/** 이적을 말하는 동사·명사 — 부상 보도에 이게 없으면 이적 단계가 아니다 */
const TRANSFER_WORD = /\b(?:sign(?:s|ed|ing)?|join(?:s|ed|ing)?|transfer|loan|deal|fee|move|agree(?:s|d|ment)?)\b/i;

function detectStage(text) {
  // 따옴표를 걷고 공백을 접은 사본으로 판정한다 — 규칙들이 문구 사이 공백 하나를 전제로 짜여 있다
  const t = text.replace(/[“”"‘’'«»]/g, "").replace(/\s+/g, " ");
  // ⚠ 부상 발표를 오피셜로 잡지 않는다 — "Real Madrid have announced … ligament injury"가 `have announced`
  //   규칙에 걸려 오피셜 딜이 생겼다(지역지·유럽 매체 RSS를 넣으면서 실측). 이적 표현이 함께 있으면 그대로 판정한다.
  if (INJURY.test(t) && !TRANSFER_WORD.test(t)) return "unknown";
  for (const r of STAGE_RULES) {
    if (r.pattern.test(t)) return r.stage;
  }
  return "unknown";
}

const CURRENCY = { "€": "EUR", "£": "GBP", "$": "USD" };

/**
 * 개별 이적료의 현실적 상한(백만 단위).
 * 역대 최고 이적료는 네이마르의 €222m 다. 그 위는 단일 이적료가 아니라
 * 구단 가치·총지출·연간 매출 같은 다른 숫자일 확률이 압도적으로 높다.
 */
const MAX_PLAUSIBLE_FEE_M = 350;

/**
 * 주급을 말하는 기간 표현 — "£250,000-a-week"·"€300k per week"·"£150k a week"·"£200k weekly".
 * ⚠ **주급 추출(`WAGE_RE`)과 "주급은 이적료가 아니다"(`WAGE_TAIL`)가 같은 소스를 쓴다.**
 *   한쪽만 넓히면 어떤 문형은 주급으로 잡히면서 이적료로도 세어지거나, 그 반대가 된다.
 */
const WAGE_PERIOD_SRC = String.raw`(?:-?\s*(?:a|per)[-\s]*week|\s*weekly)\b`;

/**
 * 금액 주변에 이 표현들이 있으면 이적료가 아니다.
 * 실측에서 걸린 것들: 첼시 지분 매각 기업가치 £5bn,
 * 리버풀 여름 총지출 £449m, 스쿼드 총액 £322m.
 */
const NOT_A_FEE_CONTEXT =
  /\b(enterprise value|valuation|valued at|shares?|takeover|stake|revenue|turnover|wage bill|wages|salary|net worth|worth of the club|spent|spending|total(?:ling)?|combined|squad cost|budget|profit|loss(?:es)?|debt|投資)\b/i;

/** 금액 **바로 뒤**에 주급 기간이 붙으면 그 금액은 주급이지 이적료가 아니다 — `WAGE_RE`와 같은 소스다 */
const WAGE_TAIL = new RegExp(`^${WAGE_PERIOD_SRC}`, "i");

/**
 * 주급 추출 → `'£250k'`.
 *
 * 받는 형태: `£250,000-a-week` · `€300k per week` · `£150k a week` · `£200k weekly`. 천 단위 셋(`,000`)이나
 * `k`가 **반드시** 붙어야 한다 — 단위 없는 "£250 a week"는 유스 계약이거나 오타라 버린다.
 * ⚠ 연봉("€10m net salary"·"£20m per season")은 잡지 않는다 — 화면이 주급만 그리고, 두 단위를 하나로
 *   접으면 12배 차이가 조용히 섞인다.
 * ⚠ 두 값이 있으면 **금액이 큰 쪽**이 아니라 **처음 나온 것**이다 — "£250k-a-week offer, up from £180k"처럼
 *   앞이 새 제안이다(이적료의 "가장 큰 값" 규칙과 다르다).
 */
const WAGE_RE = new RegExp(String.raw`([€£$])\s?(\d{2,3})(?:,000|k)${WAGE_PERIOD_SRC}`, "i");

function detectWage(text) {
  const m = WAGE_RE.exec(text);
  if (!m) return { wageText: null };
  return { wageText: `${m[1]}${m[2]}k` };
}

/**
 * 옵션(애드온) 추출 — 이적료에 **더해질 수 있는** 금액. 백만 단위.
 *
 * 받는 형태: `+ up to £17m add-ons` · `plus €5m in bonuses` · `€10m add-ons` · `plus £8m in variables`.
 * ⚠ "plus add-ons"처럼 금액 없는 언급은 null이다 — 있다는 사실만으로는 칸을 채울 수 없다.
 * ⚠ 통화를 함께 돌려준다 — 파생기가 이적료와 통화가 같을 때만 싣는다(£17m 옵션을 €125m 옆에 두면 거짓 합계가 된다).
 */
const ADD_ON_WORDS_SRC = String.raw`\s*(?:in\s+)?(?:add-?ons?|bonuses|variables)\b`;
const ADD_ON_RE = new RegExp(
  String.raw`(?:(?:plus|\+)\s*(?:up\s+to\s+)?([€£$])(\d+(?:[.,]\d+)?)\s?m(?:illion)?${ADD_ON_WORDS_SRC}|([€£$])(\d+(?:[.,]\d+)?)\s?m(?:illion)?\s*(?:in\s+)?add-?ons?\b)`,
  "i",
);
/** 금액 **바로 뒤**에 옵션 표현이 붙으면 그 금액은 옵션이다(이적료 추출이 건너뛴다) */
const ADD_ON_TAIL = new RegExp(`^${ADD_ON_WORDS_SRC}`, "i");

function detectAddOn(text) {
  const m = ADD_ON_RE.exec(text);
  if (!m) return { addOnAmount: null, addOnCurrency: null };
  const symbol = m[1] ?? m[3];
  const amount = Number((m[2] ?? m[4]).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PLAUSIBLE_FEE_M) return { addOnAmount: null, addOnCurrency: null };
  return { addOnAmount: amount, addOnCurrency: CURRENCY[symbol] ?? symbol };
}

/**
 * 이적료 추출.
 *
 * "€106m + €17m add-ons" 처럼 총액과 애드온이 함께 오는 경우가 많아
 * 가장 큰 값을 대표값으로 삼되, 아래 두 가지로 오탐을 막는다.
 *  (1) 금액 앞뒤 문맥에 구단가치·총지출 표현이 있으면 버린다
 *  (2) 단일 이적료로 불가능한 액수(> MAX_PLAUSIBLE_FEE_M)는 버린다
 */
function detectFee(text) {
  const re = /([€£$])\s?(\d+(?:[.,]\d+)?)\s?(m|million|bn|billion)?\b/gi;
  let best = null;
  let m;

  while ((m = re.exec(text))) {
    const symbol = m[1];
    const num = Number(m[2].replace(",", "."));
    if (!Number.isFinite(num)) continue;

    const unit = (m[3] ?? "").toLowerCase();
    // bn 단위는 단일 이적료일 수 없다 — 구단 매각·매출 이야기다
    if (unit.startsWith("bn") || unit.startsWith("billion")) continue;
    // 단위 없는 금액은 주급·연봉일 가능성이 커서 제외
    if (!unit.startsWith("m")) continue;
    const tail = text.slice(m.index + m[0].length);
    // 주급 기간이 바로 뒤에 붙은 금액("£1m-a-week")은 주급이다
    if (WAGE_TAIL.test(tail)) continue;
    // 옵션 표현이 바로 뒤에 붙은 금액("plus €5m in add-ons")은 옵션이지 이적료가 아니다 — `ADD_ON_RE`와 같은 소스다
    if (ADD_ON_TAIL.test(tail)) continue;

    const amount = num;
    if (amount > MAX_PLAUSIBLE_FEE_M) continue;

    // 금액 주변 90자를 문맥으로 본다
    const ctx = text.slice(Math.max(0, m.index - 90), m.index + m[0].length + 90);
    if (NOT_A_FEE_CONTEXT.test(ctx)) continue;

    if (!best || amount > best.amount) {
      best = { amount, currency: CURRENCY[symbol] ?? symbol, raw: m[0].trim() };
    }
  }

  return best
    ? { feeText: best.raw, feeAmount: best.amount, feeCurrency: best.currency }
    : { feeText: null, feeAmount: null, feeCurrency: null };
}

/**
 * 선수명 추출.
 *
 * 범용 NER 대신 "동사 다음에 이름이 온다"는 이 도메인의 문형을 이용한다.
 * 정밀도를 택하고 재현율을 포기했다 — 틀린 이름을 넣는 것보다 비우는 게 낫다.
 *
 * 실제 문장을 넣어보면 앵커와 이름 사이에 나이·포지션 수식어가 끼는 경우가 많다:
 *   "deal for winger Jhon Duran", "transfer of striker Marc Guiu", "for 23yo #PSG winger"
 * 그래서 그 수식어들을 선택적으로 건너뛴다.
 */

/** 이름 앞에 끼어드는 수식어: "the 23yo Spanish winger" 같은 덩어리 */
const ROLE_PREFIX =
  "(?:the\\s+)?(?:\\d{1,2}yo\\s+)?(?:[a-z]+\\s+)?(?:winger|striker|midfielder|defender|goalkeeper|forward|attacker|centre-back|center-back|full-back|wing-back|left-back|right-back|centre-forward|playmaker|keeper)?\\s*";

/**
 * 사람 이름 덩어리: 대문자로 시작하는 토큰 2~4개.
 * ⚠ 하이픈에 **비분리 하이픈(U+2011)** 도 넣는다 — BBC가 "Gibbs‑White"를 그 글자로 쓴다. 없으면 이름이
 *   "Morgan Gibbs"에서 잘려 사전(`players-ko.json`) 키와 어긋난다(실제 수집 행).
 */
const NAME = "([A-Z][\\p{L}'’‑-]+(?: [A-Z][\\p{L}'’‑-]+){1,3})";

/**
 * `<name> to …` 문형은 뒤에 **사전에 있는 구단**이 와야 선수 앵커다. 없는 이름을 "to X" 하나로 인정하면
 * "Liverpool to Anfield"·"Monday to Friday"가 선수가 된다.
 */
function knownClubAfter(text, from) {
  return detectClubs(text.slice(from, from + 60)).length > 0;
}

const PLAYER_ANCHORS = [
  // sign / signing of / re-sign
  new RegExp(`\\b(?:re-)?sign(?:ing)?\\s+(?:of\\s+)?${ROLE_PREFIX}${NAME}`, "gu"),
  // move|bid|offer|deal|proposal|approach|talks ... for <name>
  new RegExp(`\\b(?:move|bid|offer|deal|proposal|approach|talks|interest)\\b[^.!?]{0,40}?\\bfor\\s+${ROLE_PREFIX}${NAME}`, "gu"),
  // transfer of <name>
  new RegExp(`\\btransfer\\s+of\\s+${ROLE_PREFIX}${NAME}`, "gu"),
  // "<Club> <position> <name>" — "Everton forward Iliman Ndiaye" 처럼 구단명이 끼는 어순
  new RegExp(
    `\\b[A-Z][\\p{L}]+\\s+(?:winger|striker|midfielder|defender|goalkeeper|forward|attacker|centre-back|full-back|wing-back|centre-forward|keeper)\\s+${NAME}`,
    "gu"
  ),
  // <name> completes move / joins / agrees / arrives ...  (이름이 동사 앞에 오는 어순)
  new RegExp(`${NAME}\\s+(?:completes?|joins?|is joining|has joined|agrees?|signs?|will join|set to join|arrives?|lands?)\\b`, "gu"),
  // <구단> target <name> / <구단>'s (top) target <name> — "Spurs target Morgan Gibbs-White"
  new RegExp(`\\b[A-Z][\\p{L}]+(?:['’]s)?\\s+(?:top\\s+|main\\s+|priority\\s+)?target\\s+${ROLE_PREFIX}${NAME}`, "gu"),
  // <name>'s move / signing / transfer — 소유격이 이적을 말할 때("for Marc Guiu's signing")
  new RegExp(`${NAME}['’]s\\s+(?:signing|move|transfer|arrival|switch)\\b`, "gu"),
  // <name> to <구단> — "David Alaba to Udinese, here we go". ⚠ 뒤 구단이 사전에 있을 때만
  { re: new RegExp(`${NAME}\\s+to\\s+(?=[A-Z#])`, "gu"), requireClubAfter: true },
];

/** 이름 뒤에 붙어 오는 잡음 단어들 — 잘라낸다 */
const TRAILING_NOISE =
  /\b(From|To|For|And|The|Is|Has|Will|After|On|In|At|With|Deal|Move|Fee|Permanent|Loan|Contract|Terms|Medical|Talks|Bid|Offer)\b.*$/;

/**
 * 선수명이 아닌 게 확실한 토큰 — 속보 표식·대회명·매체명·요일·국적 형용사.
 * ⚠ "sign South American star"가 선수 "South American"이 됐다(실제 수집 행) — 대륙·국적 형용사는
 *   대문자 두 토큰이라 이름처럼 생겼다. 앵커를 넓힐수록 이 목록이 정밀도를 지킨다.
 */
const NOT_A_PERSON =
  /^(?:Breaking|Exclusive|Excl|Understand|Here We Go|Official|Done Deal|Transfer Deadline(?: Day)?|Deadline Day|Transfer Window|Premier League|Champions League|Europa League|Serie A|La Liga|Ligue(?: 1)?|Bundesliga|Sky Sports|BBC Sport|The Athletic|Google News|Football Italia|Yahoo Sports|South American|North American|Latin American|Central American|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)['’]s?(?: \p{L}+)?)$/iu;

function detectPlayers(text, clubs) {
  const found = new Set();
  for (const anchor of PLAYER_ANCHORS) {
    const re = anchor instanceof RegExp ? anchor : anchor.re;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (anchor.requireClubAfter && !knownClubAfter(text, m.index + m[0].length)) continue;
      const name = m[1].replace(TRAILING_NOISE, "").trim();
      // ⚠ 소유격은 사람을 가리키지 않는다 — "signing for Mikel Arteta's side"(감독의 팀)가 선수로 잡혔다
      if (/['’]s$/u.test(name)) continue;
      // 단어 하나짜리는 구단·국가명일 확률이 높아 버린다
      if (name.split(/\s+/).length < 2) continue;
      if (name.length > 40) continue;
      if (NOT_A_PERSON.test(name)) continue;
      if (isClubName(name)) continue;
      if (clubs.some((c) => name.includes(c) || c.includes(name))) continue;
      // 토큰 하나라도 구단 별칭이면 사람이 아니다 — 새 앵커(to·target) 뒤에는 구단명이 자주 온다
      if (detectClubs(name).length > 0) continue;
      found.add(name);
    }
  }
  return [...found];
}

/** 이적 관련성 점수. 낮으면 경기 리뷰·부상 소식 등 비이적 콘텐츠다. */
function scoreRelevance(text, stage, clubs, players) {
  let s = 0;
  if (stage !== "unknown") s += 0.45;
  if (stage === "here_we_go" || stage === "official" || stage === "medical") s += 0.15;
  if (clubs.length >= 2) s += 0.25;
  else if (clubs.length === 1) s += 0.1;
  if (players.length > 0) s += 0.2;
  // ⚠ 떠나는 쪽의 표현(계약 해지·방출·자유계약)도 이적 신호다 — 없으면 "합의 해지로 떠난다"는 보도가
  //   관련도 0이 되었다(실측: 에릭센 볼프스부르크 합의 해지).
  if (/\b(transfer|signing|deal|fee|contract|loan|move|mutual consent|terminat(?:e|es|ed|ion)|released|free agent)\b/i.test(text)) s += 0.1;
  // 이적과 무관한 전형적 콘텐츠는 감점
  if (/\b(injur(y|ed)|out for|sidelined|fitness|match report|full-time|kick-off|preview|highlights)\b/i.test(text)) s -= 0.25;
  return Math.max(0, Math.min(1, s));
}

/**
 * 게시물 하나를 구조화한다.
 * ⚠ 크롤러는 `Extractor` 인터페이스로 LLM 추출기와 갈아끼울 자리를 두었다 — 그 자리는
 *   이 함수의 시그니처(text → 결과)다.
 */
export function extractTransfer(text) {
  const stage = detectStage(text);
  const clubs = detectClubs(text);
  const players = detectPlayers(text, clubs);
  const fee = detectFee(text);
  // ⚠ 주급·옵션은 `transfer_news`에 저장하지 않는다(컬럼을 늘리지 않았다) — 딜 파생기가 body에서 다시 읽는다
  return { stage, players, clubs, ...fee, ...detectWage(text), ...detectAddOn(text), relevance: scoreRelevance(text, stage, clubs, players) };
}

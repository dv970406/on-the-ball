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
      /^(?:RT @\w+:\s*)?[^\p{L}\p{N}]*official\b\s*[,:!.—–-](?![\s\S]*\b(?:new (?:deal|contract)|contract extension|extends?|extension|renew(?:s|ed|al)?|postponed|sacked|appoint(?:s|ed|ment)?|not for sale|full[- ]time)\b)(?=[\s\S]*\b(?:joins?|joined|signs?|signed|signing|completes?|completed|move|transfer|loan|arrives?)\b)/iu,
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

function detectStage(text) {
  // 따옴표를 걷고 공백을 접은 사본으로 판정한다 — 규칙들이 문구 사이 공백 하나를 전제로 짜여 있다
  const t = text.replace(/[“”"‘’'«»]/g, "").replace(/\s+/g, " ");
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
 * 금액 주변에 이 표현들이 있으면 이적료가 아니다.
 * 실측에서 걸린 것들: 첼시 지분 매각 기업가치 £5bn,
 * 리버풀 여름 총지출 £449m, 스쿼드 총액 £322m.
 */
const NOT_A_FEE_CONTEXT =
  /\b(enterprise value|valuation|valued at|shares?|takeover|stake|revenue|turnover|wage bill|wages|salary|net worth|worth of the club|spent|spending|total(?:ling)?|combined|squad cost|budget|profit|loss(?:es)?|debt|投資)\b/i;

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

/** 사람 이름 덩어리: 대문자로 시작하는 토큰 2~4개 */
const NAME = "([A-Z][\\p{L}'\u2019-]+(?: [A-Z][\\p{L}'\u2019-]+){1,3})";

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
  // <name> completes move / joins / agrees ...  (이름이 동사 앞에 오는 어순)
  new RegExp(`${NAME}\\s+(?:completes?|joins?|is joining|has joined|agrees?|signs?|will join|set to join)\\b`, "gu"),
];

/** 이름 뒤에 붙어 오는 잡음 단어들 — 잘라낸다 */
const TRAILING_NOISE =
  /\b(From|To|For|And|The|Is|Has|Will|After|On|In|At|With|Deal|Move|Fee|Permanent|Loan|Contract|Terms|Medical|Talks|Bid|Offer)\b.*$/;

/** 선수명이 아닌 게 확실한 토큰 */
const NOT_A_PERSON = /^(?:Breaking|Exclusive|Excl|Understand|Here We Go|Official|Done Deal|Premier League|Champions League|Serie A|La Liga|Ligue|Bundesliga)$/i;

function detectPlayers(text, clubs) {
  const found = new Set();
  for (const re of PLAYER_ANCHORS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1].replace(TRAILING_NOISE, "").trim();
      // 단어 하나짜리는 구단·국가명일 확률이 높아 버린다
      if (name.split(/\s+/).length < 2) continue;
      if (name.length > 40) continue;
      if (NOT_A_PERSON.test(name)) continue;
      if (isClubName(name)) continue;
      if (clubs.some((c) => name.includes(c) || c.includes(name))) continue;
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
  if (/\b(transfer|signing|deal|fee|contract|loan|move)\b/i.test(text)) s += 0.1;
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
  return { stage, players, clubs, ...fee, relevance: scoreRelevance(text, stage, clubs, players) };
}

import { readFileSync } from "node:fs";
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
  // ⚠ "(be) in (full) agreement with …"는 **의견에 동의한다**는 관용구다 — "Alan Shearer in agreement with Thomas
  //   Tuchel after brutal Cole Palmer blast"(대표팀 소집 논평)가 합의 단계 딜이 됐다(운영).
  {
    stage: "agreement",
    pattern:
      /(?<!\bin (?:full |total |complete )?)\b(?:verbal |full |total |complete )?agreement\b|\b(?:reach(?:ed|es)? (?:an? )?agreement|agreement in principle|strike[sd]? (?:an? )?agreement|accept(?:ed|s)? (?:a|an|the)? ?(?:€|£|\$)?[\d.]*m? ?(?:bid|offer)|agree[sd]? (?:a |an |the )?(?:£|€|\$)?[\d.,]*m? ?(?:deal|fee|move|transfer)|deal (?:is )?(?:agreed|done)|finalising (?:an? )?(?:agreement|deal)|close to (?:finalising|completing))\b/i,
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
      // ⚠ 부정은 제외한다 — "I'm not interested in politics"(인터뷰)가 루머 딜이 됐다(운영)
      /(?<!\b(?:not|never|no longer|isn['’]t|aren['’]t|wasn['’]t)\s+)\b(interested in|monitor(?:ing)?|eye(?:ing)?|target(?:ing)?|linked with|considering|exploring (?:a )?(?:deal|move)|keen on|weighing|scouting)\b/i,
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

/**
 * 영문 헤드라인은 단어마다 대문자로 쓴다("Chelsea Agree Deal To Sign …") — 앵커 단어는 첫 글자의 대소문자를
 * 가리지 않는다. 이름 쪽(`NAME`)은 대문자 시작을 그대로 요구하므로 플래그 `i`를 쓰지 않고 앵커만 푼다.
 * ⚠ 타이틀 케이스를 받는 순간 "Star Striker"·"Brazilian Wonderkid"도 이름처럼 생긴다 — 그 몫은
 *   아래 `cleanCandidate`(수식어 걷기·수식 명사 판정)가 진다.
 */
const ci = (word) => word.replace(/^(\p{L})/u, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const alt = (words) => `(?:${words.map((w) => w.split(" ").map(ci).join("\\s+")).join("|")})`;

const POSITIONS = ["centre-forward", "centre-back", "center-back", "full-back", "wing-back", "left-back", "right-back", "winger", "striker", "midfielder", "defender", "goalkeeper", "forward", "attacker", "playmaker", "keeper"];

/** 이름 앞에 끼어드는 수식어: "the 23yo Spanish winger" 같은 덩어리 */
const ROLE_PREFIX = `(?:${ci("the")}\\s+)?(?:\\d{1,2}yo\\s+)?(?:[a-z]+\\s+)?(?:${alt(POSITIONS)}\\s+)?`;

/**
 * 사람 이름 덩어리 — 대문자로 시작하는 토큰 1~4개, 사이에 소문자 조사(van·de·dos…)를 둘까지 허용한다.
 * ⚠ 첫 글자는 `\p{Lu}`다 — `[A-Z]`로 두면 Ángel Di María·Mesut Özil·Martin Ødegaard처럼 악센트 대문자로
 *   시작하는 토큰에서 이름이 통째로 빠졌다(유명 선수 999명 시뮬레이션에서 약 5%).
 * ⚠ 소문자 조사가 없으면 Virgil van Dijk·Frenkie de Jong이 "Virgil"·"Frenkie"에서 끊긴다.
 * ⚠ 하이픈에 **비분리 하이픈(U+2011)** 도 넣는다 — BBC가 "Gibbs‑White"를 그 글자로 쓴다. 없으면 이름이
 *   "Morgan Gibbs"에서 잘려 사전(`players-ko.json`) 키와 어긋난다(실제 수집 행).
 * ⚠ 한 토큰짜리도 잡지만 **사람 사전에 있을 때만 받는다**(`cleanCandidate`) — "Joao"·"Pedro"처럼 흔한 이름
 *   한 토큰으로는 누구인지 특정할 수 없다.
 */
const TOKEN = "\\p{Lu}[\\p{L}\\p{M}'’‑-]+";
const PARTICLE = "(?:van|von|der|den|de|da|das|do|dos|di|del|della|dei|la|le|ter|ten|bin|ben|el|al|y)";
const NAME = `(${TOKEN}(?:\\s+(?:${PARTICLE}\\s+){0,2}${TOKEN}){0,3})`;

/**
 * `<name> to …` 문형은 뒤에 **사전에 있는 구단**이 와야 선수 앵커다. 없는 이름을 "to X" 하나로 인정하면
 * "Liverpool to Anfield"·"Monday to Friday"가 선수가 된다.
 */
function knownClubAfter(text, from) {
  // ⚠ 구단은 "to" **바로 뒤**여야 한다(첫 1~4토큰) — 60자 안 어디든 받았더니 "Spence Returns to Group Training
  //   but Misses Roma Trip"의 "Roma"가 걸려 "Spence Returns"가 선수가 됐다(sempreinter 피드).
  const head = text.slice(from, from + 60).match(/^#?[\p{L}\p{M}'’.&-]+(?:\s+[\p{L}\p{M}'’.&-]+){0,3}/u)?.[0] ?? "";
  const words = head.split(/\s+/);
  for (let n = words.length; n >= 1; n--) {
    const cand = words.slice(0, n).join(" ");
    if (isClubName(cand) || isClubName(cand.replace(/^#/, ""))) return true;
  }
  // 해시태그(#MUFC)·정규명 별칭은 detectClubs가 안다 — 단 그 구단이 첫 낱말에서 시작해야 한다
  return detectClubs(words[0] ?? "").length > 0 || (words.length > 1 && detectClubs(words.slice(0, 2).join(" ")).length > 0);
}

const PLAYER_ANCHORS = [
  // sign / signing of / re-sign
  new RegExp(`\\b(?:${ci("re")}-)?${ci("sign")}(?:ing)?\\s+(?:${ci("of")}\\s+)?${ROLE_PREFIX}${NAME}`, "gud"),
  // move|bid|offer|deal|… for <name>
  new RegExp(`\\b${alt(["move", "bid", "offer", "deal", "proposal", "approach", "talks", "interest", "agreement"])}\\b[^.!?]{0,40}?\\b${ci("for")}\\s+${ROLE_PREFIX}${NAME}`, "gud"),
  // 루머 동사 + <name> — "Arsenal are interested in Rayan Cherki", "linked with a move for …"는 위 for 앵커가 받는다
  // ⚠ 부정("not interested in")은 받지 않는다 — 단계 판정과 같은 규칙이다
  new RegExp(`(?<!\\b(?:not|never|no longer)\\s+)\\b${alt(["interested in", "linked with", "eyeing", "monitoring", "keen on", "chasing", "pursuing", "scouting"])}\\s+${ROLE_PREFIX}${NAME}`, "gud"),
  // transfer of / loan of <name>
  new RegExp(`\\b${alt(["transfer", "loan"])}\\s+${ci("of")}\\s+${ROLE_PREFIX}${NAME}`, "gud"),
  // (personal) terms / (verbal) agreement / talks with <name> — "Barcelona agree personal terms with X"
  // ⚠ "agreement with"은 **합의에 이른** 표현만 받는다 — "Alan Shearer in agreement with Thomas Tuchel"(의견 동의)이
  //   합의 단계 딜이 됐다(운영). "contract with"도 뺀다 — "extends contract with Milan Futuro"처럼 구단이 온다.
  new RegExp(`\\b${alt(["terms", "talks"])}\\s+${ci("with")}\\s+${ROLE_PREFIX}${NAME}`, "gud"),
  new RegExp(`(?<!\\b[Ii]n\\s+)\\b${ci("agreement")}\\s+(?:${ci("in")}\\s+${ci("principle")}\\s+)?${ci("with")}\\s+${ROLE_PREFIX}${NAME}`, "gud"),
  // "<Club> <position> <name>" — "Everton forward Iliman Ndiaye" 처럼 구단명이 끼는 어순
  new RegExp(`\\b\\p{Lu}\\p{L}+\\s+${alt(POSITIONS)}\\s+${NAME}`, "gud"),
  // <name> completes move / joins / agrees / arrives / undergoes medical … (이름이 동사 앞에 오는 어순)
  { nameFirst: true, re: new RegExp(
    `${NAME}\\s+${alt(["completes", "complete", "is joining", "has joined", "joins", "join", "agrees", "agree", "signs", "sign", "will join", "set to join", "arrives", "arrive", "lands", "land", "is undergoing", "undergoes", "to undergo", "has passed", "passes"])}\\b`,
    "gud",
  ) },
  // <구단> target <name> / <구단>'s (top) target <name> — "Spurs target Morgan Gibbs-White"
  new RegExp(`\\b\\p{Lu}\\p{L}+(?:['’]s)?\\s+(?:${alt(["top", "main", "priority"])}\\s+)?${ci("target")}\\s+${ROLE_PREFIX}${NAME}`, "gud"),
  // <name>'s move / signing / transfer — 소유격이 이적을 말할 때("for Marc Guiu's signing")
  { nameFirst: true, re: new RegExp(`${NAME}['’]s\\s+${alt(["signing", "move", "transfer", "arrival", "switch"])}\\b`, "gud") },
  // <name> to <구단> — "David Alaba to Udinese, here we go". ⚠ 뒤 구단이 사전에 있을 때만
  { nameFirst: true, re: new RegExp(`${NAME}\\s+${ci("to")}\\s+(?=[\\p{Lu}#])`, "gud"), requireClubAfter: true },
];

/**
 * 이름 뒤에 붙어 오는 잡음 단어들 — **둘째 토큰부터** 잘라낸다(첫 토큰이면 "Will Hughes"가 통째로 사라진다).
 * 타이틀 케이스 헤드라인의 동사("… Agree Deal", "… Completes Move")도 여기서 끊는다.
 */
const TRAILING_NOISE =
  /\s+(?:From|To|For|And|The|Is|Has|Will|After|On|In|At|With|As|Amid|Ahead|Despite|Over|Before|Following|Until|While|Deal|Move|Fee|Permanent|Loan|Contract|Terms|Medical|Talks|Bid|Offer|Here|Done|Agreed|Confirmed|Official|Update|Exclusive|Live|Agrees?|Completes?|Completed|Joins?|Joined|Signs?|Signed|Seals?|Nears?|Closes?|Arrives?|Undergoes|Submits?|Makes?|Opens?|Reach(?:es)?|Eyes?|Wants?|Targets?|Set|Race|Plot|Plots|Lodge|Lodges|Launch|Launches|Rejects?|Accepts?|By)\b.*$/u;

/**
 * 선수가 아닌데 대문자로 쓰이는 낱말 — 이름 앞머리에서 걷어 내고, 이것만으로 된 후보는 버린다.
 * ⚠ 타이틀 케이스 헤드라인과 "sign South American star"(실제 수집 행)가 이 목록의 존재 이유다 —
 *   국적·지역 형용사와 역할어는 대문자 두 토큰이라 이름처럼 생겼다. 소문자로 비교한다.
 */
const DEMONYMS = new Set(
  ("brazilian argentine argentinian uruguayan colombian chilean peruvian ecuadorian paraguayan venezuelan bolivian mexican american canadian " +
    "english scottish welsh irish british french spanish portuguese italian german dutch belgian swiss austrian danish swedish norwegian finnish " +
    "icelandic polish czech slovak hungarian croatian serbian slovenian bosnian montenegrin albanian kosovan macedonian greek turkish romanian " +
    "bulgarian ukrainian russian georgian armenian moroccan algerian tunisian egyptian nigerian ghanaian ivorian senegalese cameroonian malian " +
    "guinean congolese gabonese zambian japanese korean chinese australian saudi iranian qatari jamaican " +
    "south north east west central eastern western northern southern latin african european asian american scandinavian balkan nordic iberian caribbean " +
    "brazilian-born french-born dutch-born spanish-born").split(" "),
);
/** 역할·수식 명사 — 이름 **바로 뒤**에 오면 그 덩어리는 이름이 아니라 수식어다("World Cup winner", "Red Bull Salzburg winger") */
const ROLE_NOUNS = new Set(
  ("star stars striker winger midfielder defender goalkeeper keeper forward attacker playmaker centre-back center-back full-back wing-back " +
    "left-back right-back centre-forward wonderkid talent youngster teenager prodigy sensation ace hotshot captain international legend veteran " +
    "winner winners scorer target signing gem starlet duo trio boss coach manager director chairman owner").split(" "),
);
/**
 * 구단 이름의 꼬리 — 사전에 없는 하부 리그 구단("Wycombe Wanderers")도 이 꼬리로 알아본다.
 * 후보 끝이 이 낱말이면 그 앞 토큰과 함께 구단명이다("striker Ings Wycombe Wanderers sign" — 운영 데이터 대조).
 */
const CLUB_SUFFIX = new Set("wanderers rovers albion hotspur athletic united city town county wednesday argyle orient rangers celtic academical".split(" "));
/** 전치사·관사·바이라인 — 이름이 될 수 없어 한 토큰이 남을 때까지 앞머리에서 걷는다("From Yokohama") */
const NEVER_NAME = new Set("the a an and or but from to for at in on of with as amid after by via over into onto per".split(" "));
/** 타이틀 케이스 헤드라인이 이름 앞에 흘리는 낱말 — 앞머리에서 걷는다 */
const LEADING_NOISE = new Set(
  ("the a an and or but we go here it is breaking exclusive official confirmed done deal update report reports understand star stars teenage young " +
    "former new top record free mystery summer january second third first club loan veteran talented rising highly-rated experienced young").split(" "),
);
/** 대회·매체처럼 사람 이름 자리에 오는 고유명사 조각 — 이것만으로 된 후보는 사람이 아니다 */
const NON_NAME_WORDS = new Set(
  ("world cup league premier champions europa conference copa america nations euro serie liga ligue bundesliga eredivisie primeira saudi pro " +
    "championship premiership olympic olympics under-21 u21 u23 golden boy ballon sky sports news daily mail sun mirror guardian athletic bbc " +
    "marca relevo le parisien bild kicker gazzetta dello sport club statement announcement transfer window deadline day medical tests personal terms " +
    "release clause stadium park arena ground live agent agents times york yahoo espn talksport " +
    // 구단 약칭·2군 표기 — "FC Bayern"·"Milan Futuro"를 사람으로 읽지 않게
    "fc ac sc cf afc sv fk sk vfl vfb rb psv futuro castilla primavera women reserves academy youth u19 next gen pm minister prime").split(" "),
);

/**
 * 선수명이 아닌 게 확실한 덩어리 — 속보 표식·대회명·매체명·요일.
 * ⚠ "sign South American star"가 선수 "South American"이 됐다(실제 수집 행) — 대륙·국적 형용사는
 *   대문자 두 토큰이라 이름처럼 생겼다. 개별 낱말은 위 집합들이 맡고, 여기는 통째로 봐야 하는 표현만 둔다.
 */
const NOT_A_PERSON =
  /^(?:Breaking|Exclusive|Excl|Understand|Here We Go|Official|Done Deal|Transfer Deadline(?: Day)?|Deadline Day|Transfer Window|Premier League|Champions League|Europa League|Serie A|La Liga|Ligue(?: 1)?|Bundesliga|Sky Sports|BBC Sport|The Athletic|Google News|Football Italia|Yahoo Sports|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)['’]s?(?: \p{L}+)?)$/iu;

/**
 * 선수가 아닌 사람(감독·단장·구단주·에이전트)을 가리키는 문맥 — 실명이라 이름 모양만으로는 가를 수 없다.
 * ⚠ "Liverpool target Pep Guardiola to replace the sacked boss", "X joins Chelsea as sporting director"가
 *   딜이 됐다(시뮬레이션). 문장 전체가 아니라 **이름에 붙은** 역할만 본다 — "Arsenal manager Mikel Arteta
 *   confirmed the signing of Kai Havertz"에서 하버츠까지 버리면 안 된다.
 */
// ⚠ "agent"는 "free agent"(자유계약 선수)를 빼야 한다 — "joins Udinese … as free agent"에서 알라바를 버렸다(운영 데이터 대조)
const ROLE_WORD = "(?:head coach|manager|coach|boss|sporting director|technical director|director of football|director|chairman|president|owner|co-owner|chief executive|ceo|executive|(?<!free\\s)agent|journalist|reporter|pundit|presenter|assistant|prime minister|minister|pm)";
// 이름 바로 앞의 역할어·임명 동사·바이라인("By: Oliver Fisher")
const ROLE_BEFORE = new RegExp(`(?:\\b${ROLE_WORD}|\\b(?:appoint(?:s|ed)?|hire(?:s|d)?|sack(?:s|ed)?|named)|\\bby:?)\\s+$`, "iu");
const ROLE_AFTER_RES = [
  new RegExp(`^[^.!?]{0,80}?\\bas\\s+(?:[\\p{L}'’-]+\\s+){0,3}?${ROLE_WORD}\\b`, "iu"),
  new RegExp(`^[^.!?]{0,80}?\\b(?:manager|managerial|head coach|coaching|sporting director|director of football)\\s+(?:role|job|position|post|vacancy)\\b`, "iu"),
  new RegExp(`^[^.!?]{0,60}?\\bto replace\\b[^.!?]{0,40}?\\b(?:boss|manager|head coach|coach|director)\\b`, "iu"),
];
/**
 * 이름 뒤 역할 문맥 — ⚠ 그 사이에 **다른 사람 이름**(구단이 아닌 대문자 두 토큰)이 끼면 그 역할은 그 사람의 것이다.
 *   "Vinicius Jr to Arsenal truth emerges after Mikel Arteta secrecy as assistant coach speaks out"에서
 *   비니시우스를 버렸다(운영 데이터 대조).
 */
function roleAfter(after) {
  for (const re of ROLE_AFTER_RES) {
    const m = re.exec(after);
    if (!m) continue;
    const people = [...m[0].matchAll(/\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+/gu)].filter((x) => !isOnlyClubs(x[0]));
    if (people.length === 0) return true;
  }
  return false;
}

/** 한 토큰 이름(Neymar·Rodri)은 사람 사전에 있을 때만 받는다 — 사전의 정규형 키 */
let mononyms;
function isKnownMononym(name) {
  if (!mononyms) {
    let dict = {};
    try {
      dict = JSON.parse(readFileSync(new URL("./players-ko.json", import.meta.url), "utf8"));
    } catch {
      dict = {};
    }
    mononyms = new Set(Object.keys(dict).filter((k) => !k.startsWith("_") && !k.includes(" ")));
  }
  return mononyms.has(foldName(name));
}
/** 사람 이름 토큰이 될 수 없는 낱말인가 — 어휘 집합 또는 구단 표기 */
const isVocab = (t) => {
  const l = t.toLowerCase();
  return NEVER_NAME.has(l) || LEADING_NOISE.has(l) || DEMONYMS.has(l) || ROLE_NOUNS.has(l) || POSITIONS.includes(l) || NON_NAME_WORDS.has(l) || isClubName(t);
};
const foldName = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
const isCapital = (t) => /^\p{Lu}/u.test(t);

/**
 * 토큰마다 구단 표기(별칭)에 덮이는가 — 1~4토큰 n-gram을 `isClubName`으로 본다.
 * ⚠ `detectClubs`는 정규명("Manchester United")을 돌려줘 원문 표기("Man United")를 지울 수 없다 —
 *   "Yahoo Sports Man United complete deal"이 사람이 됐다(운영 데이터 대조).
 */
function clubCoverage(tokens) {
  const covered = tokens.map(() => false);
  for (let n = Math.min(4, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if (covered.slice(i, i + n).some(Boolean)) continue;
      if (isClubName(tokens.slice(i, i + n).join(" "))) for (let k = i; k < i + n; k++) covered[k] = true;
    }
  }
  return covered;
}

/** 구단 표기와 어휘(구단 약칭·2군·매체)를 빼면 대문자 토큰이 남지 않는가 — 남지 않으면 구단명이다(Red Bull Salzburg) */
function isOnlyClubs(name) {
  const tokens = name.split(/\s+/);
  const covered = clubCoverage(tokens);
  return tokens.every((t, i) => covered[i] || !isCapital(t) || NON_NAME_WORDS.has(t.toLowerCase()));
}

/**
 * 앵커가 잡은 덩어리 → 선수명(아니면 null).
 * @param {string} raw 앵커의 NAME 그룹
 * @param {string} text 원문
 * @param {number} start NAME 그룹의 시작 위치
 * @param {boolean} nameFirst 이름이 키워드 바로 앞에 와야 하는 앵커인가
 */
function cleanCandidate(raw, text, start, nameFirst = false) {
  let name = raw.replace(TRAILING_NOISE, "").trim();
  /*
   * ⚠ 이름이 앞에 오는 앵커는 왼쪽 경계를 모른다 — 대문자 덩어리가 왼쪽으로 더 이어지면
   *   ("The New York Times Mikel Arteta agrees") 정규식은 그 꼬리 넉 토큰을 이름으로 잡는다(운영 데이터 대조).
   *   덩어리 안의 마지막 어휘(구단·역할어·매체) 뒤에서 자르고, 자를 자리가 없으면 경계를 알 수 없어 버린다.
   */
  const runContinuesLeft = nameFirst && /\p{Lu}[\p{L}\p{M}'’‑-]*\s+$/u.test(text.slice(Math.max(0, start - 40), start));
  // ⚠ 이름이 키워드(동사·'s·to) **바로 앞**이어야 하는 앵커에서 사이의 낱말을 걷어야 했다면, 그 덩어리는 동사의
  //   주어가 아니다 — "Medical At Old Trafford As Chelsea Agree Deal"이 "Old Trafford"가 됐다(시뮬레이션).
  if (nameFirst && name !== raw.trim()) return null;
  let tokens = name.split(/\s+/);
  // 앞머리의 헤드라인 낱말·국적 형용사·역할어·구단명을 걷는다("Brazilian Wonderkid X", "Chelsea Star X")
  for (;;) {
    const t = tokens[0]?.toLowerCase();
    // 소유격 접두("Bournemouth's Alex Scott", "Everton's Jarrad Branthwaite")는 소속이다 — 걷는다
    if (tokens.length > 1 && /['’]s$/u.test(tokens[0])) {
      tokens = tokens.slice(1);
      continue;
    }
    if (tokens.length > 1 && NEVER_NAME.has(t)) {
      tokens = tokens.slice(1);
      continue;
    }
    // 역할어는 이름이 될 수 없어 한 토큰이 남을 때까지 걷는다("Brazilian Wonderkid Endrick" → "Endrick")
    if (tokens.length > 1 && (ROLE_NOUNS.has(t) || POSITIONS.includes(t))) {
      tokens = tokens.slice(1);
      continue;
    }
    // ⚠ 국적 형용사·헤드라인 낱말은 **두 토큰 이상 남을 때만** 걷는다 — 이름과 철자가 같다
    //   (Germán Pezzella를 악센트 없이 쓴 "German Pezzella"에서 이름이 사라졌다 — 시뮬레이션)
    if (tokens.length > 2 && (LEADING_NOISE.has(t) || DEMONYMS.has(t) || NON_NAME_WORDS.has(t))) {
      tokens = tokens.slice(1);
      continue;
    }
    // 구단명 접두 — 걷고도 대문자 토큰이 둘 이상 남을 때만(Milan Škriniar의 "Milan"은 이름이다)
    const k = [3, 2, 1].find((n) => tokens.length - n >= 2 && isClubName(tokens.slice(0, n).join(" ")));
    if (k) {
      tokens = tokens.slice(k);
      continue;
    }
    break;
  }
  // 끝에 붙은 구단 표기는 이름이 아니다("striker Ings Wycombe Wanderers sign" → "Ings")
  if (tokens.length > 2 && CLUB_SUFFIX.has(tokens.at(-1).toLowerCase())) tokens = tokens.slice(0, -2);
  {
    const covered = clubCoverage(tokens);
    while (tokens.length > 1 && covered.at(-1)) {
      tokens = tokens.slice(0, -1);
      covered.pop();
    }
  }
  if (runContinuesLeft) {
    const cut = tokens.findLastIndex((t, i) => i < tokens.length - 1 && isVocab(t));
    if (cut < 0) return null;
    tokens = tokens.slice(cut + 1);
  }
  // 조사로 시작·끝나면 이름이 아니다
  while (tokens.length && !isCapital(tokens.at(-1))) tokens.pop();
  if (!tokens.length || !isCapital(tokens[0])) return null;
  // 끝이 역할어면 그 덩어리 전체가 수식어다("Aston Villa Star", "Serie A Defender")
  if (ROLE_NOUNS.has(tokens.at(-1).toLowerCase()) || POSITIONS.includes(tokens.at(-1).toLowerCase())) return null;
  name = tokens.join(" ");

  // ⚠ 소유격은 사람을 가리키지 않는다 — "signing for Mikel Arteta's side"(감독의 팀)가 선수로 잡혔다.
  //   가운데 소유격("Lewis Hall's Fresh")도 이름의 경계를 알 수 없어 버린다(정밀도를 택한다)
  if (tokens.some((t) => /['’]s$/u.test(t))) return null;
  if (name.length > 40) return null;
  if (NOT_A_PERSON.test(name)) return null;
  // 대문자 토큰이 전부 어휘(국적·역할어·대회·매체)면 사람이 아니다 — 조사(van·de)는 세지 않는다
  const capitals = tokens.filter(isCapital).map((t) => t.toLowerCase());
  if (capitals.every((t) => DEMONYMS.has(t) || ROLE_NOUNS.has(t) || LEADING_NOISE.has(t) || NON_NAME_WORDS.has(t))) return null;
  if (isClubName(name) || isOnlyClubs(name)) return null;

  // 원문에서의 위치 — 앞뒤 문맥 판정용
  const at = text.indexOf(name, start);
  const pos = at >= 0 ? at : start;
  const after = text.slice(pos + name.length);
  // 이름 바로 뒤가 역할 명사면 수식어다("World Cup star", "Eastern European striker")
  const next = after.match(/^\s+([\p{L}-]+)/u)?.[1]?.toLowerCase();
  if (next && ROLE_NOUNS.has(next)) return null;
  if (next && POSITIONS.includes(next)) return null;
  // 감독·단장·구단주 문맥
  if (ROLE_BEFORE.test(text.slice(Math.max(0, pos - 40), pos))) return null;
  if (roleAfter(after)) return null;

  // 한 토큰 이름은 사람 사전에 있을 때만 — 흔한 이름 하나로 선수를 특정하지 않는다
  if (tokens.filter(isCapital).length < 2 && !isKnownMononym(name)) return null;
  return name;
}

function detectPlayers(text, clubs) {
  const found = new Set();
  for (const anchor of PLAYER_ANCHORS) {
    const re = anchor instanceof RegExp ? anchor : anchor.re;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (anchor.requireClubAfter && !knownClubAfter(text, m.index + m[0].length)) continue;
      // ⚠ 대문자로 쓴 키워드는 **헤드라인(타이틀 케이스)일 때만** 앵커다 — 다음 낱말도 대문자여야 한다.
      //   본문의 "row with Javier Tebas Sign up now!"(뉴스레터 버튼)가 "Javier Tebas signs"가 됐다(운영 데이터 대조)
      if (anchor.nameFirst) {
        const kw = m[0].slice(m.indices[1][1] - m.index).trim();
        if (/^\p{Lu}/u.test(kw) && !/^['’]/u.test(kw)) {
          const next = text.slice(m.index + m[0].length).match(/^\s*([\p{L}\p{N}]\S*)/u)?.[1];
          if (next && !/^[\p{Lu}\p{N}£€$]/u.test(next)) continue;
        }
      }
      const name = cleanCandidate(m[1], text, m.indices[1][0], anchor.nameFirst === true);
      if (!name) continue;
      // 본문에서 잡힌 구단과 같은 표기면 사람이 아니다
      if (clubs.some((c) => c === name || c.includes(name))) continue;
      found.add(name);
    }
  }
  // 같은 사람이 짧게·길게 두 번 잡히면 긴 쪽만 남긴다("Morgan Gibbs" ⊂ "Morgan Gibbs-White")
  return [...found].filter((n) => ![...found].some((o) => o !== n && o.startsWith(n)));
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

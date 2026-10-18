/**
 * LLM 판정의 **요청 쪽** — 모델에 보내는 지시문·출력 형식·사용자 메시지를 조립한다. 받은 출력의 해석·저장은 `judge.mjs`가 한다.
 *
 * 둘을 나눈 이유: 지시문을 고치면 모든 판정이 달라지므로(판정 행의 `verdict_prompt` 지문이 바뀐다) 고칠 자리를 한 파일에 모은다.
 * 이 파일의 함수는 전부 순수 함수다 — 같은 입력이면 같은 요청이 나간다(시각·난수를 싣지 않는다). 파일(용어 사전·구단 프리셋·창 일정)은
 * 기본 인자로만 읽는다.
 *
 * 지시문 고정 장치: `scripts/fixtures/judge-prompt.sha1`에 운영 설정(`JUDGE_CONFIG`)의 지문을 적어 두고 테스트가 대조한다 — 지시문·스키마·
 * 설정을 바꾸면 그 파일도 의도적으로 갱신해야 한다(`node scripts/test-transfer-judge-prompt.mjs --update-fingerprint`).
 */
import { DEAD, RANK } from "./story.mjs";
import { loadGlossary } from "./names-ko.mjs";
import { clubDisplay, presetClubs } from "./club-display.mjs";
import { loadWindows } from "./windows.mjs";
import { clampCp } from "../sync-db.mjs";
import { HOUR_MS, sha1Hex } from "./util.mjs";

/** 관심 구단 상한 — DB CHECK(`transfer_news_verdict_suitors_size`)와 같은 값 */
export const SUITORS_MAX = 10;
/** 금액의 성격 — `transfer_fee_kind` enum과 같은 값 */
export const FEE_KINDS = ["fee", "bid", "asking_price", "release_clause", "valuation"];
export const FEE_CURRENCIES = ["GBP", "EUR", "USD"];
/** 저장된 글의 상한(글자) — 기자 속보는 핵심을 첫 문장에 쓰므로 뒤를 자른다 */
export const BODY_MAX_CHARS = 1_200;
/** 기사 본문의 상한(글자) — 핵심은 앞 문단에 있다 */
export const ARTICLE_MAX_CHARS = 3_000;
/** 판정자가 낼 수 있는 단계 — `transfer_stage` enum에서 unknown을 뺀 것 */
export const JUDGE_STAGES = [...RANK, ...DEAD];
/** 기사 본문의 시작을 알리는 줄 — 번호를 붙이지 않는다(`numberSentences`) */
export const ARTICLE_MARK = "[기사 본문]";

// ── 설정 ──────────────────────────────────────────────────────────────

/**
 * 판정 설정 후보 — 모델·생각 여부·effort·출력 상한. A/B 비교(`bench-transfer-judge.mjs`)가 이 키로 고른다.
 * ⚠ Sonnet 5.5는 `{type:"disabled"}`를 받지 않는다(400) — 그 모델은 adaptive만 둔다.
 * ⚠ Sonnet 5 계열은 temperature·top_p를 받지 않는다(400) — 일관성은 지시문·출력 순서로 얻는다.
 * 생각이 켜진 설정은 생각 + 출력이 함께 상한을 쓰므로 넉넉히 준다.
 */
export const JUDGE_CONFIGS = {
  "s5-off": { model: "claude-sonnet-5", thinking: { type: "disabled" }, effort: "low", maxTokens: 1_000 },
  "s5-adaptive": { model: "claude-sonnet-5", thinking: { type: "adaptive" }, effort: "low", maxTokens: 4_000 },
  "s55-adaptive": { model: "claude-sonnet-5-5", thinking: { type: "adaptive" }, effort: "low", maxTokens: 4_000 },
};
/**
 * 운영 기본 설정 — 같은 보도 묶음을 설정마다 여러 번 물어(`scripts/bench-transfer-judge.mjs`) 반복끼리 가장 같은 답을 낸 설정이다.
 * 호출당 비용은 s5-off와 같은 수준이고, 단계·행선지·선수 표기의 흔들림이 가장 작았다. 설정을 바꿀 때도 벤치로 고른다
 * (Haiku 4.5는 공식 이적 보도를 "무관"으로 버린 적이 있다).
 */
export const JUDGE_CONFIG = JUDGE_CONFIGS["s55-adaptive"];
export const JUDGE_MODEL = JUDGE_CONFIG.model;

// ── 출력 형식 ─────────────────────────────────────────────────────────

const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
/**
 * 모델 출력의 형식 — 스키마로 고정한다.
 * ⚠ **속성 순서가 곧 생성 순서다**(구조화 출력은 스키마의 속성 순서대로 쓴다) — 근거 문장·시점을 먼저 쓰고 결론(move·stage·구단)을
 *   뒤에 쓰게 한다. 결론부터 쓰면 근거가 결론을 따라 고른 것이 된다. 개수·길이(근거 1~3개, why 30단어)는 구조화 출력이
 *   검사하지 않으므로 해석(`judge.mjs`)이 코드로 본다.
 */
export const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["evidence_ids", "timing", "player", "why", "move", "stage", "from", "to", "suitors", "fee", "player_ko", "summary_ko"],
  properties: {
    evidence_ids: { type: "array", items: { type: "integer" } },
    timing: nullable({ type: "string", enum: ["current", "past"] }),
    player: nullable({ type: "string" }),
    why: { type: "string" },
    move: { type: "boolean" },
    stage: nullable({ type: "string", enum: JUDGE_STAGES }),
    from: nullable({ type: "string" }),
    to: nullable({ type: "string" }),
    suitors: { type: "array", items: { type: "string" } },
    // 원문 표기(text)를 먼저 옮기고 숫자를 읽게 한다 — 금액 대조는 해석이 원문과 한다
    fee: nullable({
      type: "object",
      additionalProperties: false,
      required: ["text", "amount", "currency", "kind"],
      properties: {
        text: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string", enum: FEE_CURRENCIES },
        kind: { type: "string", enum: FEE_KINDS },
      },
    }),
    player_ko: nullable({ type: "string" }),
    summary_ko: nullable({ type: "string" }),
  },
};

// ── 원문 ──────────────────────────────────────────────────────────────

/**
 * 모델에 보낼 글의 말줄임 — 잘렸음을 `…`로 알린다(자르기는 `sync-db.mjs`의 `clampCp`).
 * ⚠ **DB에 저장하는 값에는 쓰지 않는다** — `…`가 붙어 상한보다 한 글자 길어진다. 근거 인용이
 *   300자를 넘으면 301코드포인트가 되어 CHECK(`transfer_news_verdict_evidence_len`)에 걸렸다.
 */
export function ellipsize(text, max) {
  const cut = clampCp(text, max);
  return cut === text ? text : `${cut}…`;
}

/** 링크 주소를 걷는다 — 모델은 링크를 열 수 없고 열 도구도 주지 않는다 */
export function stripLinks(body) {
  return decodeEntities(body)
    .replace(/\bhttps?:\/\/\S+/giu, " ")
    .replace(/\b(?:pic\.twitter\.com|t\.co)\/\S+/giu, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * HTML 엔티티를 글자로 푼다 — 구글 뉴스 소스의 저장 글에 `&nbsp;`가 그대로 남아(운영 저장분 수백 건) 모델에 엔티티째 갔다.
 * 자주 나오는 이름 엔티티와 숫자 엔티티만 푼다(모르는 이름은 그대로 둔다).
 */
const NAMED_ENTITIES = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** 원문 평문 — 저장된 글(링크를 걷고 자른 것) + 받은 기사 본문. 이름·구단·금액 대조는 이 평문과 한다 */
export function composeText(storedBody, article = "") {
  const stored = ellipsize(stripLinks(storedBody), BODY_MAX_CHARS);
  return article ? `${stored}\n\n${ARTICLE_MARK}\n${stripLinks(article)}` : stored;
}

/** 문장 끝 뒤의 공백 — 마침표·물음표·느낌표·말줄임(닫는 따옴표·괄호 포함) 뒤, 다음 글자가 소문자가 아닐 때만 자른다 */
const SENTENCE_BREAK = /(?<=[.!?…]["'”’»)\]]*)\s+(?=[^\s\p{Ll}])/u;
/** 마침표로 끝나도 문장 끝이 아닌 토큰 — 이니셜(J.)·호칭(Mr.)·약어(St. vs.) */
const NOT_A_BREAK = /(?:^|[\s(])(?:\p{Lu}|Mr|Mrs|Ms|Dr|St|Jr|Sr|No|vs|v)\.["'”’]?$/u;

function splitSentences(line) {
  const out = [];
  for (const part of line.split(SENTENCE_BREAK)) {
    if (out.length && NOT_A_BREAK.test(out[out.length - 1])) out[out.length - 1] += ` ${part}`;
    else out.push(part);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * 원문에 문장 번호를 붙인다 — 모델은 근거를 인용문이 아니라 번호(`evidence_ids`)로 낸다. 인용을 줄여 적어 원문 대조에서 판정이
 * 버려지던 것(판정 불가의 대부분)을 구조로 없앤다.
 * 줄마다 문장으로 나누고 빈 줄은 버린다. `[기사 본문]` 줄은 번호 없이 그대로 둔다. 결정적이다(같은 입력 → 같은 번호).
 * @returns {{ text: string, sentences: string[] }} `sentences[i - 1]`이 `[i]`의 평문 문장
 */
export function numberSentences(sentText) {
  const sentences = [];
  const lines = [];
  for (const raw of String(sentText ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line === ARTICLE_MARK) {
      lines.push(ARTICLE_MARK);
      continue;
    }
    for (const s of splitSentences(line)) {
      sentences.push(s);
      lines.push(`[${sentences.length}] ${s}`);
    }
  }
  return { text: lines.join("\n"), sentences };
}

/** 판정 입력 — 요청 조립과 해석(`judge.mjs`)이 같은 평문·문장 목록을 얻는 단일 경로 */
export function prepareJudgeInput(need, article = "") {
  const sentText = composeText(need.body ?? "", article);
  return { sentText, numbered: numberSentences(sentText) };
}

// ── 지시문 ────────────────────────────────────────────────────────────

/**
 * 구단 표 — 5대 리그 프리셋 + 사람이 고친 표기(`glossary-ko.json`의 clubs). 요약이 구단을 음역하지 않고 이 표기를 쓰게 한다
 * (모델이 음역한 이름이 다른 구단이 됐다 — "Sporting"이 "스포르팅 히혼"). 모든 호출이 같은 문자열이라 지시문에 싣는다(캐시된다).
 * 순서는 영문명 코드포인트순이다(`localeCompare`는 ICU 판에 따라 바뀔 수 있어 쓰지 않는다).
 */
export function buildClubTable(clubs = { ...Object.fromEntries(presetClubs().map((en) => [en, clubDisplay(en).name])), ...loadGlossary().clubs }) {
  return Object.entries(clubs)
    .filter(([en, ko]) => ko && ko !== en)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([en, ko]) => `${en} = ${ko}`);
}

/**
 * 완성 예시 — 이름은 전부 지어낸 것이다(진짜 이름이면 모델이 베껴 쓴다). 출력은 `JUDGE_SCHEMA`의 키 순서 그대로다(테스트가 대조한다).
 * 유형: 관심 구단 여럿(to null) · 지난 창 무산의 회고(past) · 공식 발표 + 금액 + 요약 · 재계약.
 */
export const JUDGE_EXAMPLES = [
  {
    input: [
      "<기준>\n보도 날짜: 2026-07-20 (한국 시각)\n이적시장: 2026 여름 창 안 (개장 2026-06-15 · 마감 2026-09-02)\n다음 창: 2027 겨울 (개장 2027-01-01)\n</기준>",
      "<선수>Rafael Ostoja</선수>",
      "<표기>\nRafael Ostoja = 하파엘 오스토야\n</표기>",
      "<원문>\n[1] Ostoja wanted by three clubs\n[2] Kestrel City, Dunmore Athletic and Valborg are all monitoring Varnholm midfielder Rafael Ostoja.\n[3] Varnholm value the 22-year-old at around €40m.\n</원문>",
    ].join("\n"),
    output: {
      evidence_ids: [2],
      timing: "current",
      player: "Rafael Ostoja",
      why: "세 구단이 주시만 하고 있고 협상·제안 상대가 없어 행선지를 정할 수 없다.",
      move: true,
      stage: "rumour",
      from: "Varnholm",
      to: null,
      suitors: ["Kestrel City", "Dunmore Athletic", "Valborg"],
      fee: { text: "€40m", amount: 40, currency: "EUR", kind: "valuation" },
      player_ko: "하파엘 오스토야",
      summary_ko: "Varnholm의 미드필더 하파엘 오스토야를 두고 Kestrel City, Dunmore Athletic, Valborg가 영입을 주시하고 있다. Varnholm은 22세인 그의 평가액을 €40m 안팎으로 보고 있다.",
    },
  },
  {
    input: [
      "<기준>\n보도 날짜: 2026-10-05 (한국 시각)\n이적시장: 창 사이\n직전 창: 2026 여름 (마감 2026-09-02)\n다음 창: 2027 겨울 (개장 2027-01-01)\n</기준>",
      "<선수>Jonas Halvorsen</선수>",
      "<표기>\n(없음)\n</표기>",
      "<원문>\n[1] Halvorsen opens up on failed Kestrel City move\n[2] Brennmoor striker Jonas Halvorsen says he was close to joining Kestrel City in the summer before talks collapsed.\n[3] \"It hurt, but I am happy here now,\" he said.\n</원문>",
    ].join("\n"),
    output: {
      evidence_ids: [2],
      timing: "past",
      player: "Jonas Halvorsen",
      why: "지난여름 창에 무산된 이적을 선수가 돌아보는 인터뷰이고 지금 새 움직임은 없다.",
      move: false,
      stage: null,
      from: "Brennmoor",
      to: null,
      suitors: [],
      fee: null,
      player_ko: null,
      summary_ko: null,
    },
  },
  {
    input: [
      "<기준>\n보도 날짜: 2026-08-28 (한국 시각)\n이적시장: 2026 여름 창 안 (개장 2026-06-15 · 마감 2026-09-02)\n다음 창: 2027 겨울 (개장 2027-01-01)\n</기준>",
      "<선수>Marco Velloni</선수>",
      "<표기>\nMarco Velloni = 마르코 벨로니\n</표기>",
      "<원문>\n[1] OFFICIAL: Dunmore Athletic sign Marco Velloni\n[2] Dunmore Athletic have confirmed the signing of winger Marco Velloni from Ostrava Rovers on a five-year contract.\n[3] The fee is understood to be £32m plus £4m in add-ons.\n</원문>",
    ].join("\n"),
    output: {
      evidence_ids: [1, 2],
      timing: "current",
      player: "Marco Velloni",
      why: "구단이 영입을 공식 발표했고 이적료가 원문에 적혀 있다.",
      move: true,
      stage: "official",
      from: "Ostrava Rovers",
      to: "Dunmore Athletic",
      suitors: [],
      fee: { text: "£32m", amount: 32, currency: "GBP", kind: "fee" },
      player_ko: "마르코 벨로니",
      summary_ko: "Dunmore Athletic이 Ostrava Rovers에서 윙어 마르코 벨로니를 영입했다고 공식 발표했다. 계약 기간은 5년이고 이적료는 £32m에 옵션 £4m으로 알려졌다.",
    },
  },
  {
    input: [
      "<기준>\n보도 날짜: 2026-11-12 (한국 시각)\n이적시장: 창 사이\n직전 창: 2026 여름 (마감 2026-09-02)\n다음 창: 2027 겨울 (개장 2027-01-01)\n</기준>",
      "<선수>Leo Marchetti</선수>",
      "<표기>\n(없음)\n</표기>",
      "<원문>\n[1] Kestrel City tie down Marchetti\n[2] Kestrel City defender Leo Marchetti has signed a new contract until 2031, ending interest from Valborg.\n</원문>",
    ].join("\n"),
    output: {
      evidence_ids: [2],
      timing: "current",
      player: "Leo Marchetti",
      why: "지금 소속 구단과의 재계약 소식이라 구단 이동이 아니다.",
      move: false,
      stage: null,
      from: "Kestrel City",
      to: null,
      suitors: [],
      fee: null,
      player_ko: null,
      summary_ko: null,
    },
  },
];

/**
 * 지시문 — 모든 호출이 같은 문자열이다(용어 사전·구단 표·예시 포함). 행마다 달라지는 것(<기준>·<표기>·원문)은 사용자 메시지로 간다.
 *
 * 문장마다의 근거(감사, 2026-10):
 * - to는 사실만: 행선지와 관심 구단의 갈림이 오류의 최다 유형이었고 지시문 버전 간 to 불일치가 33%였다 — "하나뿐이면 to로 올리기"는
 *   코드(`normalizeDestination`)가 하고 모델은 단계로만 가른다.
 * - stage 단서: denied↔rumour·collapsed↔denied·agreement↔official이 같은 보도에서 흔들렸다.
 * - evidence_ids: 인용을 줄여 적어 원문 대조에서 판정이 버려졌다. 재계약 문장을 근거로 고르면 해석의 재계약 가드가 진짜 이적설을 접는다.
 * - summary: 요약 중앙값이 63자로 지시("120자 안팎")의 절반이었고 금액 누락이 20/143, 모델의 구단 음역이 다른 구단이 됐다.
 * - player_ko: 위키데이터 레이블(≈)은 외래어 표기법식이라 참고값으로만 준다 — 그대로 받아 적으면 통용 표기로 바뀔 기회가 없다.
 */
export function buildSystem(terms = loadGlossary().terms, clubLines = buildClubTable()) {
  const termLines = Object.entries(terms).map(([en, ko]) => `${en} → ${ko}`);
  const examples = JUDGE_EXAMPLES.map((e, i) => `예시 ${i + 1}\n입력:\n${e.input}\n출력:\n${JSON.stringify(e.output)}`);
  return `너는 축구 이적 보도를 읽는 편집자다. <원문>이 <선수>의 구단 이동을 지금 보도하는지 판정하고, 근거 문장·시점·선수·단계·구단·금액과 한국어 요약을 낸다. 출력 필드는 아래 순서대로 채운다 — 근거 문장과 시점을 먼저 정하고 결론은 그 뒤에 적는다.

[입력]
- <기준>: 보도 날짜(한국 시각)와 그 날짜가 어느 이적시장 창 안인지·창 사이인지, 직전 창 마감과 다음 창 개장. 없으면 원문만으로 판단한다.
- <선수>: 판정할 선수. 비어 있을 수 있다.
- <표기>: 이 보도의 구단·선수 한국어 표기. "="는 확정 표기, "≈"는 외래어 표기법식 참고값이다.
- <원문>: 문장마다 [번호]가 붙어 있다. [1]은 제목(또는 첫 줄)이다. "${ARTICLE_MARK}" 줄이 있으면 그 뒤가 기사 본문이고, 본문이 있으면 본문으로 판정한다 — 제목에만 이적 낱말이 있고 본문이 다른 이야기면(라이브 블로그·소식 모음) 이동이 아니다.

[evidence_ids] 판정의 근거가 된 문장 번호 1~3개(<원문>에 있는 번호만). move가 true면 옮김(관심·협상·제안·합의·발표·무산·부인)을 말하는 문장에서 고른다 — 재계약·계약 연장 문장은 이동의 근거가 아니다. move가 false면 이동이 아니라고 본 문장을 고르고, 마땅한 문장이 없으면 [].

[timing] <기준>의 보도 날짜를 기준으로 판단한다. current — 지금 창이나 다음 창을 향한 움직임(새 관심·협상·제안·합의·메디컬·발표, 지금 일어난 무산·부인). past — 지난 창에 이미 끝난 이적·무산·관심을 돌아보는 글과 그 뒷이야기(뒤늦게 공개된 이적료·협상 과정, 대리인·변호사·전 감독의 설명, 이적한 뒤의 적응·평가, 지난 창 영입을 정리·평가하는 베스트 영입·결산 기사, 무산된 이적을 회상하는 선수 인터뷰). 지난 일을 언급해도 지금 다시 움직임이 있다는 소식(1월에 재도전한다, 여전히 원한다, 다시 접촉했다)이면 current다. 이적과 무관한 글은 null.
예: "X reflects on collapse of City move"(창 사이) → past · "Braga president reveals fee Newcastle paid for X" → past · "X rejected interest from Liverpool this summer"(창 사이) → past · "X still keen to join Liverpool after summer move failed" → current · "Juventus confirm signing of X"(창 안) → current.

[player] <선수>가 있으면 그 이름을 그대로 옮긴다. <선수>가 비어 있으면 원문이 이동을 다루는 선수 한 명의 이름을 원문 표기 그대로 적는다 — 성과 이름이 원문에 모두 있으면 전체 이름. 적기 전에 그 사람이 이동 당사자인지 본다: 재계약한 선수, 배경으로 언급된 선수, 곁다리로 나온 선수는 당사자가 아니다. 여러 선수를 같은 비중으로 다루면 제목([1])·첫 문장의 선수다. 감독·코치·임원·에이전트는 선수가 아니다. 선수를 특정할 수 없으면 null이고 move는 false다.

[why] 이 판정을 내린 까닭을 한국어 한 문장, 30단어 이내로. 근거 문장에 있는 사실만 짧게 적는다.

[move] true: 이적·임대·자유계약 이적, 영입 관심·루머·제안·협상·합의·개인 조건·메디컬·공식 발표, 진행 중인 이적의 무산·결렬, 루머에 대한 부인(구단이 팔 생각이 없다·선수가 떠날 생각이 없다·기자가 관심설을 부인), 입단 테스트 뒤 계약을 맺었다·서명했다는 보도, 가족·에이전트·대리인의 발언으로 전하는 이적 가능성과 관심 구단, 친정 복귀설, 유스·10대 선수의 구단 이동.
false:
- timing이 past인 글
- 지금 소속 구단과의 재계약·계약 연장·첫 프로 계약
- 인터뷰·발언·의견·비교·칭찬(누구를 닮았다, 누구와 의견이 같다)
- 경기 결과·부상·징계·대표팀 소집
- 감독·코치·단장·임원의 선임·거취
- <선수>는 곁다리이고 다른 사람의 이동을 다루는 글
- 제목에만 이적 낱말이 있고 본문이 다른 이야기인 글
- 입단 테스트·전지훈련 합류(계약을 맺었다는 말이 없으면)
관용구에 속지 않는다: "in agreement with"(의견 동의), "not interested in", 낚시성 제목.

[stage] move가 true일 때 보도가 말하는 단계 하나, false면 null. 한 글에 여러 단계가 나오면 가장 진전된 하나다. 단서:
- rumour: interested · monitoring · linked · target · on the radar · enquiry (관심·주시·연결·문의)
- talks: in talks · negotiations · contact · approach (협상·접촉)
- offer: bid · offer submitted · proposal (제안·입찰 제출)
- agreement: agreement between clubs · fee agreed (구단 간 합의)
- personal_terms: personal terms agreed (개인 조건 합의)
- medical: medical scheduled · medical underway (메디컬)
- here_we_go: here we go · done deal · contracts signed · announcement expected (확정, 공식 발표 전)
- official: announced · confirmed · unveiled · completed (구단의 공식 발표·완료). 합의가 전해졌어도 발표·완료를 말하는 문장이 없으면 official이 아니다.
- collapsed: 협상·제안·합의가 있었던 뒤에 끝났다 (talks collapsed · pulled out · deal off · bid rejected and walked away)
- denied: 관심·연결 소문을 당사자(구단·선수·대리인·기자)가 부인했다 (denies · rules out · not for sale · no plans to leave)
글의 주제가 다른 구단의 관심이고 소속 구단의 "팔 생각이 없다"는 곁들인 말이면 denied가 아니라 rumour다.

[from / to / suitors] 원문에 적힌 구단명을 글자 그대로 옮긴다(번역·줄임·정규화하지 않는다). 원문에 없으면 null·[].
- from: 선수의 현재 소속 구단(자유계약이면 직전 소속, 임대 중이면 임대로 뛰는 구단).
- to: 협상·제안·합의·메디컬·완료 중인 상대 구단만 — 원문이 그 구단과의 그 단계를 말할 때다.
- suitors: 관심·주시·연결 수준의 구단은 몇 개든(하나뿐이어도) 전부 여기에 언급 순으로 적는다(최대 ${SUITORS_MAX}). 협상 상대가 없으면 to는 null이고 그 구단들을 전부 suitors에 적는다. to와 suitors에 같은 구단을 적지 않는다.
- suitors에는 이 글이 지금 관심을 보인다고 말하는 구단만 적는다 — 과거에 무산된 이적의 상대나 다른 루머의 구단은 넣지 않는다.
예: "Bayern are keen on X" → to null, suitors [Bayern] · "Tottenham, Newcastle and Chelsea are interested in X" → to null, suitors 셋 · "Chelsea have opened talks over X, while United and Liverpool are monitoring" → to Chelsea, suitors [United, Liverpool] · "Real Madrid have made a bid for Stuttgart's X" → from Stuttgart, to Real Madrid.

[fee] 그 선수의 이동에 붙은 금액 하나와 그 성격, 원문에 없으면 null. 제목·첫 문단이 그 선수에 대해 말하는 금액을 고르고, 같은 비중이면 fee > bid > asking_price > release_clause > valuation 순이다. text는 원문의 금액 표기 그대로("£60m", "€20-25m"). amount는 백만 단위 숫자(£60m → 60, €500k → 0.5), currency는 GBP·EUR·USD. kind: fee(합의·완료된 이적료) · bid(제안·입찰액) · asking_price(구단의 요구액·가격표) · release_clause(바이아웃) · valuation(평가액·예상액 — 합의 전 "~규모의 딜 논의"도 여기다). 범위(€20-25m)면 amount는 높은 값, 같은 금액을 두 통화로 적었으면(€100m (£86m)) 먼저 적힌 쪽. 다른 선수의 금액, 주급·연봉, 옵션(add-ons)은 적지 않는다.

[player_ko] 선수의 한글 표기. <표기>에 "="로 적힌 표기는 그대로 쓴다. "≈"로 적힌 표기는 외래어 표기법식 참고값이다 — 한국 팬·매체가 쓰는 통용 표기가 같으면 그대로, 다르면 통용 표기를 쓴다(예: 가크포 → 각포, 홀란 → 홀란드, 판 데이크 → 반 다이크). 통용 표기를 모르면 ≈ 표기를 쓴다. <표기>에 없으면 통용 표기를 쓰고(Cody Gakpo → 코디 각포, Erling Haaland → 엘링 홀란드, Trent Alexander-Arnold → 트렌트 알렉산더-아놀드), 모르면 null이다(음역을 지어내지 않는다). 이니셜은 영문 대문자 그대로 둘 수 있다("JJ 가브리엘").

[summary_ko] move가 true일 때만 한국어 두 문장, 공백 포함 90~140자. false면 null.
- 첫 문장: 누가(현 소속) 어디로 가는지, 또는 어떤 구단들이 관심을 보이는지와 그 단계.
- 둘째 문장: 원문에 있는 것 가운데 금액(성격과 함께 — "£60m 제안이 거절됐다", "요구액은 €100m"), 임대·자유계약 여부, 다른 관심 구단, 계약 기간. 요구액·제안액을 이적료라고 쓰지 않는다.
- 보도의 확신 수준 그대로 쓴다: reportedly → "~로 전해졌다", could → "~할 수 있다". 관심을 합의처럼 올려 쓰지 않는다.
- 행선지에는 "~로/~에", 출발에는 "~에서"를 붙인다.
- 금액은 원문의 기호·단위 그대로(£69m, €500k) — "6900만 파운드"·"69M"으로 바꾸지 않는다. 날짜·숫자도 원문 값 그대로.
- 원문에 없는 사실을 더하지 않는다. 그 선수의 이야기만 쓴다 — 같은 글의 다른 선수 소식은 뺀다. 지난 일은 과거형으로, 지금 일과 섞지 않는다.
- 선수 이름은 player_ko와 같게 쓰고, player_ko가 null이면 영문 그대로 둔다. 구단 이름은 <표기>나 <구단 표>에 있으면 그 표기, 없으면 원문 영문 그대로 둔다(음역하지 않는다). 이적 용어는 <용어>의 표기를 쓴다.
- 한글·숫자·통화 기호와 영문 고유명사만 쓴다(한자·다른 문자를 섞지 않는다).

<구단 표>
${clubLines.join("\n") || "(없음)"}
</구단 표>
<용어>
${termLines.join("\n") || "(없음)"}
</용어>

[예시] 이름은 전부 지어낸 것이다 — 실제 보도에 옮겨 쓰지 않는다.
${examples.join("\n\n")}`;
}

// ── 사용자 메시지 ─────────────────────────────────────────────────────

/**
 * 그 보도에 나온 구단·선수의 한국어 표기 — 표기가 있는 것만 싣는다(전체 사전은 호출마다 토큰이다).
 * 선수는 둘로 나눈다: `=` 사람 사전·판정자의 통용 표기(그대로 쓴다), `≈` 위키데이터 레이블(외래어 표기법식 참고값 — 통용 표기가
 * 다르면 모델이 고친다). 레이블을 `=`로 넘기면 모델이 그대로 받아 적어 통용 표기로 바뀔 기회가 없다.
 * @param {{ clubs?: string[], playerKey: string | null, player: string | null }} need 구단은 정규 영문명
 * @param {{ club: Function, playerKo: Function, playerKoTrusted?: Function, playerKoReference?: Function }} names
 */
export function buildGlossary(need, names) {
  const lines = [];
  for (const en of need.clubs ?? []) {
    const ko = names.club(en)?.name;
    if (ko && ko !== en) lines.push(`${en} = ${ko}`);
  }
  if (!need.playerKey) return lines;
  const ko = (names.playerKoTrusted ?? names.playerKo)(need.playerKey);
  const ref = ko ? null : (names.playerKoReference?.(need.playerKey) ?? null);
  if (ko) lines.push(`${need.player} = ${ko}`);
  else if (ref) lines.push(`${need.player} ≈ ${ref}`);
  return lines;
}

let windowsCache = null;
const KST_MS = 9 * HOUR_MS;
const kstDate = (ms) => new Date(ms + KST_MS).toISOString().slice(0, 10);

/**
 * <기준> 블록의 줄 — 보도 날짜(한국 시각)와 그 시각이 어느 창 안인지·창 사이인지, 직전 창 마감·다음 창 개장.
 * 판정자가 "지난 창에 끝난 일(past)"과 "지금·다음 창을 향한 움직임(current)"을 가르는 기준이다. 지금 시각은 싣지 않는다 —
 * 같은 행이면 언제 물어도 같은 요청이어야 한다. 게시 시각이 없거나 읽을 수 없으면 null(블록을 생략한다).
 * @param {string | null | undefined} publishedAt ISO
 * @param {{ key: string, label: string, opensAt: string, closesAt: string }[]} [windows] 시간순(`loadWindows`)
 */
export function buildBasis(publishedAt, windows = (windowsCache ??= loadWindows())) {
  const t = Date.parse(publishedAt ?? "");
  if (!Number.isFinite(t)) return null;
  const inside = windows.find((w) => Date.parse(w.opensAt) <= t && t <= Date.parse(w.closesAt)) ?? null;
  const prev = windows.filter((w) => Date.parse(w.closesAt) < t).at(-1) ?? null;
  const next = windows.find((w) => Date.parse(w.opensAt) > t) ?? null;
  const lines = [`보도 날짜: ${kstDate(t)} (한국 시각)`];
  lines.push(inside
    ? `이적시장: ${inside.label} 창 안 (개장 ${kstDate(Date.parse(inside.opensAt))} · 마감 ${kstDate(Date.parse(inside.closesAt))})`
    : "이적시장: 창 사이");
  if (prev) lines.push(`직전 창: ${prev.label} (마감 ${kstDate(Date.parse(prev.closesAt))})`);
  lines.push(next ? `다음 창: ${next.label} (개장 ${kstDate(Date.parse(next.opensAt))})` : "다음 창: 일정 없음");
  return lines;
}

/** 사용자 메시지 — 기준 · 선수 · 표기 · 번호 붙은 원문. 시각·난수 같은 변동값을 싣지 않는다(같은 행이면 같은 요청) */
function buildUserContent(player, glossaryLines, numberedText, basisLines = null) {
  const basis = basisLines ? `<기준>\n${basisLines.join("\n")}\n</기준>\n` : "";
  return `${basis}<선수>${player ?? ""}</선수>\n<표기>\n${glossaryLines.join("\n") || "(없음)"}\n</표기>\n<원문>\n${numberedText}\n</원문>`;
}

/**
 * 요청 — 순수 함수(테스트가 모양을 고정한다).
 * @param {{ player: string | null, playerKey: string | null, body: string, clubs?: string[], published_at?: string | null }} need
 * @param {typeof JUDGE_CONFIG} [config]
 */
export function buildJudgeRequest(need, names, system, article = "", config = JUDGE_CONFIG) {
  const { numbered } = prepareJudgeInput(need, article);
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    thinking: config.thinking,
    output_config: { effort: config.effort, format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserContent(need.player, buildGlossary(need, names), numbered.text, buildBasis(need.published_at)) }],
  };
}


/** 지시문 지문(12자) — 지시문·출력 형식·모델·생각 설정·effort 중 하나라도 바뀌면 바뀐다(`transfer_news.verdict_prompt`) */
export function judgeFingerprint(system, config = JUDGE_CONFIG) {
  return sha1Hex(withoutDictionaries(system) + JSON.stringify(JUDGE_SCHEMA) + config.model + JSON.stringify(config.thinking) + config.effort, 12);
}

/**
 * 지문에서 사전 구간(`<구단 표>`·`<용어>`)을 뺀다 — 지문은 **판정 규칙**이 바뀌었는지를 가리킨다. 사전은 주간 정비로 자주 바뀌는데
 * 그때마다 모든 판정이 "옛 지시문 판정"(`--rejudge-stale` 대상)이 되면 표기 한 줄 고친 것이 전량 재판정 비용으로 번진다.
 * 사전이 바뀐 효과는 다시 묻지 않고 요약 쪽(교정표·사전 표기 맞추기)에서 반영된다.
 */
function withoutDictionaries(system) {
  // 줄 하나를 차지한 여는 꼬리표부터만 지운다 — 지시문 문장 속의 "<구단 표>" 언급부터 지우면 그 사이 규칙 문장이 지문에서 빠진다
  return String(system).replace(/^<구단 표>\n[\s\S]*?^<\/구단 표>$/mu, "<구단 표/>").replace(/^<용어>\n[\s\S]*?^<\/용어>$/mu, "<용어/>");
}

/** 입력 지문(16자) — 사용자 메시지가 같으면 같다(`transfer_news.verdict_input`). 재생이 "입력이 바뀐 행"을 가르는 데 쓴다 */
export function inputFingerprint(request) {
  return sha1Hex(String(request.messages?.[0]?.content ?? ""), 16);
}

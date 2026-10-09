/**
 * LLM 판정의 요청 쪽(`scripts/lib/transfer/judge-prompt.mjs`) 회귀 테스트 — API를 부르지 않는다.
 * 지시문·출력 형식·사용자 메시지의 모양을 고정한다.
 *
 *   node scripts/test-transfer-judge-prompt.mjs
 *   node scripts/test-transfer-judge-prompt.mjs --update-fingerprint   지시문을 의도적으로 바꾼 뒤 지문 파일을 갱신한다
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  ARTICLE_MARK,
  FEE_KINDS,
  JUDGE_CONFIG,
  JUDGE_CONFIGS,
  JUDGE_EXAMPLES,
  JUDGE_MODEL,
  JUDGE_SCHEMA,
  JUDGE_STAGES,
  buildBasis,
  buildClubTable,
  buildGlossary,
  buildJudgeRequest,
  buildSystem,
  composeText,
  inputFingerprint,
  judgeFingerprint,
  numberSentences,
  prepareJudgeInput,
} from "./lib/transfer/judge-prompt.mjs";
import { loadGlossary } from "./lib/transfer/names-ko.mjs";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ${detail}`}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const KEY_ORDER = ["evidence_ids", "timing", "player", "why", "move", "stage", "from", "to", "suitors", "fee", "player_ko", "summary_ko"];
/** reasoning_extraction 거절을 부르는 말 — 필드 이름·설명·지시문 어디에도 두지 않는다 */
const BANNED = /reasoning|thinking|chain[- ]of[- ]thought|생각 과정|사고 과정|추론/i;
const SYSTEM = buildSystem();

// ── 출력 형식 ─────────────────────────────────────────────────────────
check("스키마 — 속성 순서가 근거 → 시점 → 선수 → 설명 → 결론 순이다(생성 순서)", eq(Object.keys(JUDGE_SCHEMA.properties), KEY_ORDER), JSON.stringify(Object.keys(JUDGE_SCHEMA.properties)));
check("스키마 — 모든 필드를 같은 순서로 요구하고 다른 필드를 막는다", eq(JUDGE_SCHEMA.required, KEY_ORDER) && JUDGE_SCHEMA.additionalProperties === false);
{
  const fee = JUDGE_SCHEMA.properties.fee.anyOf[0];
  check("스키마 — 금액은 원문 표기(text)를 함께 받고 다른 필드를 막는다", fee.additionalProperties === false && eq([...fee.required].sort(), ["amount", "currency", "kind", "text"]) && eq(Object.keys(fee.properties).sort(), [...fee.required].sort()));
}
check("스키마 — 구조화 출력이 지원하지 않는 길이·개수 제약을 쓰지 않는다", !/"(?:minItems|maxItems|maxLength|minLength)"/.test(JSON.stringify(JUDGE_SCHEMA)));
check("금지어 — 스키마에 reasoning·thinking·생각 과정이 없다", !BANNED.test(JSON.stringify(JUDGE_SCHEMA)));
check("금지어 — 지시문에 reasoning·thinking·생각 과정이 없다", !BANNED.test(SYSTEM), SYSTEM.match(BANNED)?.[0]);

// ── 원문 번호 ─────────────────────────────────────────────────────────
{
  const sent = composeText("Ostoja wanted by three clubs\nKestrel City are monitoring him. Mr. Smith says J. Doe is close!", "Arsenal agree £60.5m fee for U.S. star.\n\nTalks continue.");
  const a = numberSentences(sent);
  const b = numberSentences(sent);
  check("번호 — 같은 입력이면 같은 번호(결정적)", eq(a, b));
  check("번호 — 줄과 문장마다 번호를 붙이고 문장 목록과 맞는다",
    eq(a.sentences, ["Ostoja wanted by three clubs", "Kestrel City are monitoring him.", "Mr. Smith says J. Doe is close!", "Arsenal agree £60.5m fee for U.S. star.", "Talks continue."]), JSON.stringify(a.sentences));
  check("번호 — [기사 본문] 줄은 번호 없이 그대로 남고 빈 줄은 버린다",
    a.text === `[1] Ostoja wanted by three clubs\n[2] Kestrel City are monitoring him.\n[3] Mr. Smith says J. Doe is close!\n${ARTICLE_MARK}\n[4] Arsenal agree £60.5m fee for U.S. star.\n[5] Talks continue.`, a.text);
  check("번호 — [n]의 문장이 sentences[n-1]이다", a.sentences.every((s, i) => a.text.includes(`[${i + 1}] ${s}`)));
  check("번호 — 소수점·이니셜·호칭에서 자르지 않는다", a.sentences.includes("Mr. Smith says J. Doe is close!") && a.sentences.some((s) => s.includes("£60.5m")));
  check("번호 — 소문자로 이어지는 문장은 자르지 않는다", numberSentences("He is close. but not done.").sentences.length === 1);
  check("번호 — 빈 글은 빈 목록", eq(numberSentences(""), { text: "", sentences: [] }));
}
{
  const need = { player: "X", playerKey: null, body: "Line one. Line two." };
  const p = prepareJudgeInput(need, "Body text.");
  check("prepareJudgeInput — 평문은 composeText, 번호는 그 평문에서", p.sentText === composeText(need.body, "Body text.") && eq(p.numbered, numberSentences(p.sentText)));
}

// ── 요청 ──────────────────────────────────────────────────────────────
const names = {
  club: (en) => ({ "Real Madrid": { name: "레알 마드리드" }, Udinese: { name: "우디네세" } })[en] ?? null,
  playerKo: () => null,
  playerKoTrusted: (k) => ({ "david alaba": "다비드 알라바" })[k] ?? null,
  playerKoReference: (k) => ({ "cody gakpo": "코디 가크포" })[k] ?? null,
};
const NEED = {
  player: "David Alaba",
  playerKey: "david alaba",
  body: "🚨 Alaba joins Udinese https://t.co/DOzpNRhhbi — here we go! Deal done.",
  clubs: ["Real Madrid", "Udinese", "Kolkheti 1913"],
  published_at: "2026-08-20T10:00:00Z",
};
{
  const off = buildJudgeRequest(NEED, names, SYSTEM, "", JUDGE_CONFIGS["s5-off"]);
  check("설정 — 운영 기본은 벤치로 고른 s55-adaptive", JUDGE_CONFIG === JUDGE_CONFIGS["s55-adaptive"] && JUDGE_MODEL === "claude-sonnet-5-5");
  check("설정 s5-off — 생각을 끄고 effort low", eq(off.thinking, { type: "disabled" }) && off.output_config.effort === "low" && off.model === "claude-sonnet-5" && off.max_tokens === JUDGE_CONFIGS["s5-off"].maxTokens);
  for (const key of ["s5-adaptive", "s55-adaptive"]) {
    const r = buildJudgeRequest(NEED, names, SYSTEM, "", JUDGE_CONFIGS[key]);
    check(`설정 ${key} — adaptive 생각 + 넉넉한 출력 상한`, eq(r.thinking, { type: "adaptive" }) && r.max_tokens >= 3_000 && r.model === JUDGE_CONFIGS[key].model);
  }
  check("설정 — Sonnet 5.5에 disabled를 보내지 않는다(400)", Object.values(JUDGE_CONFIGS).every((c) => !(c.model.startsWith("claude-sonnet-5-5") && c.thinking.type === "disabled")));
  check("설정 — temperature·top_p를 싣지 않는다(Sonnet 5 계열 400)", Object.keys(JUDGE_CONFIGS).every((k) => {
    const r = buildJudgeRequest(NEED, names, SYSTEM, "", JUDGE_CONFIGS[k]);
    return !("temperature" in r) && !("top_p" in r) && !("top_k" in r);
  }));
  const base = buildJudgeRequest(NEED, names, SYSTEM);
  check("요청 — 기본 설정 인자는 JUDGE_CONFIG", eq(base, buildJudgeRequest(NEED, names, SYSTEM, "", JUDGE_CONFIG)) && base.model === JUDGE_CONFIG.model && eq(base.thinking, JUDGE_CONFIG.thinking));
  check("요청 — 출력을 JSON 스키마로 고정", eq(off.output_config.format, { type: "json_schema", schema: JUDGE_SCHEMA }));
  check("요청 — 지시문에 캐시 표식(모든 호출이 같은 문자열)", off.system[0].cache_control.type === "ephemeral" && off.system[0].text === SYSTEM);
  check("요청 — 도구가 없고 사용자 메시지는 글자 하나", !("tools" in off) && off.messages.length === 1 && typeof off.messages[0].content === "string");
  const c = off.messages[0].content;
  check("요청 — 원문은 번호가 붙고 링크를 걷는다", c.includes("[1] 🚨 Alaba joins Udinese — here we go!") && c.includes("[2] Deal done.") && !/https?:|t\.co\//.test(c), c);
  check("요청 — 기사 본문이 [기사 본문] 줄 뒤에 번호로 이어진다", buildJudgeRequest(NEED, names, SYSTEM, "Alaba signed.").messages[0].content.includes(`[2] Deal done.\n${ARTICLE_MARK}\n[3] Alaba signed.`));
  check("요청 — 행마다 달라지는 것(기준·표기·원문)은 사용자 메시지에만", !SYSTEM.includes("2026-08-20") && c.includes("<기준>") && c.includes("<표기>"));

  const realNow = Date.now;
  Date.now = () => realNow() + 86_400_000 * 400;
  const later = buildJudgeRequest(NEED, names, SYSTEM);
  Date.now = realNow;
  check("요청 — 같은 need면 같은 요청(지금 시각에 기대지 않는다)", eq(later, base));
  check("입력 지문 — 16자 hex, 같은 메시지면 같고 원문이 바뀌면 바뀐다",
    /^[0-9a-f]{16}$/.test(inputFingerprint(off)) && inputFingerprint(off) === inputFingerprint(later)
    && inputFingerprint(off) !== inputFingerprint(buildJudgeRequest({ ...NEED, body: "Other." }, names, SYSTEM)));
  check("입력 지문 — 설정이 달라도 메시지가 같으면 같다", inputFingerprint(off) === inputFingerprint(buildJudgeRequest(NEED, names, SYSTEM, "", JUDGE_CONFIGS["s55-adaptive"])));
}

// ── 지시문 지문 ───────────────────────────────────────────────────────
{
  const fp = judgeFingerprint(SYSTEM);
  check("지시문 지문 — 12자 hex, 같은 지시문이면 같다", /^[0-9a-f]{12}$/.test(fp) && fp === judgeFingerprint(buildSystem()));
  check("지시문 지문 — 지시문이 한 글자만 바뀌어도 바뀐다", fp !== judgeFingerprint(`${SYSTEM} `));
  check("지시문 지문 — 설정(모델·생각·effort)이 바뀌면 바뀐다", new Set(Object.values(JUDGE_CONFIGS).map((c) => judgeFingerprint(SYSTEM, c))).size === Object.keys(JUDGE_CONFIGS).length);
  check("지시문 지문 — 기본 설정은 JUDGE_CONFIG", fp === judgeFingerprint(SYSTEM, JUDGE_CONFIG));

  const FIXTURE = new URL("./fixtures/judge-prompt.sha1", import.meta.url);
  if (process.argv.includes("--update-fingerprint")) {
    writeFileSync(FIXTURE, `${fp}\n`);
    console.log(`지문 파일을 갱신했다: ${fp}`);
  }
  let pinned = null;
  try {
    pinned = readFileSync(FIXTURE, "utf8").trim();
  } catch {
    pinned = null;
  }
  check("지시문 지문 고정 — scripts/fixtures/judge-prompt.sha1과 같다", pinned === fp,
    `고정 ${pinned} ≠ 지금 ${fp}. 지시문·스키마·설정·용어 사전·구단 표를 의도적으로 바꿨다면 `
    + "`node scripts/test-transfer-judge-prompt.mjs --update-fingerprint`로 갱신한다(바뀐 지문은 판정 행의 verdict_prompt와 갈려 --rejudge-stale 대상이 된다)");
}

// ── <기준> ────────────────────────────────────────────────────────────
{
  const W = [
    { key: "s", label: "2026 여름", opensAt: "2026-06-14T23:00:00Z", closesAt: "2026-09-01T22:00:00Z" },
    { key: "w", label: "2027 겨울", opensAt: "2026-12-31T23:00:00Z", closesAt: "2027-02-02T22:59:00Z" },
  ];
  check("기준 — 창 안이면 그 창의 개장·마감(한국 날짜)과 다음 창",
    eq(buildBasis("2026-08-20T10:00:00Z", W), ["보도 날짜: 2026-08-20 (한국 시각)", "이적시장: 2026 여름 창 안 (개장 2026-06-15 · 마감 2026-09-02)", "다음 창: 2027 겨울 (개장 2027-01-01)"]), JSON.stringify(buildBasis("2026-08-20T10:00:00Z", W)));
  check("기준 — 창 사이면 직전 창 마감과 다음 창 개장",
    eq(buildBasis("2026-10-05T00:00:00Z", W), ["보도 날짜: 2026-10-05 (한국 시각)", "이적시장: 창 사이", "직전 창: 2026 여름 (마감 2026-09-02)", "다음 창: 2027 겨울 (개장 2027-01-01)"]));
  check("기준 — 보도 날짜는 한국 시각으로 넘긴다(UTC 15시 → 다음 날)", buildBasis("2026-10-05T15:30:00Z", W)[0] === "보도 날짜: 2026-10-06 (한국 시각)");
  check("기준 — 마지막 창 뒤면 다음 창 일정 없음", buildBasis("2027-03-01T00:00:00Z", W).at(-1) === "다음 창: 일정 없음");
  check("기준 — 게시 시각이 없거나 읽을 수 없으면 null", buildBasis(null, W) === null && buildBasis("not a date", W) === null);
  check("기준 — 운영 창 일정(windows.json)으로도 만든다", Array.isArray(buildBasis("2026-08-20T10:00:00Z")));
  check("기준 — 게시 시각이 없으면 사용자 메시지에 블록을 싣지 않는다",
    !buildJudgeRequest({ ...NEED, published_at: undefined }, names, SYSTEM).messages[0].content.includes("<기준>"));
  check("기준 — 사용자 메시지 맨 앞에 싣는다", buildJudgeRequest(NEED, names, SYSTEM).messages[0].content.startsWith("<기준>\n보도 날짜: 2026-08-20"));
}

// ── 표기 블록 ─────────────────────────────────────────────────────────
check("표기 — 그 보도의 구단 중 표기가 있는 것 + 선수 확정 표기(=)", eq(buildGlossary(NEED, names), ["Real Madrid = 레알 마드리드", "Udinese = 우디네세", "David Alaba = 다비드 알라바"]), JSON.stringify(buildGlossary(NEED, names)));
check("표기 — 확정 표기가 없으면 위키데이터 참고값을 ≈로", eq(buildGlossary({ player: "Cody Gakpo", playerKey: "cody gakpo", clubs: [] }, names), ["Cody Gakpo ≈ 코디 가크포"]));
check("표기 — 참고값 조회가 없는 사전이면 생략", eq(buildGlossary({ player: "Cody Gakpo", playerKey: "cody gakpo", clubs: [] }, { ...names, playerKoReference: undefined }), []));
check("표기 — 선수 키가 없으면 선수 줄 없음", eq(buildGlossary({ player: null, playerKey: null, clubs: ["Udinese"] }, names), ["Udinese = 우디네세"]));

// ── 지시문 ────────────────────────────────────────────────────────────
{
  const table = buildClubTable();
  check("구단 표 — 5대 리그 프리셋과 사람 표기가 지시문에 실린다", SYSTEM.includes("<구단 표>\n") && SYSTEM.includes("Real Madrid = 레알 마드리드") && SYSTEM.includes("Benfica = 벤피카"));
  check("구단 표 — 영문명순(결정적)", eq(table, [...table].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) && eq(table, buildClubTable()));
  check("구단 표 — 표기가 영문과 같은 구단은 싣지 않는다", eq(buildClubTable({ Arsenal: "아스날", Foo: "Foo", Bar: null }), ["Arsenal = 아스날"]));
  check("지시문 — 같은 입력이면 같은 지시문", SYSTEM === buildSystem());
  check("지시문 — 용어 사전이 실린다", buildSystem({ "pre-contract": "사전 계약" }, []).includes("<용어>\npre-contract → 사전 계약\n</용어>"));
  check("지시문 — to는 협상 이상의 상대만, 관심 구단은 하나뿐이어도 suitors", SYSTEM.includes("to: 협상·제안·합의·메디컬·완료 중인 상대 구단만") && SYSTEM.includes("몇 개든(하나뿐이어도) 전부") && SYSTEM.includes("to와 suitors에 같은 구단을 적지 않는다"));
  check("지시문 — 관심만으로 to를 채우는 옛 예시가 없다", !SYSTEM.includes("→ to Bayern") && !SYSTEM.includes("monitoring X but face competition"));
  check("지시문 — 단계마다 영어 단서", ["on the radar", "in talks", "offer submitted", "fee agreed", "personal terms agreed", "medical scheduled", "here we go", "unveiled", "pulled out", "rules out"].every((w) => SYSTEM.includes(w)));
  check("지시문 — 근거는 번호로, 재계약 문장은 이동의 근거가 아니다", SYSTEM.includes("[evidence_ids]") && SYSTEM.includes("재계약·계약 연장 문장은 이동의 근거가 아니다"));
  check("지시문 — 시점은 <기준>의 보도 날짜로", SYSTEM.includes("<기준>의 보도 날짜를 기준으로"));
  check("지시문 — 원문 구조([1] 제목, [기사 본문] 뒤 본문)를 알려 준다", SYSTEM.includes("[1]은 제목") && SYSTEM.includes(`"${ARTICLE_MARK}" 줄이 있으면 그 뒤가 기사 본문`));
  check("지시문 — 요약 길이·금액 표기·구단 음역 금지", SYSTEM.includes("90~140자") && SYSTEM.includes("원문의 기호·단위 그대로") && SYSTEM.includes("음역하지 않는다"));
  check("지시문 — player_ko의 =·≈ 구분", SYSTEM.includes('"="로 적힌 표기는 그대로') && SYSTEM.includes('"≈"로 적힌 표기는 외래어 표기법식 참고값'));
  // 해석의 옛 대조 문구가 기대는 표현 — 바꾸면 J의 테스트도 함께 본다
  check("지시문 — 해석 테스트가 기대는 문구가 남아 있다", ["재계약", "인터뷰", "감독", "돌아보는", "입단 테스트", "in agreement with", "글자 그대로 옮긴다", "to는 null이고 그 구단들을 전부 suitors", "move가 true일 때만", "<선수>가 비어 있으면", "특정할 수 없으면 null"].every((w) => SYSTEM.includes(w)));
}

// ── 용어 사전 ─────────────────────────────────────────────────────────
{
  // 금액 성격 낱말은 화면 라벨(src/entities/transfer/lib/fee.ts의 FEE_KIND_LABEL)과 같아야 한다 — 요약과 금액 칸이 같은 말을 한다.
  // ⚠ bid만 예외다 — 요약 문장에서 "제안이 거절됐다"처럼 행위로 쓰여, 라벨("제안액")을 그대로 쓰면 "제안액이 거절됐다"가 된다
  const feeTs = readFileSync(new URL("../src/entities/transfer/lib/fee.ts", import.meta.url), "utf8");
  const label = (kind) => feeTs.match(new RegExp(`\\b${kind}: "([^"]+)"`))?.[1];
  const terms = loadGlossary().terms;
  check("용어 — 금액 성격이 화면 라벨과 같다", terms.bid === "제안" && terms["asking price"] === label("asking_price") && terms["release clause"] === label("release_clause") && terms.valuation === label("valuation"),
    JSON.stringify({ bid: [terms.bid, label("bid")], asking: [terms["asking price"], label("asking_price")], valuation: [terms.valuation, label("valuation")] }));
  check("용어 — 임대·완전 이적·스왑딜", terms.loan === "임대" && terms["permanent deal / permanent transfer"] === "완전 이적" && terms["swap deal"] === "스왑딜");
}

// ── 예시 ──────────────────────────────────────────────────────────────
{
  const typeOk = (v, s) => {
    if (s.anyOf) return s.anyOf.some((x) => typeOk(v, x));
    if (s.type === "null") return v === null;
    if (s.type === "string") return typeof v === "string" && (!s.enum || s.enum.includes(v));
    if (s.type === "boolean") return typeof v === "boolean";
    if (s.type === "integer") return Number.isInteger(v);
    if (s.type === "number") return typeof v === "number";
    if (s.type === "array") return Array.isArray(v) && v.every((x) => typeOk(x, s.items));
    if (s.type === "object") return v !== null && typeof v === "object" && eq(Object.keys(v), Object.keys(s.properties)) && Object.entries(s.properties).every(([k, x]) => typeOk(v[k], x));
    return false;
  };
  for (const [i, ex] of JUDGE_EXAMPLES.entries()) {
    const o = ex.output;
    const n = (ex.input.match(/^\[\d+\]/gm) ?? []).length;
    check(`예시 ${i + 1} — 키 집합·순서가 스키마와 같다`, eq(Object.keys(o), KEY_ORDER));
    check(`예시 ${i + 1} — 값이 스키마 타입에 맞는다`, typeOk(o, JUDGE_SCHEMA));
    check(`예시 ${i + 1} — 근거 번호가 원문 안이고 1~3개`, o.evidence_ids.length >= 1 && o.evidence_ids.length <= 3 && o.evidence_ids.every((id) => id >= 1 && id <= n));
    check(`예시 ${i + 1} — 이동이면 단계·요약, 아니면 둘 다 null`, o.move ? JUDGE_STAGES.includes(o.stage) && typeof o.summary_ko === "string" : o.stage === null && o.summary_ko === null);
    if (o.summary_ko) {
      const len = [...o.summary_ko].length;
      check(`예시 ${i + 1} — 요약이 90~140자 두 문장`, len >= 90 && len <= 140 && o.summary_ko.split(/(?<=다\.)\s/).length === 2, `${len}자`);
    }
    if (o.fee) check(`예시 ${i + 1} — 금액 표기가 원문에 있다`, ex.input.includes(o.fee.text) && FEE_KINDS.includes(o.fee.kind));
    check(`예시 ${i + 1} — 출력 JSON이 지시문에 그대로 실린다`, SYSTEM.includes(JSON.stringify(o)));
  }
  const kinds = JUDGE_EXAMPLES.map((e) => e.output);
  check("예시 — 유형: 관심 구단 여럿(to null) · 회고(past) · 공식 발표 + 금액 · 재계약",
    kinds.some((o) => o.move && o.to === null && o.suitors.length > 1) && kinds.some((o) => o.timing === "past" && !o.move)
    && kinds.some((o) => o.stage === "official" && o.fee?.kind === "fee") && kinds.some((o) => !o.move && o.timing === "current"));
}

{
  const { decodeEntities, composeText } = await import("./lib/transfer/judge-prompt.mjs");
  check("원문 — HTML 엔티티를 글자로 푼다(구글 뉴스 저장 글의 &nbsp;)", composeText("Inacio in June &nbsp;&nbsp; Football Italia &amp; more &#8217;") === "Inacio in June Football Italia & more ’", composeText("Inacio in June &nbsp;&nbsp; Football Italia &amp; more &#8217;"));
  check("원문 — 모르는 엔티티는 그대로 둔다", decodeEntities("a &foo; b &#0; c") === "a &foo; b &#0; c");
}

console.log(`\n판정 요청 ${pass}/${pass + fail} 통과`);
if (fail) process.exit(1);

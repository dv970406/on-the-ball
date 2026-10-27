/**
 * 구단 엠블럼을 내려받아 **줄여서 `public/crests/{code}.png`에 커밋한다.**
 *
 *   node scripts/fetch-team-crests.mjs --team 494         # 구단 하나(API-Football 팀 id)
 *   node scripts/fetch-team-crests.mjs --team 33 --code man-united
 *   node scripts/fetch-team-crests.mjs --league 140       # 해외 리그 전체(라리가 140 · 분데스리가 78 ·
 *                                                         #   세리에 A 135 · 리그 1 61) — 팀 목록 JSON을 stdout에
 *   node scripts/fetch-team-crests.mjs --league 40        # 5대 리그 밖 리그(아래 EXTRA_LEAGUES) — 파일명을 구단 사전으로 정한다
 *   (--force를 붙이면 이미 있는 파일도 다시 받는다)
 *
 * ⚠ **파일명(code)은 구단 표시 프리셋 `scripts/lib/transfer/club-presets.json`의 `code`와 같아야 한다.**
 *   `--league`는 API 이름을 `slugify`한 값을 쓰고, 프리셋이 그와 다른 코드를 쓰는 구단(프리미어리그는
 *   `man-united`·`brighton-hove`처럼 옛 경기 동기화가 정한 코드다)은 `--team <id> --code <code>`로 받는다.
 *   ⚠ **그래서 프리미어리그를 `--league`로 받지 않는다** — 슬러그가 프리셋과 갈려 같은 구단의 파일이 둘 생긴다.
 * ⚠ **파일명을 바꾸면 프리셋의 `code`도 함께 바꾼다** — 화면(`TransferCrest`)이 `code`로 경로를 만들어,
 *   한쪽만 바꾸면 그 구단이 모노그램으로 떨어진다.
 * ⚠ **이미 있는 파일은 덮지 않는다**(`--force` 제외) — 승격팀만 새로 받으려고 다시 돌리는 것이 보통이다.
 *
 * ⚠ **왜 제공자 CDN을 직접 걸지 않는가.** 원본이 큰 PNG인데 화면에서
 *   그리는 크기는 24·44px이라 8배 가까이 과하다. `?width=`·`?w=` 같은 리사이즈 파라미터를
 *   지원하지 않아(전부 원본을 그대로 준다 — 실측) 줄이려면 사본을 두는 수밖에 없다.
 *   20팀 기준 **1,068KB → 약 85KB(92% 감소)** 가 된다(API-Football 기준 실측).
 *
 * ⚠ **PNG다. AVIF가 아니다.** 같은 조건에서 AVIF가 조금 더 작지만(66% vs 60%) 20팀 기준
 *   14KB 차이뿐이고, 디코드에 실패하는 브라우저에서는 `Crest`의 폴백이 **조용히
 *   모노그램으로** 떨어져 원인을 알 수 없다. 그 위험을 14KB에 사지 않는다.
 *   WebP는 이 그림에서 PNG보다 오히려 크다(45% 감소 — 로고는 색 수가 적어 팔레트가 이긴다).
 *
 * ⚠ **결과물은 저장소에 커밋한다.** 런타임에 늘어나지 않는다는 뜻이라, 승격팀이 생기면
 *   사람이 이 스크립트를 돌려 커밋해야 채워진다 — `scripts/team-names-ko.json`의 한국어
 *   표기와 **똑같은 운영 모델**이고, 그동안 화면은 약칭 모노그램으로 떨어진다(`Crest`).
 *
 * ⚠ **DB에 접근하지 않는다.** 필요한 자격증명은 API-Football 키 하나뿐이다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { flag, loadEnv, slugify } from "./lib/sync-db.mjs";
import { createApiFootball } from "./lib/api-football.mjs";
import { canonicalClubName, isClubName, knownClubNames } from "./lib/transfer/clubs.mjs";
import { clubCode } from "./lib/transfer/club-display.mjs";

const OUT_DIR = "public/crests";

/**
 * 내보내는 한 변의 px.
 *
 * ⚠ **상세 스코어보드(44px)의 DPR 3 필요치(132px)를 덮는 값이다.** 96px로 줄이면 20팀 기준
 *   20KB를 더 아끼지만 고배율 화면에서 상세 엠블럼이 흐려진다 — 그 화면의 주인공이라 안 된다.
 */
const SIZE = 128;

/**
 * 팔레트 양자화 목표 품질.
 *
 * ⚠ **sharp 0.35부터 `colours`(색 수)가 아니라 `quality`가 이 축을 좌우한다.** 0.34에서 쓰던
 *   `colours: 128`은 지금 조용히 무시되어 출력이 3배 커진다(실측: 49.6KB vs 29.2KB).
 *   sharp를 올릴 때 이 옵션 이름이 그대로인지부터 확인한다.
 * ⚠ 128px 자산을 24·44px로 그리므로 40에서도 눈에 보이는 손실이 없다. `dither`는 이 버전에서
 *   출력에 영향을 주지 않았다(1.0·0.5·0이 모두 같은 크기 — 실측).
 */
const PALETTE_QUALITY = 40;

// ── 인자 ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const seasonArg = flag(argv, "season");
const teamArg = flag(argv, "team");
const codeArg = flag(argv, "code");
const leagueArg = flag(argv, "league");
const force = argv.includes("--force");

/** 해외 리그 — 이적 소식 프리셋(club-presets.json)이 한국어 표기를 갖는 리그만 받는다 */
const FOREIGN_LEAGUES = new Map([[140, "라리가"], [78, "분데스리가"], [135, "세리에 A"], [61, "리그 1"]]);

/**
 * **5대 리그 밖**에서 엠블럼을 받는 리그 — 이적설에 자주 나오는 리그를 리그 단위로 통째로 받는다(구단마다 "유명한가"를 사람이
 * 판단하면 기준이 흔들린다). 프리셋(5대 리그 — 리그 필터·응원 구단의 대상)과 달리 **엠블럼만** 생긴다.
 * 이적 창마다 승강이 바뀌므로 창이 바뀔 때 다시 돌린다(이미 있는 파일은 덮지 않는다 — 새로 올라온 구단만 받는다).
 *
 * ⚠ **파일명은 API 이름이 아니라 딜 파생이 만드는 구단 코드다** — 프리셋 밖 구단의 코드는 `slugify(구단 사전의 정규 영문명)`이다
 *   (`derive-deals.mjs`의 `clubRecord`). API는 "West Ham"이라 부르고 사전의 정규명은 "West Ham United"라, API 이름으로 지으면
 *   화면이 찾는 `west-ham-united.png`가 생기지 않는다. 그래서 API 이름을 사전의 **별칭 통째 일치**(`canonicalClubName`)로 정규화한다.
 *   ⚠ 부분 일치(`detectClubs`)로 넓히지 않는다 — "Sporting Braga"가 "Sporting"(스포르팅 CP)으로 잡혀 남의 엠블럼이 된다.
 *   사전에 없는 이름은 API 이름 그대로 짓고 `unmatched`로 남긴다 — 위키데이터로 확인된 구단은 원문 표기가 코드라(같은 함수)
 *   맞을 수도 있고 아닐 수도 있다. 화면에 모노그램으로 남는 구단이 보이면 사전에 별칭을 더하거나 `--team <id> --code <code>`로 받는다.
 */
const EXTRA_LEAGUES = new Map([
  [40, "챔피언십(잉글랜드 2부)"],
  [94, "프리메이라 리가(포르투갈)"],
  [88, "에레디비시(네덜란드)"],
  [203, "쉬페르 리그(튀르키예)"],
  [179, "프리미어십(스코틀랜드)"],
  [144, "프로 리그(벨기에)"],
  [307, "프로 리그(사우디아라비아)"],
  [253, "MLS(미국)"],
  [71, "세리이 A(브라질)"],
]);

/**
 * 사전 밖 구단의 **표기 변형** — 사전에 없는 구단의 코드는 기사에 적힌 표기 그대로(`slugify(원문 표기)`)라, API의 공식 이름
 * ("Al-Hilal Saudi FC")과 기사의 표기("Al-Hilal")가 다르면 그림이 생겨도 화면이 찾지 못한다. 그래서 같은 그림을 흔한 표기의
 * 코드로도 저장한다(한 장 약 5KB — 모노그램으로 떨어지는 것보다 싸다).
 * - 이름의 법인 접두·접미(`FC`·`SC`·`KV`·`S.K.`·`FK` · 사우디 구단의 `Saudi FC`·`Jeddah` · 벨기에의 `KVC`·`KV`·`SK`)를 걷은 표기.
 * - 아래 표 — 기사에서 다른 철자·약칭으로 쓰는 구단. 키는 API 이름 그대로다(실행 결과의 `name`).
 * ⚠ **구단 사전(`clubs.mjs`)에 더하는 것으로 대신하지 않는다** — 사전은 추출·판정 지시문(구단 표)에 쓰여 바꾸면 추출 결과와
 *   판정 지문이 함께 바뀐다(재추출·재판정). 엠블럼은 화면만의 일이라 파일 이름으로 메운다.
 * ⚠ 같은 구단이 우리 데이터에 여러 코드로 있을 수 있다(기사마다 철자가 달랐다 — `al-ettifaq`·`al-ittifaq`). 표가 그 둘을 다 덮는다.
 */
const CREST_CODE_ALIASES = {
  "Al-Ettifaq": ["al-ittifaq"],
  "Al-Qadisiyah FC": ["al-qadsiah", "al-qadisiyah"],
  "Al-Ittihad FC": ["al-ittihad", "al-ittihad-jeddah"],
  "Al-Ahli Jeddah": ["al-ahli", "al-ahli-saudi"],
  "Al-Hilal Saudi FC": ["al-hilal"],
  "Atletico Paranaense": ["athletico-paranaense"],
  "Atletico-MG": ["atletico-mineiro"],
  "Sao Paulo": ["sao-paulo-fc"],
  "Vasco DA Gama": ["vasco"],
  "Heart Of Midlothian": ["hearts"],
  "Union St. Gilloise": ["union-saint-gilloise", "union-sg"],
  "St. Truiden": ["sint-truiden"],
  "Standard Liege": ["standard-liege", "standard"],
  "AZ Alkmaar": ["az"],
  "PEC Zwolle": ["zwolle"],
  "Vitória SC": ["vitoria-guimaraes", "vitoria-de-guimaraes"],
  "Başakşehir": ["istanbul-basaksehir"],
  "Kasımpaşa": ["kasimpasa"],
  "Los Angeles Galaxy": ["la-galaxy"],
  "Los Angeles FC": ["lafc"],
  "New York City FC": ["new-york-city", "nycfc"],
};

/** 접미를 걷으면 다른 구단과 겹치는 이름 — "Los Angeles FC"를 걷은 "Los Angeles"는 LA 갤럭시로도 읽힌다 */
const AMBIGUOUS_CODES = new Set(["los-angeles"]);

/** API 이름의 법인 접두·접미를 걷은 표기 — 걷을 것이 없으면 `null` */
function strippedName(apiName) {
  const s = apiName
    .replace(/\s+(?:Saudi FC|FC|SC|KV|S\.K\.|FK|Jeddah|Saihat)$/u, "")
    .replace(/^(?:KVC|KV|SK|OH|RAAL)\s+/u, "")
    .trim();
  return s && s !== apiName ? s : null;
}

/**
 * 5대 리그 밖 리그의 파일명 — 딜 파생과 같은 규칙(`clubCode(정규명) ?? slugify(정규명)`). 사전에서 찾았는지도 돌려준다.
 * - 사전의 별칭과 통째로 같으면 그 정규명이다.
 * - 아니면 API가 줄여 쓴 이름("Derby"·"Sheffield Utd")을 풀어 본다 — `Utd`를 `United`로 바꾼 이름으로 **시작하는** 정규명이
 *   사전에 **하나뿐일 때만** 그것으로 본다("Derby" → "Derby County"). 둘 이상이면 짐작하지 않는다.
 */
function extraLeagueCode(apiName) {
  let canonical = canonicalClubName(apiName);
  let matched = isClubName(apiName);
  if (!matched) {
    const expanded = apiName.replace(/\bUtd\b/g, "United");
    const hits = knownClubNames().filter((n) => n === expanded || n.startsWith(`${expanded} `));
    if (hits.length === 1) {
      canonical = hits[0];
      matched = true;
    }
  }
  const code = clubCode(canonical) ?? slugify(canonical);
  // 사전에서 찾은 구단은 파생이 정규명으로 모으므로 접미를 걷은 변형을 만들지 않는다 — 표의 철자 변형만 더한다
  // (사전에 오르기 전 위키데이터로 쓰인 옛 코드가 남아 있다 — `al-ittifaq`)
  const stripped = matched ? null : strippedName(apiName);
  const strippedCode = stripped ? slugify(stripped) : null;
  const aliases = [
    ...new Set([...(strippedCode && !AMBIGUOUS_CODES.has(strippedCode) ? [strippedCode] : []), ...(CREST_CODE_ALIASES[apiName] ?? [])]),
  ].filter((c) => c && c !== code && CODE_RE.test(c));
  return { code, matched, aliases };
}

/*
 * ⚠ **모드가 섞인 인자는 거부한다.** 조용히 한쪽만 실행하면 의도와 다른 파일이 생기고 API 한도를 쓴다
 *   (`--team 541 --league 140`처럼 둘을 함께 주면 어느 쪽이 도는지 알 수 없다).
 */
function usage(message) {
  console.error(message);
  process.exit(1);
}
const modes = ["--team", "--league"].filter((m) => argv.includes(m));
if (modes.length === 0) usage("--team <id> 또는 --league <id>가 필요합니다");
if (modes.length > 1) usage(`${modes.join(" · ")}는 함께 쓸 수 없습니다`);
if (argv.includes("--code") && !argv.includes("--team")) usage("--code는 --team과 함께만 씁니다");
if (argv.includes("--code") && !codeArg) usage("--code 뒤에 파일명이 필요합니다");
if (argv.includes("--team") && argv.includes("--season")) usage("--team은 시즌을 받지 않습니다");

// ── 환경 ───────────────────────────────────────────────────────────────
const env = loadEnv(["API_FOOTBALL_KEY"]);

/**
 * 원본 엠블럼 → 128px 팔레트 PNG.
 *
 * ⚠ **`fit: "contain"` + 투명 배경.** 엠블럼은 정사각형이 아닌 것이 섞여 있어
 *   `cover`로 두면 방패 위아래가 잘린다. 남는 자리는 투명으로 둔다 —
 *   카드 배경이 흰색·회색으로 갈리므로 색을 칠하면 한쪽에서 네모가 보인다.
 */
async function toCrestPng(source) {
  // ⚠ 타임아웃이 없으면 로고 요청 하나가 멈췄을 때 스크립트가 끝나지 않는다
  const res = await fetch(source, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const output = await sharp(input)
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: PALETTE_QUALITY, compressionLevel: 9, effort: 10 })
    .toBuffer();
  return { input, output };
}

/** ⚠ **https만 받는다.** 우리가 fetch하는 주소다 — 스킴이 열려 있으면 응답 하나로 임의 호스트를 때린다. */
function httpsLogo(v) {
  return typeof v === "string" && /^https:\/\/\S+$/.test(v.trim()) ? v.trim() : null;
}

/** 파일명으로 쓸 수 있는 코드 — 소문자로 시작, 하이픈은 글자 사이에만 */
const CODE_RE = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9]))*$/;

/**
 * stdout을 다 내보낸 뒤 끝낸다 — `process.exit`는 파이프에 남은 출력을 버린다(큰 JSON이 64KB에서 잘렸다).
 * ⚠ 반드시 `await`한다 — 기다리지 않으면 쓰기가 끝나기 전에 아래 코드가 이어서 실행된다.
 */
async function finish(code, out) {
  if (out !== undefined) await new Promise((resolve) => process.stdout.write(`${out}\n`, resolve));
  process.exit(code);
}

// ── 단일 구단(`--team`) ─────────────────────────────────────────────────
if (argv.includes("--team")) {
  if (!teamArg || !/^[1-9]\d*$/.test(teamArg)) usage("--team 뒤에 API-Football 팀 id(숫자)가 필요합니다");
  let t;
  try {
    const body = await createApiFootball(env.API_FOOTBALL_KEY).get(`/teams?id=${teamArg}`);
    t = Array.isArray(body?.response) ? body.response.filter(Boolean)[0]?.team : null;
  } catch (e) {
    usage(`✗ ${e.message}`);
  }
  const logo = httpsLogo(t?.logo);
  if (!t || !logo) usage(`✗ 팀 ${teamArg}의 엠블럼을 찾지 못했습니다`);
  const code = codeArg ?? slugify(t.name);
  if (!code || !CODE_RE.test(code)) usage(`✗ 파일명으로 쓸 수 없는 코드입니다: ${code}`);
  if (existsSync(`${OUT_DIR}/${code}.png`) && !force) {
    usage(`✗ ${OUT_DIR}/${code}.png가 이미 있습니다 — 다시 받으려면 --force를 붙이세요`);
  }
  try {
    const { input, output } = await toCrestPng(logo);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}/${code}.png`, output);
    console.log(`✓ ${t.name} → ${OUT_DIR}/${code}.png (${(input.length / 1024).toFixed(1)}KB → ${(output.length / 1024).toFixed(1)}KB)`);
  } catch (e) {
    usage(`✗ 내려받기 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  await finish(0);
}

// ── 리그 전체(`--league`) ──────────────────────────────────────────────
/*
 * stdout에는 팀 목록 JSON만 나간다(경고는 stderr) — 프리셋을 고칠 때 파이프로 받는다.
 *   { league, season, saved: [{code, apiId, name}], kept: [...], skipped: [{name, reason}] }
 * ⚠ 이미 있는 파일은 `kept`로 남기고 덮지 않는다 — 승격팀만 새로 받으려고 다시 돌리는 것이 보통이다.
 */
if (argv.includes("--league")) {
  const leagueId = Number(leagueArg);
  const extra = EXTRA_LEAGUES.has(leagueId);
  if (!FOREIGN_LEAGUES.has(leagueId) && !extra) {
    const all = [...FOREIGN_LEAGUES, ...EXTRA_LEAGUES];
    usage(`--league는 ${all.map(([id, name]) => `${name} ${id}`).join(" · ")} 중 하나입니다`);
  }
  const leagueName = FOREIGN_LEAGUES.get(leagueId) ?? EXTRA_LEAGUES.get(leagueId);
  const season = Number(seasonArg ?? (new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1));
  let list;
  try {
    const body = await createApiFootball(env.API_FOOTBALL_KEY).get(`/teams?league=${leagueId}&season=${season}`);
    list = Array.isArray(body?.response) ? body.response.filter(Boolean).map((x) => x.team).filter(Boolean) : [];
  } catch (e) {
    usage(`✗ ${e.message}`);
  }
  if (list.length === 0) usage(`✗ ${leagueName} ${season} 시즌 팀을 찾지 못했습니다`);
  mkdirSync(OUT_DIR, { recursive: true });
  const result = { league: leagueName, season, saved: [], kept: [], skipped: [], unmatched: [] };
  const claimed = new Set(); // ⚠ 한 실행 안에서 같은 코드가 두 번 나오면 뒤의 것이 앞의 것을 조용히 덮는다
  let bad = 0;
  for (const t of list) {
    const named = extra ? extraLeagueCode(t.name) : { code: slugify(t.name), matched: true, aliases: [] };
    const code = named.code;
    if (!named.matched) result.unmatched.push({ code, apiId: t.id, name: t.name });
    const logo = httpsLogo(t.logo);
    const skip = (reason) => {
      result.skipped.push({ name: t.name, apiId: t.id, reason });
      console.warn(`⚠ 건너뜀: ${t.name} — ${reason}`);
    };
    if (!code || !CODE_RE.test(code)) { skip("파일명으로 쓸 수 없는 이름"); continue; }
    if (!logo) { skip("엠블럼 주소 없음"); continue; }
    if (claimed.has(code)) { skip(`${code}가 이 리그에서 이미 쓰였다`); continue; }
    claimed.add(code);
    // 표기 변형(5대 리그 밖 리그만) — 이 리그의 다른 구단이 이미 쓴 코드는 건너뛴다
    const aliases = named.aliases.filter((c) => !claimed.has(c) && (force || !existsSync(`${OUT_DIR}/${c}.png`)));
    for (const c of aliases) claimed.add(c);
    const entry = { code, apiId: t.id, name: t.name, ...(aliases.length ? { aliases } : {}) };
    const primaryExists = existsSync(`${OUT_DIR}/${code}.png`) && !force;
    if (primaryExists && aliases.length === 0) {
      result.kept.push(entry);
      continue;
    }
    try {
      // 본 파일이 이미 있으면 그 그림을 변형 이름으로 옮겨 적는다(다시 받지 않는다)
      const output = primaryExists ? readFileSync(`${OUT_DIR}/${code}.png`) : (await toCrestPng(logo)).output;
      if (!primaryExists) writeFileSync(`${OUT_DIR}/${code}.png`, output);
      for (const c of aliases) writeFileSync(`${OUT_DIR}/${c}.png`, output);
      (primaryExists ? result.kept : result.saved).push(entry);
    } catch (e) {
      bad++;
      console.error(`✗ ${t.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await finish(bad ? 1 : 0, JSON.stringify(result));
}

/**
 * 구단 엠블럼을 내려받아 **줄여서 `public/crests/{team.code}.png`에 커밋한다.**
 *
 *   node scripts/fetch-team-crests.mjs                    # API에서 (API_FOOTBALL_KEY 필요)
 *   node scripts/fetch-team-crests.mjs --fixture <파일>   # 키 없이 저장된 JSON으로
 *   node scripts/fetch-team-crests.mjs --season 2026
 *   node scripts/fetch-team-crests.mjs --league 140       # 해외 리그 전체(라리가 140 · 분데스리가 78 ·
 *                                                         #   세리에 A 135 · 리그 1 61) — 팀 목록 JSON을 stdout에
 *   node scripts/fetch-team-crests.mjs --team 494         # 해외 구단 하나(API-Football 팀 id)
 *   node scripts/fetch-team-crests.mjs --team 541 --code real-madrid
 *   (--league·--team에 --force를 붙이면 이미 있는 파일도 다시 받는다)
 *
 * ⚠ **`--league`·`--team`은 `team` 테이블에 없는 구단용이다**(이적 소식의 해외 구단 — 표시 프리셋은
 *   `scripts/lib/transfer/club-presets.json`). 파일명은 API 이름을 `slugify`한 값이고 그 프리셋의
 *   `code`와 같아야 한다. ⚠ **파일명은 영구 계약이다** — 이적설 글 본문에 `/crests/{code}.png`가
 *   박혀 있어, 이름을 바꾸거나 지우면 이미 쓴 글의 엠블럼이 깨진다.
 * ⚠ **이미 있는 파일은 덮지 않는다**(`--force` 제외). 로컬 DB의 `team`이 일부뿐이면 코드 소유
 *   검사만으로는 커밋된 EPL 엠블럼을 지킬 수 없어서다(QA에서 재현 — `--team 66`이 aston-villa.png를 덮었다).
 *
 * ⚠ **왜 제공자 CDN을 직접 걸지 않는가.** 원본이 큰 PNG인데 화면에서
 *   그리는 크기는 24·44px이라 8배 가까이 과하다. `?width=`·`?w=` 같은 리사이즈 파라미터를
 *   지원하지 않아(전부 원본을 그대로 준다 — 실측) 줄이려면 사본을 두는 수밖에 없다.
 *   20팀 기준 **1,068KB → 약 85KB(92% 감소)** 가 된다(API-Football 기준 실측).
 *
 * ⚠ **PNG다. AVIF가 아니다.** 같은 조건에서 AVIF가 조금 더 작지만(66% vs 60%) 20팀 기준
 *   14KB 차이뿐이고, 디코드에 실패하는 브라우저에서는 `TeamCrest`의 폴백이 **조용히
 *   모노그램으로** 떨어져 원인을 알 수 없다. 그 위험을 14KB에 사지 않는다.
 *   WebP는 이 그림에서 PNG보다 오히려 크다(45% 감소 — 로고는 색 수가 적어 팔레트가 이긴다).
 *
 * ⚠ **결과물은 저장소에 커밋한다.** 런타임에 늘어나지 않는다는 뜻이라, 승격팀이 생기면
 *   사람이 이 스크립트를 돌려 커밋해야 채워진다 — `scripts/team-names-ko.json`의 한국어
 *   표기와 **똑같은 운영 모델**이고, 그동안 화면은 약칭 모노그램으로 떨어진다(`TeamCrest`).
 *   그래서 아래에서 빠진 팀을 경고로 남긴다.
 *
 * ⚠ **EPL(인자 없는 기본 모드)은 팀 코드를 DB가 소유한다.** 여기서 슬러그를 다시 만들지 않는다 — `sync-matches.mjs`와
 *   규칙이 갈리는 순간 파일명이 `team.code`와 어긋나 모든 엠블럼이 404가 된다.
 *   그래서 API의 팀 id(`external_id`)로 DB 행을 찾아 그 `code`를 파일명으로 쓴다.
 *   → **`sync-matches.mjs`를 먼저 돌려야 한다.**
 *
 * ⚠ **service_role이 필요 없다.** `team`은 공개 읽기라 anon 키로 충분하다 — 이 스크립트는
 *   DB에 아무것도 쓰지 않는다(`sync-matches.mjs`·`upload-survey-images.mjs`와 다른 점).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { flag, loadEnv, slugify } from "./lib/sync-db.mjs";
import { EPL_LEAGUE_ID, createApiFootball } from "./lib/api-football.mjs";

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
const fixturePath = flag(argv, "fixture");
const seasonArg = flag(argv, "season");
const teamArg = flag(argv, "team");
const codeArg = flag(argv, "code");
const leagueArg = flag(argv, "league");
const force = argv.includes("--force");

/** 해외 리그 — 이적 소식 프리셋(club-presets.json)이 한국어 표기를 갖는 리그만 받는다 */
const FOREIGN_LEAGUES = new Map([[140, "라리가"], [78, "분데스리가"], [135, "세리에 A"], [61, "리그 1"]]);

/*
 * ⚠ **모드가 섞인 인자는 거부한다.** 조용히 한쪽만 실행하면 의도와 다른 파일이 생기고 API 한도를 쓴다
 *   (`--team 541 --fixture x.json`이 fixture를 무시하고 API를 불렀다 — QA).
 */
function usage(message) {
  console.error(message);
  process.exit(1);
}
const modes = ["--team", "--league", "--fixture"].filter((m) => argv.includes(m));
if (modes.length > 1) usage(`${modes.join(" · ")}는 함께 쓸 수 없습니다`);
if (argv.includes("--code") && !argv.includes("--team")) usage("--code는 --team과 함께만 씁니다");
if (argv.includes("--code") && !codeArg) usage("--code 뒤에 파일명이 필요합니다");
if (force && modes[0] !== "--team" && modes[0] !== "--league") usage("--force는 --team·--league에만 씁니다");
if (argv.includes("--team") && argv.includes("--season")) usage("--team은 시즌을 받지 않습니다");

// ── 환경 ───────────────────────────────────────────────────────────────
/*
 * ⚠ **service_role이 아니라 anon 키다.** `team`은 공개 읽기라 충분하고, 이 스크립트는
 *   DB에 아무것도 쓰지 않는다 — 쓰기 자격증명을 들고 다닐 이유가 없다.
 */
const env = loadEnv(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "API_FOOTBALL_KEY"]);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY가 필요합니다");
  process.exit(1);
}

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
 * ⚠ 반드시 `await`한다 — 기다리지 않으면 쓰기가 끝나기 전에 아래의 EPL 기본 모드가 이어서 실행된다.
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
  // ⚠ 기존 팀 코드와 겹치면 그 팀의 엠블럼을 덮는다 — 같은 제공자 팀일 때만 허용한다
  const { data: clash, error: clashErr } = await createClient(url, key)
    .from("team").select("code, external_id").eq("code", code).maybeSingle();
  if (clashErr) usage(`✗ team 조회 실패: ${clashErr.message}`);
  if (clash && String(clash.external_id) !== String(t.id)) {
    usage(`✗ ${code}는 이미 다른 팀(external_id ${clash.external_id})의 코드입니다 — --code로 다른 이름을 주세요`);
  }
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
  if (!FOREIGN_LEAGUES.has(leagueId)) {
    usage(`--league는 ${[...FOREIGN_LEAGUES].map(([id, name]) => `${name} ${id}`).join(" · ")} 중 하나입니다`);
  }
  const season = Number(seasonArg ?? (new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1));
  let list;
  try {
    const body = await createApiFootball(env.API_FOOTBALL_KEY).get(`/teams?league=${leagueId}&season=${season}`);
    list = Array.isArray(body?.response) ? body.response.filter(Boolean).map((x) => x.team).filter(Boolean) : [];
  } catch (e) {
    usage(`✗ ${e.message}`);
  }
  if (list.length === 0) usage(`✗ ${FOREIGN_LEAGUES.get(leagueId)} ${season} 시즌 팀을 찾지 못했습니다`);
  const { data: dbTeams, error: dbErr } = await createClient(url, key).from("team").select("code, external_id");
  if (dbErr) usage(`✗ team 조회 실패: ${dbErr.message}`);
  const owner = new Map((dbTeams ?? []).map((t) => [t.code, String(t.external_id)]));
  mkdirSync(OUT_DIR, { recursive: true });
  const result = { league: FOREIGN_LEAGUES.get(leagueId), season, saved: [], kept: [], skipped: [] };
  const claimed = new Set(); // ⚠ 한 실행 안에서 같은 코드가 두 번 나오면 뒤의 것이 앞의 것을 조용히 덮는다
  let bad = 0;
  for (const t of list) {
    const code = slugify(t.name);
    const logo = httpsLogo(t.logo);
    const skip = (reason) => {
      result.skipped.push({ name: t.name, apiId: t.id, reason });
      console.warn(`⚠ 건너뜀: ${t.name} — ${reason}`);
    };
    if (!code || !CODE_RE.test(code)) { skip("파일명으로 쓸 수 없는 이름"); continue; }
    if (!logo) { skip("엠블럼 주소 없음"); continue; }
    if (claimed.has(code)) { skip(`${code}가 이 리그에서 이미 쓰였다`); continue; }
    if (owner.has(code) && owner.get(code) !== String(t.id)) { skip(`${code}는 다른 팀의 코드다`); continue; }
    claimed.add(code);
    const entry = { code, apiId: t.id, name: t.name };
    if (existsSync(`${OUT_DIR}/${code}.png`) && !force) {
      result.kept.push(entry);
      continue;
    }
    try {
      const { output } = await toCrestPng(logo);
      writeFileSync(`${OUT_DIR}/${code}.png`, output);
      result.saved.push(entry);
    } catch (e) {
      bad++;
      console.error(`✗ ${t.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await finish(bad ? 1 : 0, JSON.stringify(result));
}

// ── 수집 ───────────────────────────────────────────────────────────────
/*
 * ⚠ **경기가 아니라 팀 엔드포인트를 쓴다.** 예전 제공자는 경기 응답의 팀에 엠블럼 URL을
 *   실어 줬지만 API-Football은 팀 목록에만 담는다 — 대신 **요청이 하나로 끝나고**
 *   경기가 아직 없는 시즌에도 받을 수 있다.
 */
const season = Number(seasonArg ?? (new Date().getUTCMonth() >= 6
  ? new Date().getUTCFullYear()
  : new Date().getUTCFullYear() - 1));

let apiTeams;
if (fixturePath) {
  const parsed = JSON.parse(readFileSync(fixturePath, "utf8"));
  apiTeams = Array.isArray(parsed?.response) ? parsed.response.map((x) => x.team) : null;
} else {
  const api = createApiFootball(env.API_FOOTBALL_KEY);
  try {
    const body = await api.get(`/teams?league=${EPL_LEAGUE_ID}&season=${season}`);
    apiTeams = Array.isArray(body?.response) ? body.response.map((x) => x.team) : null;
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}

// ⚠ `sync-matches.mjs`와 같은 방어 — `{}`나 문자열이 오면 아래가 죽는다.
if (!apiTeams || apiTeams.length === 0) {
  console.error("팀 배열을 찾지 못했습니다 — 응답 형태나 시즌을 확인하세요");
  process.exit(1);
}

/** API 팀 id → 엠블럼 원본 URL */
const crestByApiId = new Map();
for (const t of apiTeams) {
  if (!t?.id || crestByApiId.has(t.id)) continue;
  const logo = httpsLogo(t.logo);
  if (logo) crestByApiId.set(t.id, logo);
}

// ── 팀 코드 (DB가 소유한다) ────────────────────────────────────────────
const supabase = createClient(url, key);
const { data: teams, error } = await supabase.from("team").select("code, external_id");
if (error) {
  console.error(`✗ team 조회 실패: ${error.message}`);
  process.exit(1);
}
if (!teams || teams.length === 0) {
  console.error("team이 비어 있습니다 — scripts/sync-matches.mjs를 먼저 돌리세요");
  process.exit(1);
}

// ── 변환 ───────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });

const saved = [];
const missing = []; // DB에는 있는데 API가 엠블럼을 주지 않은 팀
const failed = [];
let originalBytes = 0;
let outputBytes = 0;

for (const team of teams) {
  const source = team.external_id === null ? undefined : crestByApiId.get(Number(team.external_id));
  if (!source) {
    missing.push(team.code);
    continue;
  }

  try {
    const { input, output } = await toCrestPng(source);
    writeFileSync(`${OUT_DIR}/${team.code}.png`, output);
    originalBytes += input.length;
    outputBytes += output.length;
    saved.push(team.code);
  } catch (e) {
    // ⚠ 한 팀의 실패가 나머지를 막지 않는다 — 부분 성공이 전량 실패보다 낫다.
    failed.push(`${team.code} (${e instanceof Error ? e.message : String(e)})`);
  }
}

// ── 보고 ───────────────────────────────────────────────────────────────
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
console.log(`✓ 엠블럼 ${saved.length}개 → ${OUT_DIR}/`);
if (saved.length > 0) {
  console.log(
    `  ${kb(originalBytes)} → ${kb(outputBytes)} (${(100 - (outputBytes / originalBytes) * 100).toFixed(0)}% 감소, ${SIZE}px 팔레트 PNG)`,
  );
}

// ⚠ **경고로 남긴다 — 실패시키지 않는다.** 승격팀이 생겨도 나머지는 갱신돼야 하고,
//   빠진 팀은 화면에서 모노그램으로 떨어질 뿐이다(`team-names-ko.json`과 같은 규약).
if (missing.length > 0) {
  console.warn(`⚠ 엠블럼을 찾지 못한 팀 ${missing.length}개: ${missing.join(", ")}`);
  console.warn("  (API 응답에 crest가 없거나 이 시즌 경기에 등장하지 않는 팀입니다)");
}
if (failed.length > 0) {
  console.error(`✗ 내려받기 실패 ${failed.length}개: ${failed.join(", ")}`);
  process.exitCode = 1; // ⚠ 크론이 초록으로 지나가면 안 된다
}

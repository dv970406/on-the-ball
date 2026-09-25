/**
 * 구단 엠블럼을 내려받아 **줄여서 `public/crests/{code}.png`에 커밋한다.**
 *
 *   node scripts/fetch-team-crests.mjs --team 494         # 구단 하나(API-Football 팀 id)
 *   node scripts/fetch-team-crests.mjs --team 33 --code man-united
 *   node scripts/fetch-team-crests.mjs --league 140       # 해외 리그 전체(라리가 140 · 분데스리가 78 ·
 *                                                         #   세리에 A 135 · 리그 1 61) — 팀 목록 JSON을 stdout에
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
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { flag, loadEnv, slugify } from "./lib/sync-db.mjs";
import { createApiFootball } from "./lib/api-football.mjs";

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

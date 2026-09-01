/**
 * 구단 엠블럼을 내려받아 **줄여서 `public/crests/{team.code}.png`에 커밋한다.**
 *
 *   node scripts/fetch-team-crests.mjs                    # API에서 (API_FOOTBALL_KEY 필요)
 *   node scripts/fetch-team-crests.mjs --fixture <파일>   # 키 없이 저장된 JSON으로
 *   node scripts/fetch-team-crests.mjs --season 2026
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
 * ⚠ **팀 코드는 DB가 소유한다.** 여기서 슬러그를 다시 만들지 않는다 — `sync-matches.mjs`와
 *   규칙이 갈리는 순간 파일명이 `team.code`와 어긋나 모든 엠블럼이 404가 된다.
 *   그래서 API의 팀 id(`external_id`)로 DB 행을 찾아 그 `code`를 파일명으로 쓴다.
 *   → **`sync-matches.mjs`를 먼저 돌려야 한다.**
 *
 * ⚠ **service_role이 필요 없다.** `team`은 공개 읽기라 anon 키로 충분하다 — 이 스크립트는
 *   DB에 아무것도 쓰지 않는다(`sync-matches.mjs`·`upload-survey-images.mjs`와 다른 점).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { flag, loadEnv } from "./lib/sync-db.mjs";
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
  // ⚠ **https만 받는다.** 이 자리는 우리가 fetch하는 주소다 — 스킴이 열려 있으면
  //   저장된 값 하나로 임의 호스트를 때리게 된다.
  if (typeof t.logo === "string" && /^https:\/\/\S+$/.test(t.logo.trim())) {
    crestByApiId.set(t.id, t.logo.trim());
  }
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
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const input = Buffer.from(await res.arrayBuffer());

    /*
     * ⚠ **`fit: "contain"` + 투명 배경.** 엠블럼은 정사각형이 아닌 것이 섞여 있어
     *   `cover`로 두면 방패 위아래가 잘린다. 남는 자리는 투명으로 둔다 —
     *   카드 배경이 흰색·회색으로 갈리므로 색을 칠하면 한쪽에서 네모가 보인다.
     */
    const output = await sharp(input)
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ palette: true, quality: PALETTE_QUALITY, compressionLevel: 9, effort: 10 })
      .toBuffer();

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

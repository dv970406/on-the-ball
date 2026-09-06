/**
 * EPL 일정·결과를 `team`·`match`에 동기화한다. **제공자는 API-Football이다.**
 *
 *   node scripts/sync-matches.mjs                    # 이번 시즌
 *   node scripts/sync-matches.mjs --season 2026
 *   node scripts/sync-matches.mjs --fixture <파일>   # API 대신 저장된 JSON으로
 *   node scripts/sync-matches.mjs --remote           # 원격 프로젝트에 쓴다 (명시적일 때만)
 *
 * ⚠ **실제 동기화 로직은 `scripts/lib/sync-matches-core.mjs`가 갖는다.** 어드민 화면의
 *   '경기 일정 가져오기'(`app/api/admin/sync-matches`)가 같은 함수를 부르기 때문이다 —
 *   여기 남는 것은 **CLI에만 있는 것**뿐이다: 인자 파싱 · env 로드 · 원격 쓰기 가드 ·
 *   매핑 파일 읽기 · 종료 코드.
 *
 * ⚠ **라인업·사건·스탯은 여기서 하지 않는다** — 주기가 다르다(여기는 하루 한두 번,
 *   저쪽은 킥오프 직전·종료 직후 5분 간격) → `scripts/sync-match-detail.mjs`.
 *
 * ⚠ **멱등해야 한다.** 결과 반영을 위해 주기적으로 다시 돌리는 것이 전제라, 두 번 돌려서
 *   행이 늘면 그 순간 이 스크립트는 쓸 수 없게 된다 → 모든 쓰기가 `external_id`를 충돌 키로 삼는다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createSyncClient, flag, guardTarget, loadEnv } from "./lib/sync-db.mjs";
import { EPL_LEAGUE_ID, createApiFootball } from "./lib/api-football.mjs";
import { syncSeason } from "./lib/sync-matches-core.mjs";

const NAMES_KO = "scripts/team-names-ko.json";
const PROVIDER_IDS = "scripts/team-provider-ids.json";

// ── 인자 ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const allowRemote = argv.includes("--remote");
const fixturePath = flag(argv, "fixture");
const seasonArg = flag(argv, "season");
const dumpPath = flag(argv, "dump");

const env = loadEnv(["API_FOOTBALL_KEY"]);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다");
  process.exit(1);
}
/*
 * ⚠ **이 가드는 CLI에만 있다.** 주어가 "사람이 로컬 터미널에서 실수로 프로덕션을 덮는 것"이라
 *   배포된 Route Handler에는 해당하지 않는다(정의상 자기 프로젝트에 쓴다). 거기서 부르면
 *   URL이 언제나 원격이라 무조건 죽는다 — 그래서 코어가 아니라 여기 남는다.
 */
guardTarget(url, allowRemote);

// ── 수집 ───────────────────────────────────────────────────────────────
// ⚠ 시즌은 **시작 연도**다(2026-27 → 2026). 8월 이전에 돌리면 지난 시즌이 맞다.
const now = new Date();
const season = Number(
  seasonArg ?? (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1),
);

let apiFixtures;
let apiTeamList = [];
if (fixturePath) {
  const parsed = JSON.parse(readFileSync(fixturePath, "utf8"));
  apiFixtures = Array.isArray(parsed?.response) ? parsed.response : null;
} else {
  let api;
  try {
    api = createApiFootball(env.API_FOOTBALL_KEY);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
  let body;
  try {
    body = await api.getSeasonFixtures(season);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
  apiFixtures = Array.isArray(body?.response) ? body.response : null;
  if (dumpPath) writeFileSync(dumpPath, JSON.stringify(body, null, 2));

  /*
   * ⚠ **약칭을 얻으려면 팀 엔드포인트가 따로 필요하다.** 경기 응답의 팀에는 `{id, name, logo}`
   *   뿐이라 `team.short_name`(예측 버튼 라벨 "맨유 승")을 만들 수 없다.
   * ⚠ 실패해도 계속 간다 — 한국어 매핑이 있으면 약칭이 거기서 나오므로 화면은 멀쩡하다.
   */
  try {
    const t = await api.get(`/teams?league=${EPL_LEAGUE_ID}&season=${season}`);
    apiTeamList = Array.isArray(t?.response) ? t.response.map((x) => x.team) : [];
  } catch (e) {
    console.warn(`⚠ 팀 목록을 받지 못했습니다(${e.message}) — 약칭이 이름에서 유도됩니다`);
  }
  const b = api.budget;
  console.log(`API ${api.used}회 사용 — 오늘 ${b.dayRemaining}/${b.dayLimit} 남음`);
}

// ── 매핑 파일 ──────────────────────────────────────────────────────────
// ⚠ **파일 읽기는 CLI에만 있다.** 서버리스에서는 cwd가 다르고 동적 경로라 번들에 포함되지도
//   않는다 → 핸들러는 정적 import로 같은 JSON을 넘긴다.
function readJsonObject(path, label) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    // ⚠ **객체인지까지 본다.** `JSON.parse("null")`은 **성공**하므로 try/catch가 잡지 못한다.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.warn(`⚠ ${path}를 읽지 못했습니다 — ${label}`);
    return {};
  }
}
const namesKo = readJsonObject(NAMES_KO, "팀 이름이 영문으로 들어갑니다");
const providerIds = readJsonObject(PROVIDER_IDS, "제공자 전환 매핑 없이 진행합니다");

// ── 동기화 ─────────────────────────────────────────────────────────────
const supabase = createSyncClient(url, key);
let result;
try {
  result = await syncSeason({
    supabase,
    fixtures: apiFixtures,
    teamList: apiTeamList,
    namesKo,
    providerIds,
    // CLI는 사람이 지켜보므로 행 단위 폴백에 상한을 두지 않는다(핸들러는 둔다)
  });
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}

if (result.hadFailure || result.matches.aborted) process.exitCode = 1;
console.log(`\n대상: ${url}`);

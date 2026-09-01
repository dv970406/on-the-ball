/**
 * EPL 일정·결과를 `team`·`match`에 동기화한다. **제공자는 API-Football이다.**
 *
 *   node scripts/sync-matches.mjs                    # 이번 시즌
 *   node scripts/sync-matches.mjs --season 2026
 *   node scripts/sync-matches.mjs --fixture <파일>   # API 대신 저장된 JSON으로
 *   node scripts/sync-matches.mjs --remote           # 원격 프로젝트에 쓴다 (명시적일 때만)
 *
 * ⚠ **라인업·사건·스탯은 여기서 하지 않는다** — 주기가 다르다(여기는 하루 한두 번,
 *   저쪽은 킥오프 전후 3분 간격) → `scripts/sync-match-detail.mjs`.
 *
 * ⚠ **`team`·`match`에는 정책도 grant도 없다.** 앱에는 쓰기 경로가 아예 없고 유일한 writer가
 *   여기다 → 이 기능이 늘리는 사용자 쓰기 표면은 `match_prediction` 하나뿐이다.
 *
 * ⚠ **멱등해야 한다.** 결과 반영을 위해 주기적으로 다시 돌리는 것이 전제라, 두 번 돌려서
 *   행이 늘면 그 순간 이 스크립트는 쓸 수 없게 된다 → 모든 쓰기가 `external_id`를 충돌 키로 삼는다.
 *
 * ⚠ **팀 코드는 한 번 정해지면 바뀌지 않는다.** `code`가 PK이고 `match`가 그걸 참조하며
 *   `public/crests/{code}.png`와 `team-names-ko.json`이 그 값을 키로 쓴다 → 팀을
 *   **① external_id ② team-provider-ids.json ③ 기존 코드와 같은 슬러그** 순으로 찾고,
 *   **셋 다 실패할 때만** 새 슬러그를 만든다. 이 순서를 뒤집으면 이름이 바뀐 팀이 매번 새
 *   행으로 쌓이고 과거 경기의 FK가 옛 팀을 가리킨 채 남는다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  clampCp,
  createSyncClient,
  flag,
  guardTarget,
  isoOrNull,
  loadEnv,
  slugify,
  str,
  upsertRows,
  validScore,
} from "./lib/sync-db.mjs";
import {
  EPL_LEAGUE_ID,
  createApiFootball,
  matchState,
  parseMatchday,
  seasonLabel,
} from "./lib/api-football.mjs";

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
guardTarget(url, allowRemote);

// ── 수집 ───────────────────────────────────────────────────────────────
// ⚠ 시즌은 **시작 연도**다(2026-27 → 2026). 8월 이전에 돌리면 지난 시즌이 맞다.
const now = new Date();
const season = Number(seasonArg ?? (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1));

let apiFixtures;
let apiTeamList = [];
if (fixturePath) {
  const parsed = JSON.parse(readFileSync(fixturePath, "utf8"));
  apiFixtures = Array.isArray(parsed?.response) ? parsed.response : null;
} else {
  const api = createApiFootball(env.API_FOOTBALL_KEY);
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
   *   뿐이라 `team.short_name`(예측 버튼 라벨 "맨유 승")을 만들 수 없다 — football-data가
   *   `tla`·`shortName`을 함께 주던 것과 다른 지점이다. 요청 하나를 더 쓰지만 하루 한두 번이다.
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

// ⚠ **배열인지까지 본다.** `?? []` + `length === 0`은 `{}`(length undefined)와 문자열을
//   통과시켜, 잘못된 payload가 **팀 upsert를 커밋한 뒤** 죽는다(부분 적용이 남는다).
if (!apiFixtures || apiFixtures.length === 0) {
  console.error("경기 배열을 찾지 못했습니다 — 응답 형태나 시즌을 확인하세요");
  process.exit(1);
}

// ── 매핑 파일 ──────────────────────────────────────────────────────────
function readJsonObject(path, label) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    // ⚠ **객체인지까지 본다.** `JSON.parse("null")`은 **성공**하므로 try/catch가 잡지 못하고
    //   `Object.hasOwn(null, …)`에서 죽는다 — 죽는 지점만 옮겼던 자리다.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.warn(`⚠ ${path}를 읽지 못했습니다 — ${label}`);
    return {};
  }
}
const namesKo = readJsonObject(NAMES_KO, "팀 이름이 영문으로 들어갑니다");
const providerIds = readJsonObject(PROVIDER_IDS, "제공자 전환 매핑 없이 진행합니다");
/** API 팀 id → 우리가 미리 정해 둔 code (전환용 역방향 색인) */
const codeByProviderId = new Map(
  Object.entries(providerIds)
    .filter(([k, v]) => k !== "_comment" && Number.isInteger(v))
    .map(([code, id]) => [String(id), code]),
);

// ── 기존 팀 ────────────────────────────────────────────────────────────
const supabase = createSyncClient(url, key);
const { data: existing, error: readErr } = await supabase.from("team").select("code, external_id");
if (readErr) {
  console.error("✗ 기존 팀 조회 실패:", readErr.message);
  process.exit(1);
}
const takenCodes = new Set(existing.map((t) => t.code));
const byExternal = new Map(existing.filter((t) => t.external_id).map((t) => [t.external_id, t.code]));

// ── 변환: 팀 ───────────────────────────────────────────────────────────
const apiTeams = new Map();
for (const t of apiTeamList) if (t?.id) apiTeams.set(t.id, t);
// 경기에 등장하는 팀도 모은다 — 팀 목록 요청이 실패했어도 일정은 살아야 한다.
for (const f of apiFixtures) {
  if (!f || typeof f !== "object") continue;
  for (const t of [f.teams?.home, f.teams?.away]) {
    if (t?.id && !apiTeams.has(t.id)) apiTeams.set(t.id, t);
  }
}

const unmapped = [];
const unusable = [];
const badScores = [];
const adopted = [];
const teamCode = new Map(); // API team id → 우리 code
const newTeamCodes = new Set();
const teamRows = [];

/*
 * ⚠⚠ **이번 실행에서 이미 가져간 code** — 두 API 팀이 같은 code로 해석되는 것을 막는다.
 *
 *   그런 일이 실제로 났다. **두 제공자의 id 공간이 겹치기 때문**이다(football-data의
 *   리버풀=64 · API-Football의 헐 시티=64, 아스날=57 · 입스위치=57 — 실측). 전환 도중에는
 *   DB에 옛 제공자의 id가 남아 있어서, `external_id`로 찾으면 **헐 시티가 리버풀의 code를
 *   집어가고** 진짜 리버풀은 매핑으로 같은 code를 받는다 → 배치에 같은 키가 둘이 되어
 *   `ON CONFLICT DO UPDATE command cannot affect row a second time`로 **팀 저장이 통째로 죽는다.**
 */
const claimedCodes = new Map(); // code → API team id

for (const [id, t] of apiTeams) {
  const external = String(id);
  const base = slugify(t.name, t.code);

  /*
   * ⚠ **매핑을 external_id보다 먼저 본다.** 사람이 검토해 적은 값이라 더 믿을 수 있고,
   *   무엇보다 전환 중의 `external_id`는 **옛 제공자의 것이라 남의 팀을 가리킨다**(위 주석).
   *   매핑에 없는 팀은 그 다음 단계로 내려가므로 손해가 없다.
   */
  let code = null;
  const mapped = codeByProviderId.get(external);
  if (mapped) {
    /*
     * ⚠ **그 code가 DB에 이미 있는지 묻지 않는다.** 한때 물었더니, 시드에 6팀만 있는
     *   상태에서 매핑 20건 중 14건이 무시되고 **낡은 external_id가 이겼다** — 애스턴
     *   빌라가 맨유의 code를 집어가는 그 경로다. 매핑의 목적은 "이 code를 쓰라"이지
     *   "이미 있으면 재사용하라"가 아니다.
     */
    code = mapped;
    adopted.push(`${mapped} ← ${external} (${t.name})`);
  }
  // ② 이미 이 제공자 id로 저장된 팀 — 정상 운영 상태에서는 여기서 끝난다
  if (!code) code = byExternal.get(external) ?? null;
  // ③ 이름에서 나온 슬러그가 기존 코드와 같다면 그 팀이다
  if (!code && base && takenCodes.has(base)) code = base;

  /*
   * ⚠ 위 셋 중 하나로 정해졌더라도 **이미 남이 가져간 code면 무효다.** 옛 제공자의
   *   `external_id`가 엉뚱한 팀을 가리킨 결과일 수 있으므로 새 슬러그로 떨어뜨린다 —
   *   조용히 덮어쓰면 그 code의 팀이 다른 구단으로 바뀌고 과거 경기가 통째로 거짓이 된다.
   */
  if (code && claimedCodes.has(code)) {
    console.warn(
      `⚠ code "${code}"를 API 팀 ${claimedCodes.get(code)}가 이미 가져갔습니다 — ` +
        `${external}(${t.name})는 새 코드로 만듭니다(제공자 전환 중의 id 충돌)`,
    );
    code = null;
  }

  // ④ 진짜 새 팀 — 슬러그를 만든다(충돌하면 접미어)
  if (!code) {
    if (!base) {
      unusable.push(`id=${id} (코드를 만들 수 없다)`);
      continue;
    }
    code = base;
    for (let i = 2; takenCodes.has(code) || claimedCodes.has(code); i++) code = `${base}-${i}`;
    takenCodes.add(code);
    newTeamCodes.add(code);
  }
  claimedCodes.set(code, external);

  /**
   * ⚠ **한국어 표기를 여기서 입힌다.** `team.name`이 화면에 그대로 나가는 값이라 규약상
   *   저장값이 한국어여야 하고, **이 스크립트가 그 컬럼의 유일한 writer**라 매핑이 다른 곳에
   *   있으면 다음 동기화가 통째로 덮어쓴다.
   * ⚠ **항목의 모양까지 본다.** `??`는 nullish만 보므로 `short: 12345`가 통과해
   *   `.slice is not a function`으로 전체가 죽었다(실측).
   * ⚠ `Object.hasOwn`으로 읽는다 — 팀 코드가 `constructor`면 프로토타입 값이 잡혀
   *   이름이 `"Object"`로 저장됐다(실측).
   */
  const ko =
    Object.hasOwn(namesKo, code) && namesKo[code] && typeof namesKo[code] === "object"
      ? namesKo[code]
      : null;
  const koName = str(ko?.name);
  const koShort = str(ko?.short);
  const apiName = str(t.name);
  const name = koName ?? apiName;

  /*
   * ⚠ **기존 팀은 이름을 못 골라도 버리지 않는다.** DB에 멀쩡한 행이 이미 있으므로 갱신만
   *   건너뛰면 되는데, 신규 팀용 정책(팀을 버린다)을 그대로 적용했더니 **그 팀의 경기가
   *   전부 사라졌다**(실측).
   */
  if (!name) {
    if (!newTeamCodes.has(code)) teamCode.set(id, code);
    else unusable.push(`id=${id} (쓸 이름이 없다)`);
    continue;
  }

  // ⚠ 매핑 **항목은 있는데 name이 없는 경우**도 경고 대상이다 — `!ko`만 보면 부분 매핑이
  //   영문으로 저장되면서 "이 팀은 매핑돼 있다"고 말하는 침묵이 된다.
  if (!koName) unmapped.push(`${code} (${name})`);

  // 약칭은 예측 버튼 라벨("맨유 승")에 쓴다. 매핑이 없으면 API의 3글자 코드 → 이름 순.
  const short = koShort ?? str(t.code) ?? name;
  teamCode.set(id, code);
  teamRows.push({
    code,
    name: clampCp(name, 100),
    short_name: clampCp(short, 10),
    external_id: external,
  });
}

/*
 * ⚠ **제공자 전환에는 external_id를 먼저 비워야 한다.** 두 제공자의 id 공간이 겹쳐서
 *   (football-data의 맨유=66 · API-Football의 애스턴 빌라=66 — 실측) 한 줄씩 갱신하면
 *   도중에 `team_external_id_key`가 터진다. 옮겨 붙일 값이 이미 남의 자리에 있는 셈이다.
 * ⚠ 그래서 **이번 실행이 채울 code들의 external_id를 미리 null로 만든다.** nullable이라
 *   가능한 조치이고, 실패해도 그 다음 upsert가 어차피 거부되므로 손실이 없다.
 */
const incomingByExternal = new Map(teamRows.map((r) => [r.external_id, r.code]));
/*
 * 이번에 쓰려는 `external_id`를 **다른 code가 이미 들고 있는** 행만 비운다.
 * ⚠ 전량을 비우지 않는다 — 실패해도 손실이 없는 조치이긴 하지만, 중간에 죽으면 멀쩡한
 *   매핑까지 잃어 다음 실행이 슬러그 경로로 떨어진다(새 팀 행이 쌓이는 방향이다).
 */
const stale = existing
  .filter((t) => t.external_id !== null)
  .filter((t) => incomingByExternal.has(t.external_id))
  .filter((t) => incomingByExternal.get(t.external_id) !== t.code)
  .map((t) => t.code);
if (stale.length > 0) {
  console.log(`  낡은 external_id를 비웁니다 ${stale.length}건: ${stale.join(", ")}`);
  const { error } = await supabase
    .from("team")
    .update({ external_id: null })
    .in("code", stale);
  if (error) console.warn(`⚠ external_id 초기화 실패(${error.message}) — 충돌하면 그 팀만 빠집니다`);
}

const teamResult = await upsertRows(supabase, "team", teamRows, { onConflict: "code" });
for (const f of teamResult.failed) {
  /*
   * ⚠ **기존 팀이면 경기를 버리지 않는다.** "FK로 어차피 거부된다"는 근거는 **신규 팀에만**
   *   성립한다 — 기존 팀은 행이 이미 있어 FK를 만족하고, 실패한 것은 *갱신*뿐이다.
   */
  if (newTeamCodes.has(f.row.code)) {
    console.error(`✗ 팀 ${f.row.code} 저장 실패: ${f.message} — 새 팀이라 이 팀의 경기도 함께 빠집니다`);
    for (const [apiId, code] of teamCode) if (code === f.row.code) teamCode.delete(apiId);
  } else {
    console.error(`✗ 팀 ${f.row.code} 갱신 실패: ${f.message} — 기존 행을 두고 경기는 계속합니다`);
  }
  process.exitCode = 1; // ⚠ 크론이 초록으로 지나가면 안 된다
}
if (teamResult.aborted) {
  console.error("✗ 팀 저장이 계통적으로 실패해 중단합니다 — 경기는 시도하지 않습니다.");
  process.exit(1);
}
console.log(`✓ 팀 ${teamResult.saved.length}개`);
if (adopted.length > 0) {
  console.log(`  제공자 전환으로 code를 보존한 팀 ${adopted.length}개 (crests·한국어 표기가 유지됩니다)`);
}

// ── 변환: 경기 ─────────────────────────────────────────────────────────
function toRow(f) {
  const label = seasonLabel(Number(f.league?.season));
  // ⚠ 저장 형태를 여기서 직접 대조한다 — DB 정규식 `^[0-9]{4}-[0-9]{2}$`.
  if (!label) return null;

  const matchday = parseMatchday(f.league?.round);
  if (matchday === null) return null; // 컵 형식 등 — CHECK(1~38) 밖이라 정상적인 제외다

  /*
   * ⚠ **타입까지 좁힌다.** `undefined`·`null`만 막았더니 `[]`→`""`, `true`→`"true"`가
   *   **경고 없이 저장됐다**(실측). 그 행은 실제 경기와 영영 매칭되지 않아 채점도 안 된다.
   * ⚠ 큰 정수는 double로 접혀 서로 다른 경기가 같은 id가 된다 → 안전 정수만 받는다.
   */
  const id = f.fixture?.id;
  if (!(typeof id === "number" && Number.isSafeInteger(id))) return null;

  const homeId = f.teams?.home?.id;
  const awayId = f.teams?.away?.id;
  if (!homeId || !awayId || homeId === awayId) return null; // DB CHECK(home <> away)

  // ⚠ **문자열만 받는다** — `date: 0`이 `1970-01-01`로 조용히 저장됐다(실측).
  //   범위 검증은 `isoOrNull`이 갖는다(Postgres가 거부하는 연도를 미리 거른다).
  const kickoff = typeof f.fixture?.date === "string" ? isoOrNull(f.fixture.date) : null;
  if (!kickoff) return null;

  const state = matchState(f.fixture?.status?.short, f.fixture?.status?.elapsed);
  if (!state) return null; // 모르는 상태 코드 — 잘못 접느니 건너뛴다

  const home = f.goals?.home ?? null;
  const away = f.goals?.away ?? null;
  // ⚠ 값의 형태까지 본다 — 음수·소수·smallint 초과가 전부 배치 전체를 날렸다(실측)
  const hasScore = state.kind === "finished" && validScore(home) && validScore(away);
  // ⚠ **종료됐는데 스코어를 못 읽으면 알린다.** 조용히 넘기면 그 경기는 **영영 채점되지
  //   않은 채** 목록에만 남아 적중률이 이유 없이 빈다.
  if (state.kind === "finished" && !hasScore) {
    badScores.push(`${id} (${f.fixture?.status?.short}, ${home}-${away})`);
  }

  return {
    external_id: String(id),
    season: label,
    matchday,
    home_team: teamCode.get(homeId),
    away_team: teamCode.get(awayId),
    kickoff_at: kickoff,
    home_score: hasScore ? home : null,
    away_score: hasScore ? away : null,
    /*
     * ⚠ **시계를 읽지 않는다.** `new Date()`로 폴백하면 실행할 때마다 값이 달라져 멱등성이
     *   깨진다(실측). 제공자가 종료 시각을 주지 않으므로 킥오프로 접는다 — `finished_at`은
     *   스코어와 짝을 이루는 플래그로만 쓰이고 화면이 읽지 않는다.
     */
    finished_at: hasScore ? kickoff : null,
    voided_at: state.kind === "voided" ? kickoff : null,
    live_minute: state.liveMinute,
  };
}

/*
 * ⚠ **중복 `external_id`를 DB에 손대기 전에 잡는다.** 행 단위 폴백이 있으면 둘 다 성공하고
 *   **뒤가 이기는** 형태로 조용히 삼켜진다.
 * ⚠ **실제로 실릴 후보에 대해서만 센다.** 전체 응답을 훑으면 정상적으로 제외되는 행(컵 형식)의
 *   중복이 **멀쩡한 경기까지 전량 거부**시킨다(실측).
 */
const wellFormed = apiFixtures.filter((f) => f && typeof f === "object");
const candidates = wellFormed.filter((f) => parseMatchday(f.league?.round) !== null);
// ⚠ **정상적인 제외도 센다.** 컵 형식(`"Final"`)은 `matchday` CHECK(1~38) 밖이라 버리는 게
//   맞지만, 침묵하면 일정이 비어 있는 것을 아무도 눈치채지 못한다 — 아래 "온전하지 않아
//   건너뛴" 경고와 **성격이 달라** 따로 알린다(그쪽은 데이터 결함이다).
if (candidates.length < wellFormed.length) {
  console.log(`  라운드 밖이라 제외한 경기 ${wellFormed.length - candidates.length}건 (컵 형식 등)`);
}
const seen = new Set();
const dupes = [];
for (const f of candidates) {
  const id = f.fixture?.id;
  if (!(typeof id === "number" && Number.isSafeInteger(id))) continue;
  const k = String(id);
  if (seen.has(k)) dupes.push(k);
  else seen.add(k);
}
if (dupes.length > 0) {
  console.error(`✗ 응답에 중복된 경기 id ${dupes.length}건: ${dupes.join(", ")}`);
  process.exit(1);
}

const matchRows = candidates
  .map(toRow)
  // ⚠ `toRow`가 null을 돌려준 것과 팀 매핑이 비어 있는 것을 함께 걷어낸다
  .filter((r) => r !== null && r.home_team && r.away_team);

// ⚠ **조용히 버리지 않는다.** 몇 건이 왜 빠졌는지 로그에 없으면 일정이 비어 있는 것을
//   아무도 눈치채지 못한다.
if (matchRows.length < candidates.length) {
  console.warn(`⚠ 데이터가 온전하지 않아 건너뛴 경기 ${candidates.length - matchRows.length}건`);
}
if (badScores.length > 0) {
  console.warn(`⚠ 종료됐지만 스코어를 읽지 못한 경기 ${badScores.length}건 (채점되지 않는다):`);
  for (const line of badScores.slice(0, 10)) console.warn(`   ${line}`);
}

const matchResult = await upsertRows(supabase, "match", matchRows, { onConflict: "external_id" });
if (matchResult.failed.length > 0) {
  console.error(`✗ 저장하지 못한 경기 ${matchResult.failed.length}건:`);
  for (const f of matchResult.failed.slice(0, 10)) console.error(`   ${f.row.external_id}: ${f.message}`);
  process.exitCode = 1;
}
// ⚠ **시도조차 안 한 행을 따로 보고한다.** 중단된 행이 `failed`에도 없으면 **무엇을 잃었는지
//   로그에 아무 흔적이 없다.**
if (matchResult.aborted) {
  console.error(`✗ 시도하지 못한 경기 ${matchResult.skipped.length}건`);
  process.exitCode = 1;
}

const scored = matchResult.saved.filter((r) => r.home_score !== null).length;
const voided = matchResult.saved.filter((r) => r.voided_at !== null).length;
const live = matchResult.saved.filter((r) => r.live_minute !== null).length;
console.log(
  `✓ 경기 ${matchResult.saved.length}개 (결과 있음 ${scored} · 진행 중 ${live} · 무효 ${voided})` +
    (matchResult.aborted ? " — 중단됨" : ""),
);

if (unusable.length > 0) {
  console.warn(`\n⚠ 데이터가 없어 건너뛴 팀 ${unusable.length}개 — 이 팀의 경기도 함께 빠집니다:`);
  for (const line of unusable) console.warn(`   ${line}`);
}
// ⚠ **두 경고를 섞지 않는다.** 한 목록에 담으면 "영문 이름이 화면에 나갑니다"가 버려진 팀에
//   대해 거짓이 되고(DB에 행이 없다), 안내한 조치도 효과가 없다(키가 될 code가 없다).
if (unmapped.length > 0) {
  console.warn(`\n⚠ 한국어 표기가 없는 팀 ${unmapped.length}개 — ${NAMES_KO}에 추가하세요:`);
  for (const line of unmapped) console.warn(`   ${line}`);
  console.warn("  (그때까지 영문 이름이 화면에 그대로 나갑니다)\n");
}
console.log(`\n대상: ${url}`);

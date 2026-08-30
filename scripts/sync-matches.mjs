/**
 * EPL 일정·결과를 `team`·`match`에 동기화한다.
 *
 *   node scripts/sync-matches.mjs                    # 이번 시즌
 *   node scripts/sync-matches.mjs --season 2025
 *   node scripts/sync-matches.mjs --fixture <파일>   # API 대신 저장된 JSON으로 (오프라인·로컬 시드)
 *   node scripts/sync-matches.mjs --remote           # 원격 프로젝트에 쓴다 (명시적일 때만)
 *
 * ⚠ **`team`·`match`에는 정책도 grant도 없다.** 입축구 문항과 같은 취급이라 앱에는 쓰기
 *   경로가 아예 없고, 유일한 writer가 여기다(`upload-survey-images.mjs`와 같은 형태).
 *   덕분에 이 기능이 늘리는 사용자 쓰기 표면은 `match_prediction` 하나뿐이다.
 *
 * ⚠ **멱등해야 한다.** 결과 반영을 위해 주기적으로(킥오프 +2시간쯤) 다시 돌리는 것이 전제라,
 *   두 번 돌려서 행이 늘면 그 순간 이 스크립트는 쓸 수 없게 된다 → 모든 쓰기가
 *   `external_id`를 충돌 키로 삼는다.
 *
 * ⚠ **팀 코드는 한 번 정해지면 바뀌지 않는다.** `code`가 PK이고 `match`가 그걸 참조하므로,
 *   API가 표시 이름을 바꿔도(구단명 변경) 기존 행의 code는 그대로 둔다 — 그래서 팀을
 *   `external_id`로 먼저 찾고, **없을 때만** 슬러그를 새로 만든다. 이 순서를 뒤집으면
 *   이름이 바뀐 팀이 매번 새 행으로 쌓이고 과거 경기의 FK가 옛 팀을 가리킨 채 남는다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const COMPETITION = "PL"; // football-data.org의 EPL 코드
const NAMES_KO = "scripts/team-names-ko.json";
const API = "https://api.football-data.org/v4";

// ── 인자 ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return null;
  const next = argv[i + 1];
  // ⚠ 값이 없거나 다음 플래그면 null이다 — `true`를 돌려주면 `readFileSync(true)`로 죽고
  //   `--fixture --remote`는 `"--remote"`를 파일명으로 읽는다(실측).
  return next && !next.startsWith("--") ? next : null;
};
const allowRemote = argv.includes("--remote");
const fixturePath = flag("fixture");
const seasonArg = flag("season");
const dumpPath = flag("dump"); // 받은 응답을 파일로 남긴다 — fixture를 만들 때 쓴다

// ── 환경 ───────────────────────────────────────────────────────────────
// ⚠ **process.env를 먼저 본다.** 크론·CI에서는 `.env.local`이 없고 시크릿이 환경으로 온다.
//   로컬에서만 파일로 폴백한다.
function loadEnv() {
  const fromProcess = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    token: process.env.FOOTBALL_DATA_TOKEN,
  };
  if (fromProcess.url && fromProcess.key) return fromProcess;

  let file;
  try {
    file = readFileSync(".env.local", "utf8");
  } catch {
    return fromProcess;
  }
  const parsed = Object.fromEntries(
    file
      .split("\n")
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
  return {
    url: fromProcess.url ?? parsed.NEXT_PUBLIC_SUPABASE_URL,
    key: fromProcess.key ?? parsed.SUPABASE_SERVICE_ROLE_KEY,
    token: fromProcess.token ?? parsed.FOOTBALL_DATA_TOKEN,
  };
}

const { url, key, token } = loadEnv();
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다");
  process.exit(1);
}

// ⚠ **원격 쓰기는 명시적으로만.** `.env.local`에는 원격 프로젝트의 자격증명이 함께 들어 있어
//   URL 한 줄만 바뀌어도 확인 프롬프트 없이 프로덕션을 덮어쓴다. `upload-survey-images.mjs`가
//   로컬만 허용하는 것과 같은 사정인데, 이 스크립트는 **원격 정기 실행이 본래 용도**라
//   금지가 아니라 플래그로 연다.
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
if (!isLocal && !allowRemote) {
  console.error(`원격으로 보입니다 — ${url}`);
  console.error("의도한 것이라면 --remote 를 붙이세요.");
  process.exit(1);
}

// ── 수집 ───────────────────────────────────────────────────────────────
async function fetchJson(path) {
  if (!token) {
    console.error("FOOTBALL_DATA_TOKEN이 필요합니다 (또는 --fixture 로 저장된 JSON을 쓰세요)");
    process.exit(1);
  }
  const res = await fetch(`${API}${path}`, { headers: { "X-Auth-Token": token } });
  if (!res.ok) {
    console.error(`✗ ${path} — ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

/**
 * ⚠ **fixture 모드가 있는 이유**: 토큰 없이도 쓰기 경로 전체를 돌려볼 수 있어야 한다.
 *   로컬 개발 시드도 이 경로로 만든다 — `db reset` 뒤에 경기가 0건이면 화면을 볼 수 없다.
 */
const payload = fixturePath
  ? JSON.parse(readFileSync(fixturePath, "utf8"))
  : await fetchJson(
      `/competitions/${COMPETITION}/matches${seasonArg ? `?season=${seasonArg}` : ""}`,
    );

if (dumpPath) {
  writeFileSync(dumpPath, JSON.stringify(payload, null, 2));
  console.log(`응답을 ${dumpPath}에 저장했습니다`);
}

// ⚠ **배열인지까지 본다.** `?? []` + `length === 0`은 `{}`(length undefined)와 문자열을
//   통과시켜, `{"matches":"abc"}`가 **팀 upsert를 커밋한 뒤** `filter is not a function`으로
//   죽었다(실측 — 부분 적용이 남는다).
const apiMatches = Array.isArray(payload?.matches) ? payload.matches : null;
if (!apiMatches || apiMatches.length === 0) {
  console.error("경기 배열을 찾지 못했습니다 — 응답 형태나 시즌을 확인하세요");
  process.exit(1);
}

// ── 변환 ───────────────────────────────────────────────────────────────
/**
 * '2025-08-15' + '2026-05-24' → '2025-26' (DB CHECK `^[0-9]{4}-[0-9]{2}$`가 이 형식을 강제한다)
 *
 * ⚠ **날짜가 빠지면 `null`을 돌려주고 그 경기를 버린다.** 예전에는 그대로 조립해
 *   `"2025-N"`(=`String(NaN).slice(2)`)이 나왔는데, `upsert`가 배열을 통째로 보내므로
 *   **경기 한 건의 결함이 그 실행의 모든 경기를 CHECK 위반으로 날렸다**(실측).
 *   한 건을 건너뛰는 편이 전량을 잃는 것보다 낫고, 아래에서 건너뛴 수를 보고한다.
 */
function seasonLabel(season) {
  const start = new Date(season?.startDate ?? "").getUTCFullYear();
  const end = new Date(season?.endDate ?? "").getUTCFullYear();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return `${start}-${String(end).slice(2)}`;
}

/**
 * 'Man United' → 'man-united'. `team.code`의 CHECK(`^[a-z][a-z0-9-]*$`)를 만족해야 한다.
 *
 * ⚠ **문자열이 아닐 수 있다.** 이름이 없거나(`{id: 9901}`) null·숫자면 `.normalize`에서
 *   `TypeError`로 **동기화 전체가 죽었다**(실측 3종). 결함은 그 팀만 버려야 한다 → null 반환.
 * ⚠ **ASCII가 하나도 안 남으면 tla로 폴백한다.** 비라틴 이름은 슬러그가 빈 문자열이 되어
 *   `t-`·`t--2` 같은 코드가 만들어졌는데(실측), `code`는 **한 번 정해지면 바뀌지 않는 PK**라
 *   마이그레이션 없이 되돌릴 수 없다.
 */
function slugify(...candidates) {
  let numericStart = null;
  for (const raw of candidates) {
    if (typeof raw !== "string" || raw.length === 0) continue;
    const slug = raw
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 38); // 충돌 접미어(`-2`)를 붙여도 CHECK(40자)를 넘지 않게 남겨 둔다
    if (/^[a-z]/.test(slug)) return slug;
    if (slug.length > 0) numericStart ??= slug;
  }
  // ⚠ 숫자로 시작하는 이름("1899 Hoffenheim")은 CHECK(`^[a-z]`)를 통과하지 못한다.
  //   버리면 그 팀의 **경기까지 통째로 사라지므로** 접두어를 붙여 살린다 — 내용이 남아
  //   있어 읽을 수 있다(`t-1899-hoffenheim`). 슬러그가 아예 비었을 때만 포기한다.
  return numericStart ? `t-${numericStart}`.slice(0, 38) : null;
}

/**
 * API status → 우리 컬럼.
 *
 * ⚠ **POSTPONED는 무효가 아니다.** 나중에 새 날짜로 다시 열리므로 경기 자체는 살아 있다.
 *   그동안은 `kickoff_at`이 과거라 `match_is_open`이 false이고 `result`도 null이라,
 *   아무도 예측할 수 없고 채점도 되지 않는 상태로 조용히 대기한다 — 우리가 원하는 동작이다.
 * ⚠ **모든 값을 매번 명시한다(null 포함).** 취소가 번복되거나 오심이 정정될 때
 *   옛 값이 남으면 `result`가 거짓이 된다 — 동기화는 API를 정답으로 삼는다.
 */
/** 스코어로 쓸 수 있는 값인가 — 음이 아닌 정수이고 축구에서 나올 수 있는 범위(≤999) */
function validScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 999;
}

/** 파싱되는 시각이면 ISO 문자열로, 아니면 null — 호출부가 폴백을 고른다 */
function isoOrNull(v) {
  const d = new Date(v ?? "");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toRow(m, teamCode) {
  /*
   * ⚠ **여기서 거른 만큼만 안전하다.** 예전에는 `homeTeam` 하나만 봐서 `utcDate: null`·
   *   음수 스코어·`home==away`·3자리 연도가 전부 전량 손실로 이어졌다(실측 7종).
   *   왜 한 건이 전체를 날리는지와 마지막 그물은 `upsertRows` 주석이 갖는다.
   */
  const season = seasonLabel(m.season);
  // ⚠ `Number.isFinite`만으로는 부족하다 — `0205-08-15`가 파싱은 되지만 DB 정규식
  //   `^[0-9]{4}-[0-9]{2}$`에 걸린다. 저장 형태를 여기서 직접 대조한다.
  if (!season || !/^[0-9]{4}-[0-9]{2}$/.test(season)) return null;

  /*
   * ⚠ **타입까지 좁힌다.** `undefined`·`null`만 막았더니 `[]`→`""`, `true`→`"true"`,
   *   `{}`→`"[object Object]"`가 **경고 없이 저장됐다**(실측, exit 0에 성공 로그까지).
   *   그 행은 실제 경기와 영영 매칭되지 않아 채점도 되지 않는다.
   * ⚠ 큰 정수는 double로 접혀 서로 다른 경기가 같은 id가 된다 → 안전 정수만 받는다.
   */
  const idOk =
    (typeof m.id === "number" && Number.isSafeInteger(m.id)) ||
    (typeof m.id === "string" && m.id.trim().length > 0);
  if (!idOk) return null;

  if (!m.homeTeam?.id || !m.awayTeam?.id) return null;
  if (m.homeTeam.id === m.awayTeam.id) return null; // DB CHECK(home <> away)

  /*
   * 킥오프는 not null이고 timestamptz로 파싱돼야 한다.
   * ⚠ **문자열만 받는다** — `utcDate: 0`이 `1970-01-01`로 조용히 저장됐다(실측).
   * ⚠ **범위도 본다** — `"+275760-09-13T…"`는 JS에서 파싱되지만 Postgres가
   *   `time zone displacement out of range`로 거부해 배치 + 왕복 N회를 낭비한다.
   */
  if (typeof m.utcDate !== "string") return null;
  const kickoff = new Date(m.utcDate);
  const year = kickoff.getUTCFullYear();
  if (Number.isNaN(kickoff.getTime()) || year < 1900 || year > 2200) return null;

  const finished = m.status === "FINISHED" || m.status === "AWARDED";
  const voided = m.status === "CANCELLED" || m.status === "SUSPENDED";
  const home = m.score?.fullTime?.home ?? null;
  const away = m.score?.fullTime?.away ?? null;
  // ⚠ 값의 형태까지 본다 — 음수·소수·smallint 초과가 전부 배치 전체를 날렸다(실측)
  const hasScore = finished && validScore(home) && validScore(away);
  // ⚠ **종료됐는데 스코어를 못 읽으면 알린다.** 경기 자체는 살려 두는 편이 낫지만(다음
  //   동기화가 고칠 수 있다) 조용히 넘기면 그 경기는 **영영 채점되지 않은 채** 목록에만
  //   남는다 — 적중률이 이유 없이 비는 원인이 된다.
  if (finished && !hasScore) {
    badScores.push(`${m.id} (${m.status}, ${JSON.stringify(m.score?.fullTime ?? null)})`);
  }

  return {
    external_id: String(m.id),
    season,
    matchday: m.matchday,
    home_team: teamCode.get(m.homeTeam.id),
    away_team: teamCode.get(m.awayTeam.id),
    kickoff_at: kickoff.toISOString(),
    home_score: hasScore ? home : null,
    away_score: hasScore ? away : null,
    // ⚠ 스코어와 **쌍으로만** 움직인다 — DB CHECK가 그걸 강제한다
    // ⚠ **형제 타임스탬프도 파싱을 확인한다.** 예전엔 `kickoff_at`만 검증해서
    //   `lastUpdated: "NOT-A-DATE"`가 payload에 그대로 실렸고, DB가 22007로 배치를 죽였다
    //   (행 단위 폴백이 전량 손실은 막지만 380경기면 381회 왕복을 치른다).
    finished_at: hasScore ? isoOrNull(m.lastUpdated) ?? kickoff.toISOString() : null,
    // ⚠ **시계를 읽지 않는다.** `new Date()`로 폴백하면 `lastUpdated`가 빠진 응답에서
    //   실행할 때마다 `voided_at`이 갱신되어 **멱등성이 깨진다**(실측). 이 스크립트의
    //   전제가 "두 번 돌려도 같다"이므로 응답이 준 시각만 쓰고, 없으면 킥오프로 접는다.
    voided_at: voided ? isoOrNull(m.lastUpdated) ?? kickoff.toISOString() : null,
  };
}

// ── 쓰기 ───────────────────────────────────────────────────────────────
const supabase = createClient(url, key, { auth: { persistSession: false } });

/**
 * 계통적 장애로 볼 SQLSTATE — 데이터가 아니라 **환경**이 문제라 남은 행도 전부 실패한다.
 * ⚠ 반대로 `23xxx`(제약)·`22xxx`(형식)·`P0001`은 **그 행의 데이터** 문제라 계속 간다.
 */
const SYSTEMIC = /^(42|53|57|58|08|PGRST)/;

/**
 * 계통적 실패인가 — **`code`만 보면 안 된다.**
 *
 * ⚠ postgrest-js는 두 경우에 `code`를 채우지 않는다(2.110 소스 확인):
 *   ① 네트워크 실패 → `code: ""` ② 비-JSON 에러 본문(게이트웨이 502·503·504, 429) → `code` 없음.
 *   그래서 **서비스 전면 장애가 중단을 발동시키지 못하고**, 죽은 서비스에 N행을 하나씩
 *   던진 뒤(380경기면 381왕복) `✓ 경기 0개`로 **종료코드 0** 을 냈다(실측 503 스텁).
 *   크론·CI가 종료코드를 보면 아무것도 쓰지 못한 실행이 초록으로 지나간다.
 * ⚠ `status`는 네트워크 실패에서 0, 게이트웨이 오류에서 5xx다 — 그 둘을 함께 본다.
 */
function isSystemic(error, status) {
  if (status === 0 || status >= 500) return true;
  return SYSTEMIC.test(error?.code ?? "");
}

/**
 * 배치로 넣고, 실패하면 **행 단위로** 되돌아간다. `team`·`match`가 함께 쓴다.
 *
 * ⚠ **이 폴백이 검증의 본체다.** `upsert`는 배열을 통째로 보내므로 **한 건의 결함이 그
 *   실행의 모든 행을 날린다.** JS에서 DB의 모든 CHECK를 복제하려는 시도는 세 라운드 연속
 *   실패했고("값이 있는가"는 고쳤지만 "그 값이 계약을 통과하는가"는 매번 놓쳤다), `toRow`가
 *   아는 결함 목록은 결코 완전할 수 없다 — 스키마가 바뀌거나 API가 새 값을 주면 또 생긴다.
 *   계약은 DB가 갖고 있으므로 **그 판정을 그대로 쓰되 실패를 한 행에 가둔다.**
 * ⚠ `team`에 이게 없어서 팀 하나의 이름 결함이 **동기화 전체**를 죽였다(실측 4종).
 *
 * ⚠ **중단은 "아무것도 성공하지 못했을 때"만 한다.** 예전에는 "같은 사유 5연속"으로 끊었는데,
 *   같은 CHECK를 어긴 서로 다른 행들은 **자연스럽게 같은 메시지**를 내므로(값이 메시지에
 *   안 들어간다) 데이터 결함 5건에 걸려 **뒤의 멀쩡한 행을 전부 버렸다**(실측: 결함이
 *   4건→5건이 되는 순간 손실이 1건→"그 뒤 전부"로 점프). 한 건이라도 성공했다면 그건
 *   계통적 장애가 아니라 데이터 문제다 — 끝까지 간다.
 */
async function upsertRows(table, rows, onConflict) {
  const { error, status } = await supabase.from(table).upsert(rows, { onConflict });
  if (!error) return { saved: rows, failed: [], aborted: false, skipped: [] };

  if (isSystemic(error, status)) {
    console.error(`✗ ${table} 계통적 실패(${error.code || `HTTP ${status}`}) — 행 단위 재시도를 건너뜁니다`);
    return { saved: [], failed: rows.map((row) => ({ row, message: error.message })), aborted: true, skipped: [] };
  }
  console.warn(`⚠ ${table} 일괄 저장 실패(${error.message}) — 행 단위로 다시 시도합니다`);
  const saved = [];
  const failed = [];
  for (const [i, row] of rows.entries()) {
    const { error: rowErr, status: rowStatus } = await supabase
      .from(table)
      .upsert([row], { onConflict });
    if (!rowErr) {
      saved.push(row);
      continue;
    }
    failed.push({ row, message: rowErr.message });
    // ⚠ 중단은 **에러의 성격**으로만 판정한다(개수가 아니다 — 사유는 `upsertRows` 주석).
    if (isSystemic(rowErr, rowStatus)) {
      const skipped = rows.slice(i + 1);
      console.error(
        `✗ 계통적 실패(${rowErr.code || `HTTP ${rowStatus}`})로 중단합니다 — 남은 ${skipped.length}건은 시도하지 않았습니다`,
      );
      return { saved, failed, aborted: true, skipped };
    }
  }
  return { saved, failed, aborted: false, skipped: [] };
}


// 경기 목록에 등장하는 팀만 모은다(팀 엔드포인트를 따로 부르지 않아 요청이 하나로 끝난다)
const apiTeams = new Map();
for (const m of apiMatches) {
  // ⚠ 원소 자체가 null일 수 있다 — `toRow`의 방어는 전부 이 루프 **뒤**에 있어서
  //   `matches: [null, …]` 하나가 여기서 uncaught TypeError로 전체를 죽였다(실측).
  if (!m || typeof m !== "object") continue;
  for (const t of [m.homeTeam, m.awayTeam]) {
    if (t?.id && !apiTeams.has(t.id)) apiTeams.set(t.id, t);
  }
}

/*
 * ⚠ **중복 `external_id`를 DB에 손대기 전에 잡는다.** 배치라면 21000(`ON CONFLICT ...
 *   cannot affect row a second time`)으로 드러나던 무결성 신호인데, 행 단위 폴백이 생기면서
 *   둘 다 성공하고 **뒤가 이기는** 형태로 조용히 삼켜졌다.
 * ⚠ **실제로 실릴 후보에 대해서만 센다.** 전체 응답을 훑었더니 컵 형식(`matchday` 밖 —
 *   스크립트가 "정상적인 제외"라 부르는 행)이나 `id`가 객체인 결함 행이 중복이면
 *   **멀쩡한 경기까지 전량 거부**됐다(실측 EXIT=1, 0건 저장) — 한 건의 결함이 실행 전체를
 *   날리던 그 형태가 새 검사에 다시 들어온 것이다.
 */
const seen = new Set();
const dupes = [];
for (const m of apiMatches) {
  if (!m || typeof m !== "object") continue;
  if (!Number.isInteger(m.matchday) || m.matchday < 1 || m.matchday > 38) continue;
  const idOk =
    (typeof m.id === "number" && Number.isSafeInteger(m.id)) ||
    (typeof m.id === "string" && m.id.trim().length > 0);
  if (!idOk) continue;
  const key = String(m.id);
  if (seen.has(key)) dupes.push(key);
  else seen.add(key);
}
if (dupes.length > 0) {
  console.error(`✗ 응답에 중복된 경기 id ${dupes.length}건: ${dupes.join(", ")}`);
  console.error("  같은 실행에 같은 경기가 두 번 왔습니다 — 응답을 확인하세요.");
  process.exit(1);
}

const { data: existing, error: readErr } = await supabase
  .from("team")
  .select("code, external_id");
if (readErr) {
  console.error("✗ 기존 팀 조회 실패:", readErr.message);
  process.exit(1);
}

/**
 * ⚠ **키가 `code`(우리 슬러그)다.** API의 숫자 id로 키를 잡으면 매핑을 만들 때 그 id를
 *   먼저 알아야 하는데, 슬러그는 팀 이름에서 결정적으로 나와 미리 적어 둘 수 있다.
 *   `code`는 한번 정해지면 바뀌지 않으므로(위 주석) 이 키도 안정적이다.
 */
let namesKo = {};
try {
  const parsed = JSON.parse(readFileSync(NAMES_KO, "utf8"));
  // ⚠ **객체인지까지 본다.** `JSON.parse("null")`은 **성공**하므로 try/catch가 잡지 못하고
  //   `Object.hasOwn(null, …)`에서 죽었다(실측) — 죽는 지점만 옮겼던 자리다.
  namesKo = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
} catch {
  console.warn(`⚠ ${NAMES_KO}를 읽지 못했습니다 — 팀 이름이 영문으로 들어갑니다`);
}

const unmapped = [];
const unusable = [];
const badScores = [];
const teamCode = new Map(); // API team id → 우리 code
const takenCodes = new Set(existing.map((t) => t.code));
const byExternal = new Map(existing.map((t) => [t.external_id, t.code]));

/**
 * 문자열이고 **보이는 글자가 있으면** 그대로, 아니면 null.
 *
 * ⚠ `length > 0`만 보면 `" "`·`"\u200b"`(제로폭)가 통과해 DB의 `has_visible_char` CHECK에
 *   걸린다 — API 글리치로 실제로 오는 값이다. 여기서는 **후보를 고르는 데만** 쓰고,
 *   최종 계약은 DB가 판정한다(그래서 아래 upsert에 행 단위 폴백이 있다).
 * ⚠ 판정을 DB와 완전히 일치시키려 하지 않는다 — `shared/lib/text.ts`의 `hasVisibleChar`가
 *   단일 소스인데 이 스크립트는 Next 밖이라 import할 수 없고, 여기에 3번째 사본을 만들면
 *   그 규약이 조용히 갈린다. 보수적으로 거르고 나머지는 DB에 맡긴다.
 */
const INVISIBLE = /[\s\u00ad\u180e\u200b-\u200f\u2028\u2029\u2060\ufeff]/gu;
function str(v) {
  if (typeof v !== "string") return null;
  // ⚠ `.trim()`만으로는 부족하다 — `"\u200b"`(제로폭)·`"\u00ad"`(소프트 하이픈)이 그대로
  //   통과해 DB의 `has_visible_char`에 걸렸다(실측). 보이지 않는 문자를 걷어내고 판정한다.
  return v.replace(INVISIBLE, "").length > 0 ? v.trim() : null;
}

/**
 * **코드포인트 단위** 절단 — `.slice()`를 쓰지 않는다.
 *
 * ⚠ `.slice()`는 UTF-16 코드유닛이라 이모지를 반쪽으로 자른다. 실제로
 *   `"AAAAAAAAA😀 United".slice(0,10)`이 **하이 서로게이트 단독**을 남겨 JSON 인코딩이
 *   깨졌고, PostgREST가 payload를 통째로 거부해 **동기화 전체가 죽었다**(실측).
 *   `reuse.md`가 `.slice()`를 금지하고 `clamp`를 쓰라고 한 그 자리다.
 */
function clampCp(text, max) {
  const cps = [...text];
  return cps.length <= max ? text : cps.slice(0, max).join("");
}

/** 이번 실행에서 **새로 만든** 팀 코드 — 갱신 실패의 처리가 기존 팀과 다르다 */
const newTeamCodes = new Set();
const teamRows = [];
for (const [id, t] of apiTeams) {
  const known = byExternal.get(String(id));
  let code = known;
  if (!code) {
    // ⚠ 새 팀일 때만 슬러그를 만든다. 충돌하면 접미어를 붙인다 — code는 PK라 겹칠 수 없다.
    const base = slugify(t.shortName, t.name, t.tla);
    if (!base) {
      unusable.push(`id=${id} (코드를 만들 수 없다)`);
      continue;
    }
    code = base;
    for (let i = 2; takenCodes.has(code); i++) code = `${base}-${i}`;
    takenCodes.add(code);
  }

  /**
   * ⚠ **한국어 표기를 여기서 입힌다.** `team.name`이 화면에 그대로 나가는 값이라 규약상
   *   저장값이 한국어여야 하고(`post_category`와 같은 판단), **이 스크립트가 그 컬럼의
   *   유일한 writer**라 매핑이 다른 곳에 있으면 다음 동기화가 통째로 덮어쓴다.
   * ⚠ **항목의 모양까지 본다.** `ko?.short ?? …`의 `??`는 nullish만 보므로 `short: 12345`가
   *   그대로 통과해 `.slice is not a function`으로 전체가 죽었다(실측). 파일이 `null`이면
   *   `namesKo[code]`에서 죽는 것도 같은 뿌리다 — try/catch는 파싱 실패만 잡는다.
   * ⚠ `Object.hasOwn`으로 읽는다 — 팀 코드가 `constructor`면 프로토타입 값이 잡혀
   *   이름이 `"Object"`로 저장됐다(실측).
   */
  if (!known) newTeamCodes.add(code);
  const ko = Object.hasOwn(namesKo, code) && namesKo[code] && typeof namesKo[code] === "object"
    ? namesKo[code]
    : null;
  const koName = str(ko?.name);
  const koShort = str(ko?.short);

  const apiName = str(t.name) ?? str(t.shortName) ?? str(t.tla);
  const name = koName ?? apiName;

  /*
   * ⚠ **기존 팀은 이름을 못 골라도 버리지 않는다.** DB에 멀쩡한 행이 이미 있으므로 갱신만
   *   건너뛰면 되는데, 신규 팀용 정책(팀을 버린다)을 그대로 적용했더니 **그 팀의 경기가
   *   전부 사라졌다**(실측 — 승격팀 이름 누락은 주석이 실측했다고 적어 둔 시나리오라,
   *   한 라운드가 통째로 사이트에서 빠지는 경로다).
   */
  if (!name) {
    if (known) {
      teamCode.set(id, code); // 행은 그대로 두고 경기만 살린다
    } else {
      unusable.push(`id=${id} (쓸 이름이 없다)`);
    }
    continue;
  }

  // ⚠ 매핑 **항목은 있는데 name이 없는 경우**도 경고 대상이다 — `!ko`만 보면 부분 매핑이
  //   영문으로 저장되면서 "이 팀은 매핑돼 있다"고 말하는 침묵이 된다(실측).
  if (!koName) unmapped.push(`${code} (${name})`);

  // 약칭은 예측 버튼 라벨("맨유 승")에 쓴다. 매핑이 없으면 tla → shortName → 이름 순.
  const short = koShort ?? str(t.tla) ?? str(t.shortName) ?? name;
  teamCode.set(id, code);
  teamRows.push({
    code,
    name: clampCp(name, 100),
    short_name: clampCp(short, 10),
    external_id: String(id),
  });
}

// ⚠ `match`와 **같은 폴백**을 쓴다 — 팀 하나의 결함이 동기화 전체를 죽이던 자리다.
const teamResult = await upsertRows("team", teamRows, "code");
for (const f of teamResult.failed) {
  /*
   * ⚠ **기존 팀이면 경기를 버리지 않는다.** "FK로 어차피 거부된다"는 근거는 **신규 팀에만**
   *   성립한다 — 기존 팀은 행이 이미 있어 FK를 만족하고, 실패한 것은 *갱신*뿐이다.
   *   그런데 그 팀의 경기를 전부 버려서, 한국어 매핑 전 승격팀(스크립트가 스스로 경고로
   *   안내하는 상태)의 경기가 통째로 사라졌다(실측).
   */
  if (newTeamCodes.has(f.row.code)) {
    console.error(`✗ 팀 ${f.row.code} 저장 실패: ${f.message} — 새 팀이라 이 팀의 경기도 함께 빠집니다`);
    for (const [apiId, code] of teamCode) if (code === f.row.code) teamCode.delete(apiId);
  } else {
    console.error(`✗ 팀 ${f.row.code} 갱신 실패: ${f.message} — 기존 행을 그대로 두고 경기는 계속합니다`);
  }
  process.exitCode = 1; // ⚠ 팀 실패도 종료코드를 올린다 — 크론이 초록으로 지나가면 안 된다
}
if (teamResult.aborted) {
  console.error("✗ 팀 저장이 계통적으로 실패해 중단합니다 — 경기는 시도하지 않습니다.");
  process.exit(1);
}
console.log(`✓ 팀 ${teamResult.saved.length}개`);
// ⚠ **두 경고를 섞지 않는다.** 한 목록에 담았더니 "영문 이름이 화면에 그대로 나갑니다"가
//   **버려진 팀에 대해 거짓**이 됐고(DB에 행이 없다), 안내한 조치(JSON에 추가)도 효과가
//   없었다(키가 될 code가 애초에 만들어지지 않았다).
if (unusable.length > 0) {
  console.warn(`\n⚠ 데이터가 없어 건너뛴 팀 ${unusable.length}개 — 이 팀의 경기도 함께 빠집니다:`);
  for (const line of unusable) console.warn(`   ${line}`);
}
if (unmapped.length > 0) {
  console.warn(`\n⚠ 한국어 표기가 없는 팀 ${unmapped.length}개 — ${NAMES_KO}에 추가하세요:`);
  for (const line of unmapped) console.warn(`   ${line}`);
  console.warn("  (그때까지 영문 이름이 화면에 그대로 나갑니다)\n");
}

// ⚠ matchday가 없는 경기는 건너뛴다 — 컵 대회 형식이라 CHECK(1~38)에 걸린다.
const matchRows = apiMatches
  // ⚠ 원소가 null일 수 있다 — `toRow`의 방어는 전부 이 뒤에 있다(팀 루프와 같은 함정)
  .filter((m) => m && typeof m === "object")
  .filter((m) => Number.isInteger(m.matchday) && m.matchday >= 1 && m.matchday <= 38)
  .map((m) => toRow(m, teamCode))
  // ⚠ `toRow`가 null을 돌려준 것(대진·시즌 결함)과 팀 매핑이 비어 있는 것을 함께 걷어낸다
  .filter((r) => r !== null && r.home_team && r.away_team);

// ⚠ **조용히 버리지 않는다.** 몇 건이 왜 빠졌는지 로그에 남지 않으면 일정이 비어 있는 것을
//   아무도 눈치채지 못한다(matchday가 없는 컵 형식은 정상적인 제외라 따로 센다).
const eligible = apiMatches.filter(
  (m) => m && typeof m === "object" && Number.isInteger(m.matchday) && m.matchday >= 1 && m.matchday <= 38,
).length;
if (matchRows.length < eligible) {
  console.warn(`⚠ 데이터가 온전하지 않아 건너뛴 경기 ${eligible - matchRows.length}건`);
}
if (badScores.length > 0) {
  console.warn(`⚠ 종료됐지만 스코어를 읽지 못한 경기 ${badScores.length}건 (채점되지 않는다):`);
  for (const line of badScores) console.warn(`   ${line}`);
}

const matchResult = await upsertRows("match", matchRows, "external_id");

if (matchResult.failed.length > 0) {
  console.error(`✗ 저장하지 못한 경기 ${matchResult.failed.length}건:`);
  for (const f of matchResult.failed) console.error(`   ${f.row.external_id}: ${f.message}`);
  process.exitCode = 1;
}
// ⚠ **시도조차 안 한 행을 따로 보고한다.** 예전에는 중단된 행이 `failed`에도 없어
//   **무엇을 잃었는지 로그에 아무 흔적이 없었다.**
if (matchResult.aborted) {
  console.error(`✗ 시도하지 못한 경기 ${matchResult.skipped.length}건: ${matchResult.skipped
    .map((r) => r.external_id)
    .join(", ")}`);
  process.exitCode = 1;
}

/*
 * ⚠ **실제로 저장된 행만 센다.** 예전에는 실패 목록을 `line.split(":")[0]`로 되짚어
 *   `external_id`에 `:`가 있으면 실패 행이 저장된 것으로 세어졌고, 중단된 행은 아예
 *   "저장됨"으로 세어져 `✓ 경기 0개 (결과 있음 1 · 무효 1)` 같은 자기모순이 나왔다(실측).
 *   이제 `upsertRows`가 저장된 행 자체를 돌려주므로 되짚을 필요가 없다.
 */
const scored = matchResult.saved.filter((r) => r.home_score !== null).length;
const voided = matchResult.saved.filter((r) => r.voided_at !== null).length;
console.log(
  `✓ 경기 ${matchResult.saved.length}개 (결과 있음 ${scored} · 무효 ${voided})` +
    (matchResult.aborted ? " — 중단됨" : ""),
);
console.log(`\n대상: ${url}`);

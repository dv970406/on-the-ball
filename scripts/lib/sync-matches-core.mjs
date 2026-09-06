/**
 * 시즌 동기화의 **코어** — CLI(`scripts/sync-matches.mjs`)와 어드민 Route Handler
 * (`app/api/admin/sync-matches/route.ts`)가 이 함수 하나를 공유한다.
 *
 * ⚠ **여기에는 process.exit도, 파일 읽기도, 인자 파싱도 없다.**
 *   - `process.exit`은 서버리스에서 프로세스 종료다 → 실패는 throw로 올린다.
 *   - `readFileSync`는 cwd 상대 경로라 서버리스에서 깨지고, 동적 경로라 Next의
 *     outputFileTracing이 `scripts/`를 번들에 넣지 않는다 → 매핑을 **주입받는다**
 *     (핸들러는 정적 import, CLI는 파일 읽기).
 *   - `guardTarget`(원격 쓰기 방지)도 여기 없다. 그 가드의 주어는 "사람이 로컬
 *     터미널에서 프로덕션을 덮는 실수"이고, 배포된 핸들러는 정의상 자기 프로젝트에
 *     쓴다 → CLI 진입점에만 남는다. 핸들러 쪽 대응물은 `is_admin()` 인가다.
 *
 * ⚠ `log`를 주입받는 이유: 이 동기화의 **운영 정보 전부가 console.warn에 있다**
 *   (한국어 표기가 없는 팀 · 종료됐는데 스코어를 못 읽은 경기 · 건너뛴 경기).
 *   삼키면 화면이 "성공"만 말한다.
 */
import { clampCp, isoOrNull, slugify, str, upsertRows, validScore } from "./sync-db.mjs";
import { matchState, parseMatchday, seasonLabel } from "./api-football.mjs";

/**
 * ⚠ **JSDoc으로 인자 타입을 넓혀 둔다.** Route Handler(TypeScript)가 이 함수를 부르는데,
 *   기본값만 보고 추론하면 `teamList = []`가 `never[]`, `log = console`이 `Console`이 되어
 *   호출부가 통과할 수 없다. `checkJs`는 꺼져 있어 이 파일 자체는 검사되지 않는다.
 *
 * @param {object} options
 * @param {any} options.supabase  service_role 클라이언트
 * @param {any[] | null} options.fixtures  제공자 응답의 `response` 배열
 * @param {any[]} [options.teamList]
 * @param {Record<string, any>} [options.namesKo]
 * @param {Record<string, any>} [options.providerIds]
 * @param {{log: (...a: any[]) => void, warn: (...a: any[]) => void, error: (...a: any[]) => void}} [options.log]
 * @param {number} [options.rowFallbackLimit]
 * @returns {Promise<{
 *   teams: { saved: number, failed: number },
 *   matches: { saved: number, failed: number, skipped: number, locked: number,
 *              aborted: boolean, scored: number, voided: number, live: number },
 *   unmapped: string[], unusable: string[], badScores: string[], hadFailure: boolean
 * }>}
 */
export async function syncSeason({
  supabase,
  /** 제공자 응답의 `response` 배열 */
  fixtures,
  /** `/teams` 응답의 팀 배열(실패하면 빈 배열 — 약칭이 이름에서 유도된다) */
  teamList = [],
  namesKo = {},
  providerIds = {},
  log = console,
  rowFallbackLimit = Infinity,
}) {
  /** 한 건이라도 실패했는가 — 호출부가 종료 코드·응답 필드로 옮긴다 */
  let hadFailure = false;

  // ⚠ **배열인지까지 본다.** `?? []` + `length === 0`은 `{}`와 문자열을 통과시켜,
  //   잘못된 payload가 팀 upsert를 커밋한 뒤 죽는다(부분 적용이 남는다).
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    throw new Error("경기 배열을 찾지 못했습니다 — 응답 형태나 시즌을 확인하세요.");
  }

  const apiFixtures = fixtures;
  const apiTeamList = teamList;

  /** API 팀 id → 우리가 미리 정해 둔 code (제공자 전환용 역방향 색인) */
  const codeByProviderId = new Map(
    Object.entries(providerIds)
      .filter(([k, v]) => k !== "_comment" && Number.isInteger(v))
      .map(([code, id]) => [String(id), code]),
  );

  const { data: existing, error: readErr } = await supabase
    .from("team")
    .select("code, external_id");
  if (readErr) throw new Error(`기존 팀 조회 실패: ${readErr.message}`);

  const takenCodes = new Set(existing.map((t) => t.code));
  const byExternal = new Map(
    existing.filter((t) => t.external_id).map((t) => [t.external_id, t.code]),
  );

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
      log.warn(
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
    log.log(`  낡은 external_id를 비웁니다 ${stale.length}건: ${stale.join(", ")}`);
    const { error } = await supabase
      .from("team")
      .update({ external_id: null })
      .in("code", stale);
    if (error) log.warn(`⚠ external_id 초기화 실패(${error.message}) — 충돌하면 그 팀만 빠집니다`);
  }

  const teamResult = await upsertRows(
    supabase,
    "team",
    teamRows,
    { onConflict: "code" },
    { log, rowFallbackLimit },
  );
  for (const f of teamResult.failed) {
    /*
     * ⚠ **기존 팀이면 경기를 버리지 않는다.** "FK로 어차피 거부된다"는 근거는 **신규 팀에만**
     *   성립한다 — 기존 팀은 행이 이미 있어 FK를 만족하고, 실패한 것은 *갱신*뿐이다.
     */
    if (newTeamCodes.has(f.row.code)) {
      log.error(`✗ 팀 ${f.row.code} 저장 실패: ${f.message} — 새 팀이라 이 팀의 경기도 함께 빠집니다`);
      for (const [apiId, code] of teamCode) if (code === f.row.code) teamCode.delete(apiId);
    } else {
      log.error(`✗ 팀 ${f.row.code} 갱신 실패: ${f.message} — 기존 행을 두고 경기는 계속합니다`);
    }
    hadFailure = true; // ⚠ 호출부가 이 사실을 사용자·크론에게 전달해야 한다
  }
  if (teamResult.aborted) {
    // ⚠ process.exit이 아니라 throw다 — Route Handler에서는 프로세스를 죽이면 안 된다.
    throw new Error("팀 저장이 계통적으로 실패해 중단했어요. 경기는 시도하지 않았습니다.");
  }
  log.log(`✓ 팀 ${teamResult.saved.length}개`);
  if (adopted.length > 0) {
    log.log(`  제공자 전환으로 code를 보존한 팀 ${adopted.length}개 (crests·한국어 표기가 유지됩니다)`);
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
    log.log(`  라운드 밖이라 제외한 경기 ${wellFormed.length - candidates.length}건 (컵 형식 등)`);
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
    throw new Error(`응답에 중복된 경기 id ${dupes.length}건: ${dupes.join(", ")}`);
  }

  const matchRows = candidates
    .map(toRow)
    // ⚠ `toRow`가 null을 돌려준 것과 팀 매핑이 비어 있는 것을 함께 걷어낸다
    .filter((r) => r !== null && r.home_team && r.away_team);

  // ⚠ **조용히 버리지 않는다.** 몇 건이 왜 빠졌는지 로그에 없으면 일정이 비어 있는 것을
  //   아무도 눈치채지 못한다.
  if (matchRows.length < candidates.length) {
    log.warn(`⚠ 데이터가 온전하지 않아 건너뛴 경기 ${candidates.length - matchRows.length}건`);
  }
  if (badScores.length > 0) {
    log.warn(`⚠ 종료됐지만 스코어를 읽지 못한 경기 ${badScores.length}건 (채점되지 않는다):`);
    for (const line of badScores.slice(0, 10)) log.warn(`   ${line}`);
  }

  /*
   * ⚠⚠ **어드민이 수정해 잠근 경기는 건드리지 않는다.** toRow가 만드는 payload에는
   *   season·matchday·팀·kickoff_at·스코어·finished_at·voided_at이 전부 들어 있어,
   *   그대로 upsert하면 어드민이 방금 고친 값을 **조용히 원복한다**(화면은 "저장됐어요"라
   *   말하고 몇 시간 뒤 되돌아간다 — 재현도 로그도 없이 터지는 종류다).
   * ⚠ `deleted_at`은 payload에 없어 자동으로 보존된다 — 삭제한 경기는 되살아나지 않는다.
   */
  const { data: lockedRows, error: lockedErr } = await supabase
    .from("match")
    .select("external_id")
    .not("admin_locked_at", "is", null);
  if (lockedErr) {
    // 못 읽으면 **덮어쓰지 않는 쪽으로 기울지 않는다** — 목록이 통째로 비면 일정이 안 들어온다.
    // 대신 사실을 알리고 진행한다(잠금은 어드민이 다시 걸 수 있다).
    log.warn(`⚠ 잠긴 경기 목록을 읽지 못했습니다(${lockedErr.message}) — 잠금을 무시하고 진행합니다`);
  }
  const lockedIds = new Set((lockedRows ?? []).map((r) => r.external_id));
  const lockedSkipped = matchRows.filter((r) => lockedIds.has(r.external_id));
  const writableRows = matchRows.filter((r) => !lockedIds.has(r.external_id));
  if (lockedSkipped.length > 0) {
    log.log(`  어드민이 잠근 경기 ${lockedSkipped.length}건은 건너뜁니다`);
  }

  const matchResult = await upsertRows(
    supabase,
    "match",
    writableRows,
    { onConflict: "external_id" },
    { log, rowFallbackLimit },
  );
  if (matchResult.failed.length > 0) {
    log.error(`✗ 저장하지 못한 경기 ${matchResult.failed.length}건:`);
    for (const f of matchResult.failed.slice(0, 10)) log.error(`   ${f.row.external_id}: ${f.message}`);
    hadFailure = true;
  }
  // ⚠ **시도조차 안 한 행을 따로 보고한다.** 중단된 행이 `failed`에도 없으면 **무엇을 잃었는지
  //   로그에 아무 흔적이 없다.**
  if (matchResult.aborted) {
    log.error(`✗ 시도하지 못한 경기 ${matchResult.skipped.length}건`);
    hadFailure = true;
  }

  const scored = matchResult.saved.filter((r) => r.home_score !== null).length;
  const voided = matchResult.saved.filter((r) => r.voided_at !== null).length;
  const live = matchResult.saved.filter((r) => r.live_minute !== null).length;
  log.log(
    `✓ 경기 ${matchResult.saved.length}개 (결과 있음 ${scored} · 진행 중 ${live} · 무효 ${voided})` +
      (matchResult.aborted ? " — 중단됨" : ""),
  );

  if (unusable.length > 0) {
    log.warn(`\n⚠ 데이터가 없어 건너뛴 팀 ${unusable.length}개 — 이 팀의 경기도 함께 빠집니다:`);
    for (const line of unusable) log.warn(`   ${line}`);
  }
  // ⚠ **두 경고를 섞지 않는다.** 한 목록에 담으면 "영문 이름이 화면에 나갑니다"가 버려진 팀에
  //   대해 거짓이 되고(DB에 행이 없다), 안내한 조치도 효과가 없다(키가 될 code가 없다).
  if (unmapped.length > 0) {
    log.warn(`\n⚠ 한국어 표기가 없는 팀 ${unmapped.length}개 — scripts/team-names-ko.json에 추가하세요:`);
    for (const line of unmapped) log.warn(`   ${line}`);
    log.warn("  (그때까지 영문 이름이 화면에 그대로 나갑니다)\n");
  }

  return {
    teams: { saved: teamResult.saved.length, failed: teamResult.failed.length },
    matches: {
      saved: matchResult.saved.length,
      failed: matchResult.failed.length,
      skipped: matchResult.skipped.length,
      locked: lockedSkipped.length,
      aborted: matchResult.aborted,
      scored,
      voided,
      live,
    },
    unmapped,
    unusable,
    badScores,
    hadFailure,
  };
}

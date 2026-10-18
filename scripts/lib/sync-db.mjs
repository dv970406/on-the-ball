/**
 * 동기화 스크립트가 공유하는 **쓰기 경로와 그 방어**.
 *
 * ⚠ **여기 있는 것은 전부 실측으로 얻은 방어다.** 스크립트마다 사본을 만들면 한쪽만 고쳐지고,
 *   그 순간 다른 스크립트가 이미 겪은 실패를 다시 겪는다 — 이적 소식 수집·딜 파생·엠블럼
 *   수집이 여기를 함께 쓴다.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/**
 * ⚠ **process.env를 먼저 본다.** 크론·CI에서는 `.env.local`이 없고 시크릿이 환경으로 온다.
 *   로컬에서만 파일로 폴백한다.
 */
export function loadEnv(extraKeys = []) {
  const wanted = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", ...extraKeys];
  const out = {};
  for (const k of wanted) out[k] = process.env[k];
  // ⚠ 필요한 키가 **전부** 환경에 있을 때만 파일을 건너뛴다 — 추가 키(예: ANTHROPIC_API_KEY)만 파일에 있는
  //   로컬 셸에서 Supabase 변수를 export해 두면 추가 키를 영영 못 읽었다.
  if (wanted.every((k) => out[k])) return out;

  let file;
  try {
    file = readFileSync(".env.local", "utf8");
  } catch {
    return out;
  }
  for (const line of file.split("\n")) {
    const i = line.indexOf("=");
    if (i === -1 || line.trimStart().startsWith("#")) continue;
    const k = line.slice(0, i).trim();
    if (!wanted.includes(k)) continue;
    // ⚠ 따옴표를 벗긴다 — `KEY="abc"`로 적어 둔 값이 그대로 헤더에 실려 401이 났다.
    out[k] ??= line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * ⚠ **원격 쓰기는 명시적으로만.** `.env.local`에는 원격 프로젝트의 자격증명이 함께 들어 있어
 *   URL 한 줄만 바뀌어도 확인 프롬프트 없이 프로덕션을 덮어쓴다. 다만 이 스크립트들은
 *   **원격 정기 실행이 본래 용도**라 금지가 아니라 플래그로 연다.
 * ⚠ 반대로 `--remote`인데 대상이 로컬이면 멈춘다 — `--remote`는 원격 URL을 허용할 뿐 대상을 바꾸지 않는다(대상은 환경변수,
 *   없으면 `.env.local`). 원격 자격 증명을 싣지 않은 채 붙인 것이라, 조용히 로컬에 쓰면 원격에 돌렸다고 믿게 된다
 *   (로컬에 `--rejudge`를 돌린 적이 있다).
 */
function guardTarget(url, allowRemote) {
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
  if (!isLocal && !allowRemote) {
    console.error(`원격으로 보입니다 — ${url}`);
    console.error("의도한 것이라면 --remote 를 붙이세요.");
    process.exit(1);
  }
  if (isLocal && allowRemote) {
    console.error(`--remote인데 대상이 로컬입니다(${url}) — 원격 자격 증명을 환경에 실으세요.`);
    console.error("예: set -a; source .env.prod; set +a; node scripts/<명령>.mjs --remote …");
    process.exit(1);
  }
}

export function createSyncClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * 운영 스크립트의 DB 연결 — 자격 증명 확인 → 원격 가드(`--remote`) → service_role 클라이언트. 정기 실행과 사람이 돌리는 명령이
 * 함께 쓴다. 없으면 이유를 찍고 종료 코드 1로 끝낸다. `extraKeys`는 함께 읽을 환경변수다(LLM·푸시 키 등).
 * @returns {{ env: Record<string, string | undefined>, url: string, supabase: import("@supabase/supabase-js").SupabaseClient }}
 */
export function connectFromEnv(argv, extraKeys = []) {
  const env = loadEnv(extraKeys);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY가 없습니다");
    process.exit(1);
  }
  guardTarget(url, argv.includes("--remote"));
  return { env, url, supabase: createSyncClient(url, env.SUPABASE_SERVICE_ROLE_KEY) };
}

/**
 * 한 테이블을 `key` 키셋으로 끝까지 읽는다 — PostgREST `max_rows`에서 조용히 잘리지 않게(`api-and-db.md` PostgREST 절).
 * offset보다 이쪽이 먼저다 — 읽는 동안 행이 늘거나 줄어도 건너뛰거나 겹치지 않는다. 키는 유일해야 한다.
 * @param {(q: any) => any} build select 뒤에 거는 필터(정렬·limit은 여기서 건다)
 */
export async function readAll(supabase, table, columns, key, build = (q) => q, page = 500) {
  const out = [];
  let last = null;
  for (;;) {
    let q = build(supabase.from(table).select(columns)).order(key).limit(page);
    if (last !== null) q = q.gt(key, last);
    const { data, error } = await q;
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    out.push(...data);
    if (data.length < page) break;
    last = data.at(-1)[key];
  }
  return out;
}

/**
 * 범위(offset)로 끝까지 읽는다 — 키가 여러 컬럼이라 키셋으로 넘길 수 없는 조회용.
 * ⚠ `makeQuery`는 **정렬을 고정한** 새 쿼리를 매번 만들어야 한다 — 정렬이 없으면 페이지 사이에 순서가 흔들려 행이 빠지거나 겹친다.
 * @param {() => any} makeQuery
 */
export async function readRange(makeQuery, label, page = 1000) {
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await makeQuery().range(from, from + page - 1);
    if (error) throw new Error(`${label} 조회 실패: ${error.message}`);
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

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
 *   던진 뒤 `✓ 0개`로 **종료코드 0** 을 냈다(실측 503 스텁). 크론·CI가 종료코드를 보면
 *   아무것도 쓰지 못한 실행이 초록으로 지나간다.
 * ⚠ `status`는 네트워크 실패에서 0, 게이트웨이 오류에서 5xx다 — 그 둘을 함께 본다.
 */
function isSystemic(error, status) {
  if (status === 0 || status >= 500) return true;
  return SYSTEMIC.test(error?.code ?? "");
}

/**
 * 배치로 넣고, 실패하면 **행 단위로** 되돌아간다.
 *
 * ⚠ **이 폴백이 검증의 본체다.** `upsert`는 배열을 통째로 보내므로 **한 건의 결함이 그
 *   실행의 모든 행을 날린다.** JS에서 DB의 모든 CHECK를 복제하려는 시도는 세 라운드 연속
 *   실패했다 — 계약은 DB가 갖고 있으므로 **그 판정을 그대로 쓰되 실패를 한 행에 가둔다.**
 *
 * ⚠ **중단은 "아무것도 성공하지 못했을 때"만 한다.** 예전에는 "같은 사유 5연속"으로 끊었는데,
 *   같은 CHECK를 어긴 서로 다른 행들은 **자연스럽게 같은 메시지**를 내므로 데이터 결함
 *   5건에 걸려 **뒤의 멀쩡한 행을 전부 버렸다**(실측).
 *
 * ⚠ **배치 한 번은 SQL 한 문장이라 원자적이다.** 한 묶음을 한 번에 보내면
 *   읽는 사람이 반쯤 쓰인 상태를 보지 않는다 — 나눠 보내면 그 사이 상태가 노출된다.
 *   행 단위 폴백은 그 원자성을 포기하는 대신 전량 손실을 막는 거래다.
 */
/**
 * @param {object} runtime  CLI와 Route Handler가 갈리는 값들.
 *   - `log`: 로그 채널. **핸들러는 배열 수집기를 넣는다** — 이 스크립트의 운영 정보
 *     (한국어 표기 없는 팀 · 스코어를 못 읽은 경기)가 전부 console.warn에 있어서,
 *     삼키면 화면이 "성공"만 말한다.
 *   - `rowFallbackLimit`: 일괄 실패 뒤 **행 단위로 재시도할 최대 건수**.
 *     ⚠ 서버리스에서 이 값이 없으면 380행을 하나씩 왕복해 어떤 시간 상한이든 넘긴다 —
 *     타임아웃은 **부분 적용 + 응답 없음**이라 무엇이 저장됐는지 알 길이 없다.
 */
export async function upsertRows(supabase, table, rows, options = {}, runtime = {}) {
  const log = runtime.log ?? console;
  const rowFallbackLimit = runtime.rowFallbackLimit ?? Infinity;
  if (rows.length === 0) return { saved: [], failed: [], aborted: false, skipped: [] };

  const { error, status } = await supabase.from(table).upsert(rows, options);
  if (!error) return { saved: rows, failed: [], aborted: false, skipped: [] };

  if (isSystemic(error, status)) {
    log.error(
      `✗ ${table} 계통적 실패(${error.code || `HTTP ${status}`}) — 행 단위 재시도를 건너뜁니다`,
    );
    return {
      saved: [],
      failed: rows.map((row) => ({ row, message: error.message })),
      aborted: true,
      skipped: [],
    };
  }

  log.warn(`⚠ ${table} 일괄 저장 실패(${error.message}) — 행 단위로 다시 시도합니다`);
  const saved = [];
  const failed = [];
  for (const [i, row] of rows.entries()) {
    // ⚠ 상한을 넘으면 **남은 행을 시도조차 하지 않았다고 보고한다.** 조용히 끝내면
    //   무엇을 잃었는지 로그에 흔적이 없다(aborted와 같은 취급이다).
    if (i >= rowFallbackLimit) {
      const skipped = rows.slice(i);
      log.error(`✗ 행 단위 재시도 상한(${rowFallbackLimit})에 걸려 ${skipped.length}건을 남깁니다`);
      return { saved, failed, aborted: true, skipped };
    }
    const { error: rowErr, status: rowStatus } = await supabase.from(table).upsert([row], options);
    if (!rowErr) {
      saved.push(row);
      continue;
    }
    failed.push({ row, message: rowErr.message });
    // ⚠ 중단은 **에러의 성격**으로만 판정한다(개수가 아니다 — 사유는 위 주석).
    if (isSystemic(rowErr, rowStatus)) {
      const skipped = rows.slice(i + 1);
      log.error(
        `✗ 계통적 실패(${rowErr.code || `HTTP ${rowStatus}`})로 중단합니다 — 남은 ${skipped.length}건은 시도하지 않았습니다`,
      );
      return { saved, failed, aborted: true, skipped };
    }
  }
  return { saved, failed, aborted: false, skipped: [] };
}

/**
 * 문자열이고 **보이는 글자가 있으면** 그대로, 아니면 null.
 *
 * ⚠ `length > 0`만 보면 `" "`·`"​"`(제로폭)가 통과해 DB의 `has_visible_char` CHECK에
 *   걸린다 — API 글리치로 실제로 오는 값이다. 여기서는 **후보를 고르는 데만** 쓰고,
 *   최종 계약은 DB가 판정한다.
 * ⚠ 판정을 DB와 완전히 일치시키려 하지 않는다 — `shared/lib/text.ts`의 `hasVisibleChar`가
 *   단일 소스인데 이 스크립트는 Next 밖이라 import할 수 없고, 여기에 3번째 사본을 만들면
 *   그 규약이 조용히 갈린다.
 */
const INVISIBLE = /[\s\u00ad\u180e\u200b-\u200f\u2028\u2029\u2060\ufeff]/gu;
export function str(v) {
  if (typeof v !== "string") return null;
  return v.replace(INVISIBLE, "").length > 0 ? v.trim() : null;
}

/**
 * **코드포인트 단위** 절단 — `.slice()`를 쓰지 않는다.
 *
 * ⚠ `.slice()`는 UTF-16 코드유닛이라 이모지를 반쪽으로 자른다. 실제로 **하이 서로게이트
 *   단독**이 남아 JSON 인코딩이 깨졌고, PostgREST가 payload를 통째로 거부해 **동기화 전체가
 *   죽었다**(실측). `reuse.md`가 `.slice()`를 금지한 그 자리다.
 */
export function clampCp(text, max) {
  const cps = [...text];
  return cps.length <= max ? text : cps.slice(0, max).join("");
}

/**
 * 'Man United' → 'man-united'. `team.code`의 CHECK(`^[a-z][a-z0-9-]*$`)를 만족해야 한다.
 *
 * ⚠ **문자열이 아닐 수 있다.** 이름이 없거나 null·숫자면 `.normalize`에서 `TypeError`로
 *   **동기화 전체가 죽었다**(실측 3종). 결함은 그 팀만 버려야 한다 → null 반환.
 * ⚠ **ASCII가 하나도 안 남으면 다음 후보로 넘어간다.** 비라틴 이름은 슬러그가 빈 문자열이
 *   되어 `t-`·`t--2` 같은 코드가 만들어졌는데(실측), `code`는 **한 번 정해지면 바뀌지 않는
 *   PK**라 마이그레이션 없이 되돌릴 수 없다.
 */
export function slugify(...candidates) {
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
  //   버리면 그 팀의 **경기까지 통째로 사라지므로** 접두어를 붙여 살린다.
  return numericStart ? `t-${numericStart}`.slice(0, 38) : null;
}

/** 파싱되는 시각이면 ISO 문자열로, 아니면 null — 호출부가 폴백을 고른다 */
export function isoOrNull(v) {
  const d = new Date(v ?? "");
  if (Number.isNaN(d.getTime())) return null;
  // ⚠ 범위도 본다 — `"+275760-09-13T…"`는 JS에서 파싱되지만 Postgres가
  //   `time zone displacement out of range`로 거부해 배치 + 왕복 N회를 낭비한다.
  const year = d.getUTCFullYear();
  return year >= 1900 && year <= 2200 ? d.toISOString() : null;
}

/** `--name value` 형태의 인자. ⚠ 값이 없거나 다음 플래그면 null이다 — `true`를 돌려주면
 *  `readFileSync(true)`로 죽고 `--code --remote`는 `"--remote"`를 값으로 읽는다(실측). */
export function flag(argv, name) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return null;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : null;
}

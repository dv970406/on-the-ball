/**
 * 동기화 스크립트가 공유하는 **쓰기 경로와 그 방어**.
 *
 * ⚠ **여기 있는 것은 전부 실측으로 얻은 방어다.** `sync-matches.mjs`가 세 라운드에 걸쳐
 *   쌓은 것을 폴러(`sync-match-detail.mjs`)가 그대로 물려받게 하려고 뺐다 — 사본을 만들면
 *   한쪽만 고쳐지고, 그 순간 폴러는 예전 스크립트가 이미 겪은 실패를 다시 겪는다.
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
  if (out.NEXT_PUBLIC_SUPABASE_URL && out.SUPABASE_SERVICE_ROLE_KEY) return out;

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
 */
export function guardTarget(url, allowRemote) {
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
  if (!isLocal && !allowRemote) {
    console.error(`원격으로 보입니다 — ${url}`);
    console.error("의도한 것이라면 --remote 를 붙이세요.");
    process.exit(1);
  }
}

export function createSyncClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false } });
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
export function isSystemic(error, status) {
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
 * ⚠ **배치 한 번은 SQL 한 문장이라 원자적이다.** 폴러가 라인업 20명을 한 번에 보내는 것이
 *   그 성질에 기대고 있다 — 나눠 보내면 읽는 사람에게 **선수가 6명뿐인 라인업**이 보인다.
 *   행 단위 폴백은 그 원자성을 포기하는 대신 전량 손실을 막는 거래다.
 */
export async function upsertRows(supabase, table, rows, options = {}) {
  if (rows.length === 0) return { saved: [], failed: [], aborted: false, skipped: [] };

  const { error, status } = await supabase.from(table).upsert(rows, options);
  if (!error) return { saved: rows, failed: [], aborted: false, skipped: [] };

  if (isSystemic(error, status)) {
    console.error(
      `✗ ${table} 계통적 실패(${error.code || `HTTP ${status}`}) — 행 단위 재시도를 건너뜁니다`,
    );
    return {
      saved: [],
      failed: rows.map((row) => ({ row, message: error.message })),
      aborted: true,
      skipped: [],
    };
  }

  console.warn(`⚠ ${table} 일괄 저장 실패(${error.message}) — 행 단위로 다시 시도합니다`);
  const saved = [];
  const failed = [];
  for (const [i, row] of rows.entries()) {
    const { error: rowErr, status: rowStatus } = await supabase.from(table).upsert([row], options);
    if (!rowErr) {
      saved.push(row);
      continue;
    }
    failed.push({ row, message: rowErr.message });
    // ⚠ 중단은 **에러의 성격**으로만 판정한다(개수가 아니다 — 사유는 위 주석).
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

/** 스코어로 쓸 수 있는 값인가 — 음이 아닌 정수이고 축구에서 나올 수 있는 범위 */
export function validScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 999;
}

/** `--name value` 형태의 인자. ⚠ 값이 없거나 다음 플래그면 null이다 — `true`를 돌려주면
 *  `readFileSync(true)`로 죽고 `--fixture --remote`는 `"--remote"`를 파일명으로 읽는다(실측). */
export function flag(argv, name) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return null;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : null;
}

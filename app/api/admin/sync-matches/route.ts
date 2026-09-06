import { createClient } from "@supabase/supabase-js";
import { env } from "@/shared/config";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
import type { Database } from "@/types/database.types";
// ⚠ **정적 import다.** `readFileSync("scripts/team-names-ko.json")`은 cwd 상대 경로라
//   서버리스에서 깨지고, 동적 경로라 Next의 outputFileTracing이 `scripts/`를 번들에 넣지
//   않는다. 정적 import면 번들러가 JSON을 모듈로 인라인한다(`resolveJsonModule`이 켜져 있다).
// ⚠ 대가: 매핑을 고치면 **재배포가 필요하다.** `public/crests`와 같은 운영 모델이다.
import namesKo from "../../../../scripts/team-names-ko.json";
import providerIds from "../../../../scripts/team-provider-ids.json";
import { createApiFootball, EPL_LEAGUE_ID } from "../../../../scripts/lib/api-football.mjs";
import { syncSeason } from "../../../../scripts/lib/sync-matches-core.mjs";

/**
 * 경기 일정 가져오기 — **이 앱의 유일한 Route Handler**다.
 *
 * ⚠ 규약(`api-and-db.md`)은 Route Handler를 금지한다. 그 근거는 "중간 검증층 없이 RLS가
 *   방어선"인데, **여기는 데이터 접근이 아니라 외부 API를 서버 비밀로 부르는 자리**라
 *   그 근거가 닿지 않는다. API-Football 키와 service_role 키는 브라우저에 내려갈 수 없다.
 *   예외는 이 경로 하나이고 `scripts/check-conventions.mjs`의 `ROUTE_HANDLER_ALLOWED`가
 *   그 사실을 양방향으로 대조한다.
 *
 * ⚠ **`runtime = "nodejs"`가 필수다.** Edge에는 `node:fs`가 없어 `scripts/lib/*.mjs`
 *   import 자체가 깨진다.
 * ⚠ **`maxDuration`을 명시한다.** 정상 경로는 몇 초지만 `upsertRows`가 일괄 실패하면
 *   행 단위로 재시도한다 — 상한이 없으면 타임아웃이 "부분 적용 + 응답 없음"이 되어
 *   무엇이 저장됐는지 알 길이 없다(그래서 `rowFallbackLimit`도 함께 준다).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 서버리스 시간 상한 안에서 끝나도록 행 단위 폴백을 좁힌다(CLI는 상한이 없다) */
const ROW_FALLBACK_LIMIT = 50;

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  /*
   * 0) Origin 검사.
   * ⚠ Route Handler에는 Server Actions 같은 **내장 CSRF 방어가 없다.** 쿠키 인증 + POST라
   *   크로스사이트 폼 제출로 트리거될 수 있다 — 파괴적이진 않지만 제공자 API 예산을 태운다.
   * ⚠ Origin이 없는 요청(서버 간 호출·curl)은 막지 않는다. 브라우저가 붙이는 헤더라
   *   없다는 것 자체가 크로스사이트가 아니라는 뜻이고, 인가는 아래 세션이 한다.
   */
  const origin = request.headers.get("origin");
  if (origin !== null && !sameOrigin(origin, request)) {
    return json(403, { error: "요청 출처가 올바르지 않아요." });
  }

  // 1) 쿠키 세션 — **anon 키 클라이언트다**(service_role이 아니다)
  const supabase = await createSupabaseServerClient();
  if (!supabase) return json(500, { error: "서비스 설정이 완료되지 않았어요." });

  /*
   * 2) getUser() — getSession()이 아니다. 쿠키의 JWT를 그대로 믿지 않고 GoTrue에 검증한다.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, { error: "로그인이 필요해요." });

  /*
   * 3) 관리자 판정 — **쿠키 클라이언트로** 부른다.
   * ⚠ `profiles`를 직접 select하지 않는다: `is_admin` 컬럼은 SELECT grant 목록 밖이라 42501이다.
   */
  const { data: admin, error: adminError } = await supabase.rpc("is_admin");
  if (adminError) {
    console.error("[api/admin/sync-matches] 관리자 확인 실패:", adminError);
    return json(500, { error: "권한을 확인하지 못했어요." });
  }
  if (admin !== true) return json(403, { error: "관리자만 할 수 있어요." });

  /*
   * 4) ★ **인가가 끝난 뒤에야 처음으로** service_role 클라이언트를 만든다.
   *
   * ⚠ service_role로 관리자 확인을 하면 안 된다 — 그 클라이언트에는 세션이 없어
   *   "누가 요청했는가"를 본문·헤더에서 받아야 하는데 그건 위조된다. definer RPC가
   *   유저 id를 인자로 받지 않는 것과 **글자 그대로 같은 함정**이다.
   * ⚠ 순서 자체가 방어다. 클라이언트를 먼저 만들어 두면 다음 리팩터가 "만들어 두고 나중에
   *   검사"로 바뀌는 순간 인증 없는 쓰기 경로가 된다.
   * ⚠ **`SUPABASE_SERVICE_ROLE_KEY`를 `@/shared/config/env`에 넣지 않는다.** 그 모듈은
   *   클라이언트 번들에 실린다 — 거기 두면 언젠가 누가 클라이언트에서 읽고 프로덕션
   *   마스터 키가 브라우저 번들에 인라인된다.
   */
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!serviceKey || !apiKey) {
    console.error("[api/admin/sync-matches] 동기화 환경변수가 없습니다");
    return json(500, { error: "동기화 설정이 서버에 없어요." });
  }

  const service = createClient<Database>(env.supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  /*
   * 5) 동기화.
   * ⚠ **경고를 삼키지 않는다.** 이 동기화의 운영 정보 전부가 `console.warn`에 있다
   *   (한국어 표기가 없는 팀 · 종료됐는데 스코어를 못 읽은 경기 · 건너뛴 경기) —
   *   삼키면 화면이 "성공"만 말한다.
   */
  const warnings: string[] = [];
  const log = {
    log: (...args: unknown[]) => console.log("[sync-matches]", ...args),
    warn: (...args: unknown[]) => {
      const line = args.map(String).join(" ").trim();
      if (line) warnings.push(line);
      console.warn("[sync-matches]", ...args);
    },
    error: (...args: unknown[]) => {
      const line = args.map(String).join(" ").trim();
      if (line) warnings.push(line);
      console.error("[sync-matches]", ...args);
    },
  };

  try {
    // 시즌은 **시작 연도**다(2026-27 → 2026). 8월 이전이면 지난 시즌이 맞다.
    const now = new Date();
    const season = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

    const api = createApiFootball(apiKey);
    const body = await api.getSeasonFixtures(season);
    const fixtures = Array.isArray(body?.response) ? body.response : null;

    let teamList: unknown[] = [];
    try {
      const teams = await api.get(`/teams?league=${EPL_LEAGUE_ID}&season=${season}`);
      teamList = Array.isArray(teams?.response)
        ? teams.response.map((x: { team: unknown }) => x.team)
        : [];
    } catch (e) {
      // 실패해도 계속 간다 — 한국어 매핑이 있으면 약칭이 거기서 나온다
      log.warn(`팀 목록을 받지 못했습니다(${(e as Error).message}) — 약칭이 이름에서 유도됩니다`);
    }

    const result = await syncSeason({
      supabase: service,
      fixtures,
      teamList,
      namesKo,
      providerIds,
      log,
      rowFallbackLimit: ROW_FALLBACK_LIMIT,
    });

    /*
     * ⚠ **부분 실패를 HTTP 상태로 접지 않는다.** 207 같은 코드로 표현하면 fetch 래퍼가
     *   삼켜 "성공"으로 보인다 — 200 + 명시 필드로 두고 화면이 그 필드를 읽어 알린다.
     *   계통적 실패(`aborted`)만 502다("환경 문제라 남은 행도 전부 실패한다"의 뜻이다).
     */
    const payload = {
      season: `${season}-${String((season + 1) % 100).padStart(2, "0")}`,
      teams: result.teams,
      matches: result.matches,
      api: { used: api.used, dayRemaining: api.budget.dayRemaining },
      warnings,
      durationMs: Date.now() - startedAt,
    };
    return json(result.matches.aborted ? 502 : 200, payload);
  } catch (e) {
    console.error("[api/admin/sync-matches] 동기화 실패:", e);
    return json(502, { error: (e as Error).message || "일정을 가져오지 못했어요." });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** 요청이 우리 사이트에서 왔는가 — `env.siteUrl`이 비어 있을 수 있어 요청 URL도 함께 본다 */
function sameOrigin(origin: string, request: Request): boolean {
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(env.siteUrl).origin);
  } catch {
    // env.siteUrl은 throw하지 않지만 값이 이상하면 여기서 조용히 무시한다
  }
  allowed.add(new URL(request.url).origin);
  return allowed.has(origin);
}

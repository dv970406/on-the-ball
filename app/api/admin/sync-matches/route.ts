import { env } from "@/shared/config";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";
import { json, runSeasonSync } from "../../_lib/run-season-sync";

/**
 * 경기 일정 가져오기 — 어드민 화면의 버튼이 부른다(정기 실행은 `app/api/cron/sync-matches`).
 *
 * ⚠ 규약(`api-and-db.md`)은 Route Handler를 금지한다. 그 근거는 "중간 검증층 없이 RLS가
 *   방어선"인데, **여기는 데이터 접근이 아니라 외부 API를 서버 비밀로 부르는 자리**라
 *   그 근거가 닿지 않는다. API-Football 키와 service_role 키는 브라우저에 내려갈 수 없다.
 *   예외 목록은 `scripts/check-conventions.mjs`의 `ROUTE_HANDLER_ALLOWED`가 양방향으로 대조한다.
 * ⚠ 이 파일은 **인가만** 갖는다. 동기화 본체는 크론과 함께 쓰는 `runSeasonSync`에 있다.
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

export async function POST(request: Request): Promise<Response> {
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
   * 4) ★ **인가가 끝난 뒤에야** 동기화에 들어간다 — service_role 클라이언트는 그 안에서
   *   처음 만들어진다.
   * ⚠ service_role로 관리자 확인을 하면 안 된다 — 그 클라이언트에는 세션이 없어
   *   "누가 요청했는가"를 본문·헤더에서 받아야 하는데 그건 위조된다. definer RPC가
   *   유저 id를 인자로 받지 않는 것과 **글자 그대로 같은 함정**이다.
   */
  const outcome = await runSeasonSync("api/admin/sync-matches");
  if (!outcome.ok) return json(outcome.status, outcome.body);

  /*
   * ⚠ **부분 실패를 HTTP 상태로 접지 않는다.** 207 같은 코드로 표현하면 fetch 래퍼가
   *   삼켜 "성공"으로 보인다 — 200 + 명시 필드로 두고 화면이 그 필드를 읽어 알린다.
   *
   * ⚠⚠ **`aborted`도 200이다.** 그 값이 곧 "환경 문제라 남은 행도 전부 실패했다"는 뜻이
   *   아니다 — `upsertRows`는 **행 단위 재시도 상한을 넘겼을 때도** `aborted`를 켜고,
   *   그때는 이미 저장된 행이 있다(`saved > 0`, 나머지는 `skipped`). 502로 내보내면
   *   클라이언트가 `body.error`만 찾다가 payload를 통째로 버려 "50건 저장, 330건 미시도"가
   *   화면에 **한 글자도 닿지 않고** 고정 문구로 접힌다. 목록 무효화도 일어나지 않는다.
   *   → 계통적 실패는 `runSeasonSync`가 502로 낸다(그쪽은 payload 자체가 없다).
   */
  return json(200, outcome.body);
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

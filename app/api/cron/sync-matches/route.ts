import { timingSafeEqual } from "node:crypto";
import { json, runSeasonSync } from "../../_lib/run-season-sync";

/**
 * 경기 일정 정기 동기화 — **Vercel Cron이 부른다**(스케줄은 루트의 `vercel.json`).
 *
 * ⚠ **어드민 핸들러와 경로를 가른 이유**: 크론 요청에는 관리자 쿠키가 없어 그쪽 인가
 *   (`getUser()` → `is_admin`)를 통과할 수 없다. 한 핸들러에 `CRON_SECRET` 분기를 섞으면
 *   "인가 → 그 뒤에 service_role"이라는 순서가 두 갈래로 얽힌다 → 인가 방법마다 핸들러
 *   하나, 동기화 본체는 `runSeasonSync` 하나다.
 *
 * ⚠ **`GET`이다.** Vercel Cron은 GET으로만 호출한다. 부작용이 있는 GET이지만 `CRON_SECRET`
 *   없이는 아무 일도 하지 않으므로 링크 프리페치·크롤러가 동기화를 일으키지 않는다.
 *
 * ⚠ 스케줄을 촘촘히 하지 않는다. 하루 1회(KST 06시대)면 일정 변경을 받기에 충분하고,
 *   **결과는 이 동기화가 아니라 `scripts/sync-match-detail.mjs`가 쓴다.** Hobby 플랜은
 *   하루 1회까지이고 지정한 시각이 속한 **한 시간 안 어딘가**에 실행된다.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  /*
   * 1) 인가 — Vercel이 `CRON_SECRET` 환경변수를 `Authorization: Bearer …`로 실어 보낸다.
   * ⚠ **시크릿이 없으면 닫는다.** 비어 있을 때 통과시키면 설정 누락 하나로 누구나
   *   API-Football 예산을 태우고 service_role 쓰기를 일으킨다.
   * ⚠ 비교는 상수 시간이다 — `===`는 앞에서부터 어긋나는 순간 멈춰 응답 시간으로
   *   시크릿이 한 글자씩 새어 나간다.
   */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[api/cron/sync-matches] CRON_SECRET이 없습니다");
    return json(500, { error: "크론 설정이 서버에 없어요." });
  }
  if (!matchesSecret(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return json(401, { error: "인증이 필요해요." });
  }

  // 2) ★ 인가가 끝난 뒤에야 동기화에 들어간다 — service_role 클라이언트는 그 안에서 만들어진다
  const outcome = await runSeasonSync("api/cron/sync-matches");
  if (!outcome.ok) return json(outcome.status, outcome.body);

  /*
   * ⚠ **부분 실패는 500이다 — 어드민 핸들러와 반대다.** 저쪽은 화면이 payload를 읽어
   *   "몇 건 저장, 몇 건 실패"를 그리지만, 크론에는 읽는 화면이 없어 **상태 코드가 유일한
   *   신호**다. 200으로 두면 Vercel 대시보드에 초록으로 지나가 아무도 눈치채지 못한다
   *   (CLI가 같은 이유로 종료 코드를 올린다). payload는 그대로 실어 로그에서 읽게 한다.
   */
  return json(outcome.hadFailure ? 500 : 200, outcome.body);
}

function matchesSecret(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual은 길이가 다르면 throw한다 — 길이는 숨길 대상이 아니다
  return a.length === b.length && timingSafeEqual(a, b);
}

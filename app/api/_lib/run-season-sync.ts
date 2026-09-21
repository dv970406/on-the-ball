import { createClient } from "@supabase/supabase-js";
import { env } from "@/shared/config";
import type { Database } from "@/types/database.types";
// ⚠ **정적 import다.** `readFileSync("scripts/team-names-ko.json")`은 cwd 상대 경로라
//   서버리스에서 깨지고, 동적 경로라 Next의 outputFileTracing이 `scripts/`를 번들에 넣지
//   않는다. 정적 import면 번들러가 JSON을 모듈로 인라인한다(`resolveJsonModule`이 켜져 있다).
// ⚠ 대가: 매핑을 고치면 **재배포가 필요하다.** `public/crests`와 같은 운영 모델이다.
import namesKo from "../../../scripts/team-names-ko.json";
import providerIds from "../../../scripts/team-provider-ids.json";
import { createApiFootball, EPL_LEAGUE_ID } from "../../../scripts/lib/api-football.mjs";
import { syncSeason } from "../../../scripts/lib/sync-matches-core.mjs";

/** 서버리스 시간 상한 안에서 끝나도록 행 단위 폴백을 좁힌다(CLI는 상한이 없다) */
const ROW_FALLBACK_LIMIT = 50;

/**
 * 시즌 일정 동기화 본체 — 어드민 버튼(`app/api/admin/sync-matches`)과 Vercel Cron
 * (`app/api/cron/sync-matches`)이 함께 부른다. **인가는 여기 없다.**
 *
 * ⚠⚠ **인가가 끝난 뒤에만 부른다.** 이 함수가 처음으로 service_role 클라이언트를 만든다 —
 *   두 핸들러가 인가 방법(관리자 세션 ↔ `CRON_SECRET`)만 다르고 "인가 → 그 뒤에 service_role"
 *   순서는 같아야 해서, 인가를 호출부에 남기고 그 뒤를 여기로 모았다. 여기에 인가를 섞으면
 *   두 경로의 판정이 한 함수 안에서 갈라져 순서가 방어라는 사실이 흐려진다.
 * ⚠ **`SUPABASE_SERVICE_ROLE_KEY`를 `@/shared/config/env`에 넣지 않는다.** 그 모듈은
 *   클라이언트 번들에 실린다 — 거기 두면 프로덕션 마스터 키가 브라우저 번들에 인라인된다.
 */
export async function runSeasonSync(tag: string): Promise<SeasonSyncOutcome> {
  const startedAt = Date.now();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!serviceKey || !apiKey) {
    console.error(`[${tag}] 동기화 환경변수가 없습니다`);
    return { ok: false, status: 500, body: { error: "동기화 설정이 서버에 없어요." } };
  }

  const service = createClient<Database>(env.supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  /*
   * ⚠ **경고를 삼키지 않는다.** 이 동기화의 운영 정보 전부가 `console.warn`에 있다
   *   (한국어 표기가 없는 팀 · 종료됐는데 스코어를 못 읽은 경기 · 건너뛴 경기) —
   *   삼키면 화면이 "성공"만 말한다.
   */
  const warnings: string[] = [];
  const log = {
    log: (...args: unknown[]) => console.log(`[${tag}]`, ...args),
    warn: (...args: unknown[]) => {
      const line = args.map(String).join(" ").trim();
      if (line) warnings.push(line);
      console.warn(`[${tag}]`, ...args);
    },
    error: (...args: unknown[]) => {
      const line = args.map(String).join(" ").trim();
      if (line) warnings.push(line);
      console.error(`[${tag}]`, ...args);
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

    return {
      ok: true,
      // CLI의 종료 코드와 같은 판정이다(`scripts/sync-matches.mjs`)
      hadFailure: Boolean(result.hadFailure || result.matches.aborted),
      body: {
        season: `${season}-${String((season + 1) % 100).padStart(2, "0")}`,
        teams: result.teams,
        matches: result.matches,
        api: { used: api.used, dayRemaining: api.budget.dayRemaining },
        warnings,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (e) {
    console.error(`[${tag}] 동기화 실패:`, e);
    return {
      ok: false,
      status: 502,
      body: { error: (e as Error).message || "일정을 가져오지 못했어요." },
    };
  }
}

/**
 * ⚠ **부분 실패(`hadFailure`)를 상태 코드로 접을지는 호출부가 정한다.** 어드민 화면은 200 +
 *   payload로 받아 무엇이 저장됐는지를 그려야 하고, 크론은 읽는 화면이 없어 상태 코드가
 *   유일한 신호다 — 소비자가 다르니 판정도 다르다.
 */
export type SeasonSyncOutcome =
  | { ok: true; hadFailure: boolean; body: Record<string, unknown> }
  | { ok: false; status: number; body: { error: string } };

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

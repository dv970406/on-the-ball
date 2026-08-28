import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/shared/config";
import type { Database } from "@/types/database.types";

/**
 * 익명 응답의 Data Cache 수명(초).
 *
 * `src/app/providers.tsx`의 TanStack `staleTime`과 **같은 값**이다 — 두 캐시가 서로 다른 나이를
 * 약속하면 같은 목록이 어느 캐시를 거쳤느냐에 따라 다르게 보인다.
 *
 * ⚠ 여기에 Next Router Cache(`staleTimes.dynamic`)를 합류시키지 않는다 — 그건 URL로만 키가
 *   잡혀 세션 데이터가 샌다(`nextjs.md`의 "Router Cache는 열지 않는다").
 */
export const ANON_REVALIDATE = 30;

/**
 * 세션 없는 서버용 supabase 클라이언트 — **응답이 모든 익명 요청에 동일할 때만** 쓴다.
 *
 * 쿠키를 읽지 않으므로 `auth.uid()`가 null이다. 그러면 `is_blocked()`가 항상 false이고
 * `post_like` 임베딩은 빈 배열이라, 이 클라이언트가 받는 응답은 **크롤러가 받는 것과 같다.**
 * 요청마다 다시 조회할 이유가 없으므로 fetch를 Next Data Cache에 태운다.
 *
 * 갈림길의 근거: SSR이 필요한 요청(크롤러)과 응답이 사용자별인 요청(로그인)은 **같은 요청이
 * 아니다.** 크롤러는 로그인하지 않으므로 색인 대상 렌더는 언제나 익명 렌더이고, 익명 렌더는
 * 사용자별이 아니라서 통째로 캐시할 수 있다.
 *
 * ⚠ **브라우저 클라이언트를 이것으로 바꾸지 말 것.** `api-and-db.md`가 금지하는 것은
 *   *브라우저에서* `createClient`를 쓰는 것이다(세션이 localStorage로 가서 `proxy.ts`가
 *   쿠키를 읽지 못해 서버 가드가 통째로 무력화된다). 여기는 서버이고 **세션이 없는 것이
 *   목적**이라 사정이 정반대다.
 * ⚠ `next/headers`에 의존하지는 않지만 Data Cache가 서버 전용이라 배럴에 싣지 않는다 —
 *   `supabase-server`와 같은 이유로 직접 경로(`@/shared/api/supabase-anon`)로 가져간다.
 */
export function createSupabaseAnonClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;

  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    // 서버에는 저장소가 없다 — 세션을 만들지도 갱신하지도 않는다
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next가 패치한 전역 fetch가 `next.revalidate`를 읽어 Data Cache에 태운다.
      // GET만 캐시되는데 목록 조회(`.select()`)가 곧 GET이다.
      fetch: (input, init) => fetch(input, { ...init, next: { revalidate: ANON_REVALIDATE } }),
    },
  });
}

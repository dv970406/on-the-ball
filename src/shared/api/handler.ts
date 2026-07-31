import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase-server";

/** 개인화 응답(myVote·내 프로필 등)이 공유 캐시/브라우저에 남지 않도록 기본 차단 */
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** 성공 응답 — { data } 규격 */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    { data },
    { ...init, headers: { ...NO_STORE, ...init?.headers } },
  );
}

/** 실패 응답 — { error } 규격 */
export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/** Supabase env 미설정 시 503 안내 (빌드는 성공, 요청 시점에만 실패) */
function supabaseNotConfigured() {
  return fail(
    503,
    "Supabase 환경변수가 설정되지 않았어요. .env.local을 채운 뒤 다시 시도해 주세요.",
  );
}

interface HandlerContext {
  supabase: SupabaseClient;
  /** 익명 로그인 세션의 유저 (없으면 null) */
  user: User | null;
}

/**
 * Route Handler 공통 진입 헬퍼.
 * env 가드 → 서버 클라이언트 생성 → 세션 유저 조회까지 처리한다.
 */
export async function withSupabase(
  run: (ctx: HandlerContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  // 클라이언트 생성·세션 조회까지 try 안에 둔다 — Supabase auth 장애로 여기서 throw하면
  // { error } 규격 대신 Next 기본 500 HTML이 나가 apiFetch가 메시지를 잃는다.
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return supabaseNotConfigured();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    return await run({ supabase, user });
  } catch (e) {
    // cookies()의 동적 렌더 전환·notFound()·redirect()는 Next가 제어 흐름으로 쓰는 내부 에러다.
    // 삼키면 라우트가 정적으로 굳거나 리다이렉트가 500으로 바뀌므로 그대로 되던진다.
    unstable_rethrow(e);
    console.error("[api] 처리 중 오류:", e);
    return fail(500, "서버 처리 중 오류가 발생했어요.");
  }
}

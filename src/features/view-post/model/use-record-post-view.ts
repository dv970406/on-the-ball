"use client";

import { useEffect } from "react";
import { getBrowserSupabase } from "@/shared/api";

/** 이번 브라우징 세션에서 이미 센 글 — sessionStorage 키 접두사 */
const SEEN_KEY_PREFIX = "otb:viewed:";

/**
 * 상세 진입 시 조회수 +1.
 *
 * ⚠ **sessionStorage로 글당 1회만 센다.** useRef 가드로는 부족하다 —
 *   React StrictMode가 개발 모드에서 effect를 2회 실행하고, 뒤로가기로 돌아오면
 *   컴포넌트가 다시 마운트되어 ref도 새로 만들어진다. 남용 방지가 아니라
 *   **정상 사용자의 중복 카운트 방지**가 목적이다(DB 쪽 위조는 애초에 막지 않는다 —
 *   마이그레이션의 increment_post_view 주석 참고).
 *
 * ⚠ 실패는 삼킨다(console.error만). 조회수 증가가 안 됐다고 상세 화면에
 *   에러 배너가 뜨면 안 된다. 그래서 TanStack mutation이 아니라 effect다 —
 *   화면에 노출할 로딩·에러 상태가 존재하지 않는다.
 *
 * ⚠ 캐시를 무효화하지 않는다. 지금 보고 있는 글의 조회수가 내 클릭으로 +1 되어
 *   눈앞에서 올라가는 것은 프로토타입에 없는 동작이고, 리페치 한 번을 더 부를 이유도 없다.
 */
export function useRecordPostView(postId: number) {
  useEffect(() => {
    if (!Number.isSafeInteger(postId) || postId <= 0) return;

    const key = `${SEEN_KEY_PREFIX}${postId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // 프라이빗 모드 등으로 sessionStorage가 막혀 있으면 중복 방지를 포기하고 그냥 센다
    }

    const supabase = getBrowserSupabase();
    if (!supabase) return;

    void supabase.rpc("increment_post_view", { p_post_id: postId }).then(({ error }) => {
      if (error) console.error("[post] 조회수 증가 실패:", error);
    });
  }, [postId]);
}

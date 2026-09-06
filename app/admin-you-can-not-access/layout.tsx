import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { createSupabaseServerClient } from "@/shared/api/supabase-server";

export const metadata: Metadata = {
  /*
   * ⚠ **`title`을 여기 두지 않는다.** 이 layout은 비관리자에게 `notFound()`를 던지는데,
   *   그러면 page의 metadata는 해석되지 않고 **layout의 것만 남아** 404 화면의 제목이
   *   다른 경로의 404와 달라진다(실측: 임의 경로는 `페이지를 찾을 수 없어요 | 온더볼`,
   *   여기는 `페이지를 찾을 수 없어요` — 접미사 유무가 곧 "이 경로에 layout이 있다"는
   *   신호다). 제목은 각 page가 갖는다 — 통과한 뒤에만 해석되므로 새지 않는다.
   */
  /*
   * ⚠ **`robots.txt`에는 적지 않는다.** 크롤을 막는 것과 색인을 막는 것은 다른 일이고,
   *   경로를 robots.txt에 쓰는 순간 그 파일이 경로를 **공개한다**. 여기 `noindex`가
   *   유일하고 충분한 색인 차단이다(크롤러는 아래 가드 때문에 404만 본다).
   */
  robots: { index: false, follow: false },
};

/**
 * 관리자 판정.
 *
 * ⚠ **`getUser()`가 아니라 `rpc("is_admin")`이다.** 그 함수가 `auth.uid()`를 직접 보므로
 *   GoTrue 왕복 없이 PostgREST 한 번으로 끝난다(proxy가 이미 같은 요청에서 세션을 갱신했다).
 * ⚠ 요청 API(`cookies()`)를 try/catch로 감쌌으니 **`unstable_rethrow`가 필수**다 —
 *   Next 내부의 "동적 렌더로 전환" 에러를 삼키면 이 라우트가 **조용히 정적 프리렌더된다**
 *   (빌드는 성공하므로 `ƒ`/`○` 표기로만 드러난다).
 */
async function isAdmin(): Promise<"admin" | "denied" | "unknown"> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return "unknown";

    const { data, error } = await supabase.rpc("is_admin");
    if (error) {
      console.error("[admin] 관리자 확인 실패:", error);
      return "unknown";
    }
    return data === true ? "admin" : "denied";
  } catch (e) {
    unstable_rethrow(e);
    console.error("[admin] 관리자 확인 실패:", e);
    return "unknown";
  }
}

/**
 * 어드민 라우트 가드.
 *
 * ⚠ **리다이렉트가 아니라 `notFound()`다.** proxy에서 라우트 가드를 걷어낸 이유가
 *   "판정자가 둘이면 무한 리다이렉트가 된다"인데, 404는 이동이 아니라 루프가 생기지 않는다.
 *   덤으로 비관리자에게 이 경로의 **존재 자체가 드러나지 않는다.**
 * ⚠ 조회 실패(`unknown`)도 404로 보낸다 — 글 상세는 "일시 장애로 멀쩡한 글을 404로 단정하지
 *   않는다"가 맞지만, 여기서는 **열어 두는 쪽이 위험하다.**
 * ⚠ 화면 차단은 안내일 뿐이고 실제 방어는 어드민 RPC 안의 `is_admin()`이다.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if ((await isAdmin()) !== "admin") notFound();
  return children;
}

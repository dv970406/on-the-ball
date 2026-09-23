import type { Metadata } from "next";
import { AuthRequired } from "@/entities/session";
import { ProfileView } from "@/views/profile";

export const metadata: Metadata = {
  title: "프로필",
  // 로그인 필수 + 개인 화면이라 색인 대상이 아니다
  robots: { index: false, follow: false },
};

/**
 * ⚠ **이 페이지는 OAuth 복귀 지점이다.** `linkIdentity`가 프로바이더를 거쳐 `?code=`(성공) 또는
 *   `?error=`(동의 취소 등)를 달고 여기로 돌아온다. `/sign-in`과 마찬가지로 **서버가 판정해
 *   props로 내린다** — 클라이언트 effect에서 URL을 읽으면 서버 HTML과 첫 렌더가 달라져
 *   하이드레이션 불일치(React #418)가 난다(로그인 화면에서 실제로 겪었다).
 */
export default async function Page(props: PageProps<"/profile">) {
  const params = await props.searchParams;
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? null;

  return (
    <AuthRequired>
      <ProfileView
        // 코드 교환은 createBrowserClient의 detectSessionInUrl이 한다.
        // 교환이 끝나야 첫 인증 이벤트가 와서 `AuthRequired`가 화면을 연다 — 그래서 연결 목록은
        // 교환 **뒤에** 처음 조회되어 새 수단을 담는다(프로바이더를 다녀온 전체 로드라 캐시도 새것이다).
        // 같은 유저의 SIGNED_IN은 캐시를 무효화하지 않으므로 거기에 기대지 않는다(`use-session-sync`).
        linkPending={first(params.code) !== null}
        // ⚠ `error`는 상위 분류, `error_code`가 구체 사유다 — 둘 다 내려야 한국어 문구가 붙는다
        errorKind={first(params.error)}
        errorCode={first(params.error_code)}
        errorDescription={first(params.error_description)}
      />
    </AuthRequired>
  );
}

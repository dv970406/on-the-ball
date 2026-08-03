import type { Metadata } from "next";
import { ForgetPasswordView } from "@/views/forget-password";

export const metadata: Metadata = { title: "비밀번호 찾기" };

/**
 * ⚠ /reset-password와 같은 이유로 (auth) 그룹 밖에 둔다.
 *   전에는 GuestOnly 아래에 있어서 **로그인한 사용자가 비밀번호를 바꿀 방법이 아예 없었다** —
 *   /reset-password는 복구 링크로만 열리는데(reset-password-view 주석 참고)
 *   그 링크를 요청하는 화면에 진입조차 못 했기 때문이다.
 *   로그인 상태에서 재설정 링크를 요청하는 것은 정상적인 흐름이므로 가드를 걷어낸다.
 */
export default function Page() {
  return <ForgetPasswordView />;
}

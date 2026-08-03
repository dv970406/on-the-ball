import type { Metadata } from "next";
import { ResetPasswordView } from "@/views/reset-password";

export const metadata: Metadata = { title: "비밀번호 재설정" };

/**
 * ⚠ (auth) 그룹 밖에 둔다 — 메일 링크로 들어오면 이미 세션이 있는 상태이므로
 *   GuestOnly 아래에서는 곧바로 튕겨나간다. 화면 자체가 status로 분기한다.
 */
export default function Page() {
  return <ResetPasswordView />;
}

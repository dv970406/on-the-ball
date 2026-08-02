import type { Metadata } from "next";
import { ForgetPasswordView } from "@/views/forget-password";

export const metadata: Metadata = { title: "비밀번호 찾기 · 온더볼" };

export default function Page() {
  return <ForgetPasswordView />;
}

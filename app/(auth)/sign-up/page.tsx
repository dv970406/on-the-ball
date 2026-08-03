import type { Metadata } from "next";
import { SignUpView } from "@/views/sign-up";

export const metadata: Metadata = { title: "회원가입" };

export default function Page() {
  return <SignUpView />;
}

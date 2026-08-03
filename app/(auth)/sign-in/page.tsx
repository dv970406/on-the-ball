import type { Metadata } from "next";
import { SignInView } from "@/views/sign-in";

export const metadata: Metadata = { title: "로그인" };

/**
 * 로그인 후 목적지(?next=)는 SignInView가 아니라 (auth)/layout의 GuestOnly가 정한다.
 * 뷰는 폼과 링크만 담당한다.
 */
export default function Page() {
  return <SignInView />;
}

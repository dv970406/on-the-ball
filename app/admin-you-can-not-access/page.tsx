import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/config";

/** 어드민 첫 화면은 승부예측이다 — 운영 중 가장 자주 여는 곳이다 */
export default function Page() {
  redirect(ROUTES.adminMatchList);
}

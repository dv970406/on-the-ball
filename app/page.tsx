import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/config";

/** 홈은 게시판 목록으로 보낸다 — 현재 앱의 진입 화면은 /posts 하나다 */
export default function Page() {
  redirect(ROUTES.postList);
}

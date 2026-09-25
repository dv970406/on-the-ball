import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/config";

/** 홈은 이적시장 보드로 보낸다 — 현재 앱의 진입 화면은 /transfers 하나다 */
export default function Page() {
  redirect(ROUTES.transferList);
}

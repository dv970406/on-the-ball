import type { Metadata } from "next";
import { ROUTES, pageMetadata } from "@/shared/config";
import { PrivacyView } from "@/views/privacy";

const TITLE = "개인정보처리방침";
const DESCRIPTION = "온더볼이 처리하는 개인정보의 항목·목적·보유 기간과 이용자의 권리를 안내합니다.";

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: ROUTES.privacy });

/**
 * 정적 문서 — 조회도 쿠키도 없어 빌드 로그에 `○`(정적)로 찍히는 것이 정상이다.
 * ⚠ 색인을 막지 않는다 — 공개 의무가 있는 문서이고, 애드센스 심사도 이 주소를 찾는다.
 */
export default function Page() {
  return <PrivacyView />;
}

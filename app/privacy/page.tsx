import type { Metadata } from "next";
import { OG_IMAGE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
import { PrivacyView } from "@/views/privacy";

const TITLE = "개인정보처리방침";
const DESCRIPTION = "온더볼이 처리하는 개인정보의 항목·목적·보유 기간과 이용자의 권리를 안내합니다.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.privacy },
  // ⚠ openGraph를 채우는 순간 루트 이미지 상속이 사라지므로 `images`를 함께 명시한다
  openGraph: {
    ...OG_SITE,
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(ROUTES.privacy),
    images: OG_IMAGE,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: OG_IMAGE },
};

/**
 * 정적 문서 — 조회도 쿠키도 없어 빌드 로그에 `○`(정적)로 찍히는 것이 정상이다.
 * ⚠ 색인을 막지 않는다 — 공개 의무가 있는 문서이고, 애드센스 심사도 이 주소를 찾는다.
 */
export default function Page() {
  return <PrivacyView />;
}

import type { Metadata } from "next";
import { OG_IMAGE, OG_SITE, ROUTES, absoluteUrl } from "@/shared/config";
import { AboutView } from "@/views/about";

const TITLE = "서비스 소개";
const DESCRIPTION = "온더볼이 이적 보도를 어떻게 모으고, 딜로 묶고, 단계와 출처 공신력을 판정하는지 소개합니다.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.about },
  // ⚠ openGraph를 채우는 순간 루트 이미지 상속이 사라지므로 `images`를 함께 명시한다
  openGraph: {
    ...OG_SITE,
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(ROUTES.about),
    images: OG_IMAGE,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: OG_IMAGE },
};

/** 정적 문서 — 조회도 쿠키도 없어 빌드 로그에 `○`(정적)로 찍히는 것이 정상이다 */
export default function Page() {
  return <AboutView />;
}

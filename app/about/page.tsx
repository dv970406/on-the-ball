import type { Metadata } from "next";
import { ROUTES, pageMetadata } from "@/shared/config";
import { AboutView } from "@/views/about";

const TITLE = "서비스 소개";
const DESCRIPTION = "온더볼이 이적 보도를 어떻게 모으고, 딜로 묶고, 단계와 출처 공신력을 판정하는지 소개합니다.";

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: ROUTES.about });

/** 정적 문서 — 조회도 쿠키도 없어 빌드 로그에 `○`(정적)로 찍히는 것이 정상이다 */
export default function Page() {
  return <AboutView />;
}

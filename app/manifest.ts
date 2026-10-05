import type { MetadataRoute } from "next";
import { ROUTES, TOKEN_COLORS } from "@/shared/config";

/**
 * 웹 앱 매니페스트 — 홈 화면에 추가했을 때의 이름·아이콘·첫 화면.
 *
 * **아이폰·아이패드는 홈 화면에 추가한 앱에서만 웹 푸시가 된다**(iOS 16.4 이상) — 알림 기능의 전제라 둔다.
 * 안드로이드·데스크톱은 설치 없이도 알림이 되지만, 설치하면 알림에 사이트 주소 대신 앱 이름이 붙는다.
 *
 * ⚠ `start_url`은 `/`가 아니라 이적시장이다 — `/`는 화면이 아니라 리다이렉트라(`app/page.tsx`) 앱을 열 때마다
 *   왕복이 하나 붙는다. 진입 화면을 바꾸면 여기도 함께 고친다(`nextjs.md` 라우트 그룹 절).
 * ⚠ 아이콘은 셋이다 — 일반(192·512, 둥근 타일)과 마스커블(512, **모서리를 둥글리지 않은 전면 채움**).
 *   마스커블에 둥근 타일을 넣으면 OS의 마스크와 겹쳐 모서리가 두 번 깎인다(`apple-icon`과 같은 사정 — `nextjs.md`).
 *   `public/icons/`의 PNG는 아이콘 키트(SVG)에서 뽑은 생성물이다.
 * ⚠ 색은 토큰과 같은 값의 상수다 — 브라우저가 CSS 밖에서 읽는 JSON이라 클래스·변수를 쓸 수 없다.
 * ⚠ 문구는 루트 layout의 `description`과 같은 문장이다 — 그 주석이 같은 문장을 쓰는 자리를 적어 두었다(갈리면
 *   설치 화면만 옛 톤으로 남는다).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "온더볼",
    short_name: "온더볼",
    description: "유럽 5대 리그 이적 소식을 한곳에서",
    lang: "ko",
    start_url: ROUTES.transferList,
    scope: "/",
    display: "standalone",
    background_color: TOKEN_COLORS.canvas,
    theme_color: TOKEN_COLORS.canvas,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

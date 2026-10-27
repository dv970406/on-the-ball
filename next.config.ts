import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * 엠블럼 폴더의 **내용 지문** — 엠블럼 주소에 `?v=`로 붙는다(`TransferCrest`). 파일을 더하거나 바꾸면 값이 바뀌어 주소가 바뀐다.
 *
 * ⚠ 엠블럼 응답에는 30일 캐시가 붙는데(아래 `headers`) Next의 헤더 설정은 **응답 코드를 가리지 않아** 404에도 같이 붙는다 — 없는
 *   엠블럼을 한 번 요청한 브라우저는 나중에 그 파일을 넣어도 30일 동안 옛 404를 쓰고 모노그램을 그렸다(운영 실측). 주소가 바뀌면
 *   옛 응답을 쓰지 않는다.
 * ⚠ 수정 시각이 아니라 **내용**으로 만든다 — 배포는 저장소를 새로 받아 빌드해 수정 시각이 매번 달라진다(그러면 배포마다 모든
 *   엠블럼 캐시가 버려진다).
 */
function crestVersion(): string {
  const dir = join(process.cwd(), "public/crests");
  const hash = createHash("sha1");
  for (const file of readdirSync(dir).sort()) {
    hash.update(file);
    hash.update(readFileSync(join(dir, file)));
  }
  return hash.digest("hex").slice(0, 10);
}

const nextConfig: NextConfig = {
  // 굳이 프레임워크와 버전대를 알려줄 이유가 없다 (X-Powered-By: Next.js)
  poweredByHeader: false,

  // 빌드 시점에 인라인되는 값 — 읽는 자리는 `@/shared/config`의 `env.crestVersion` 하나다
  env: { NEXT_PUBLIC_CREST_VERSION: crestVersion() },

  /*
   * 딜 공유 카드(`app/transfers/[id]/opengraph-image.tsx`)가 런타임에 파일로 읽는 자산.
   *
   * ⚠ **여기서 빠지면 로컬은 멀쩡하고 배포에서만 깨진다.** 그 라우트는 폰트·마크·엠블럼을
   *   `process.cwd()` 기준으로 읽는데, 엠블럼 경로는 구단 코드로 조립해 빌드의 파일 추적이 따라가지 못한다.
   *   카드가 읽는 파일을 더하면 여기도 함께 더한다.
   * ⚠ 키는 **라우트 경로의 글로브**다 — 대괄호는 글로브 문법이라 동적 세그먼트 자리를 `*`로 적는다.
   */
  outputFileTracingIncludes: {
    "/transfers/*/opengraph-image": [
      "./src/app/fonts/og/**",
      "./public/crests/**",
      "./app/icon.svg",
      "./app/opengraph-image.png",
    ],
  },

  async headers() {
    return [
      {
        /*
         * 서비스 워커(`public/sw.js` — 웹 푸시 알림 전용).
         *
         * ⚠ **캐시하지 않는다.** 워커는 브라우저가 한 번 깔면 스스로 바꿔 주지 않고, 새 스크립트를 받아야만
         *   갈아 끼운다 — 캐시에 걸리면 고친 워커(알림 문구·눌렀을 때 여는 주소)가 그만큼 늦게 닿는다.
         * ⚠ CSP는 **이 파일에만** 건다 — 워커가 다른 출처의 스크립트를 끌어오지 못하게 한다(Next 16의 PWA 가이드).
         */
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        // 자체 호스팅 Pretendard 서브셋 — 파일명이 버전 고정이라 불변 캐시 안전
        source: "/fonts/pretendard/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        /*
         * 구단 엠블럼(`scripts/fetch-team-crests.mjs`가 만들어 커밋한다).
         *
         * ⚠ **`immutable`을 쓰지 않는다.** 화면은 `?v=`(폴더 지문 — 위 `crestVersion`)를 붙여 부르지만 공유 카드·직접 링크처럼
         *   붙이지 않는 길도 있다. 30일은 제공자 CDN이 원본에 거는 값과 같다.
         * ⚠ 이 헤더는 **404에도 붙는다**(헤더 설정은 응답 코드를 가리지 않는다) — 없는 엠블럼의 404가 30일 캐시된다. 화면이 `?v=`를 붙이는
         *   이유이고, 엠블럼을 더하면 지문이 바뀌어 옛 404를 쓰지 않는다.
         */
        source: "/crests/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 굳이 프레임워크와 버전대를 알려줄 이유가 없다 (X-Powered-By: Next.js)
  poweredByHeader: false,

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
         * ⚠ **`immutable`을 쓰지 않는다.** 파일명이 팀 코드라 버전이 박혀 있지 않다 —
         *   구단이 엠블럼을 바꿔 파일을 갈아끼워도 이름은 그대로이므로, 불변으로 걸면
         *   1년 동안 옛 로고가 남는다. 30일은 제공자 CDN이 원본에 거는 값과 같다.
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

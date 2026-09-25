import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 굳이 프레임워크와 버전대를 알려줄 이유가 없다 (X-Powered-By: Next.js)
  poweredByHeader: false,

  async headers() {
    return [
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

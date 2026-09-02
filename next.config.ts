import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 굳이 프레임워크와 버전대를 알려줄 이유가 없다 (X-Powered-By: Next.js)
  poweredByHeader: false,

  images: {
    /*
     * 선수·감독 사진(`entities/match`의 `PlayerPhoto`).
     *
     * ⚠ **최적화 파이프라인을 태우려고 등재한다.** 제공자 원본이 150×150 PNG(평균 28KB)인데
     *   화면은 36·24px로 그려서 한 경기 라인업 40장이 **1.07MB**로 나갔다. 그 CDN은
     *   `?width=`·`?w=`·`?tr=` 같은 리사이즈 파라미터를 **전부 403으로 거부**하고 `Accept`로
     *   포맷 협상도 하지 않는다(실측) — 우리가 줄이는 것 말고 방법이 없다.
     *
     * ⚠ **구단 엠블럼(`/crests`)은 여기 해당하지 않는다.** 그건 이미 우리가 128px로 줄여
     *   커밋한 자산이라 파이프라인이 줄 이득이 없어 `<img>`로 그대로 서빙한다.
     *
     * ⚠ 호스트를 **정확히** 못박는다 — 와일드카드로 열면 임의 원격 이미지를 우리 도메인에서
     *   서빙하는 오픈 프록시가 된다.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/**",
      },
    ],
  },

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

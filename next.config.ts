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
    ];
  },
};

export default nextConfig;

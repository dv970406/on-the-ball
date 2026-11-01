import { useEffect } from "react";
import { PRETENDARD_CACHED_KEY, PRETENDARD_CSS } from "@/app/fonts";

/**
 * 첫 방문의 Pretendard — 하이드레이션 뒤에 폰트 CSS를 붙여, 조각들이 JS와 대역폭을 다투지 않게 한다(사유는 `fonts.ts`).
 * 재방문이라 머리의 인라인 스크립트가 이미 붙였으면 아무것도 하지 않는다.
 * ⚠ 표식은 본문 조각이 **실제로 도착한 뒤에** 남긴다(`document.fonts.load`) — 스타일시트만 받고 남기면 다음 방문이 받지도 않은
 *   폰트를 첫 페인트 전에 깨워 다시 JS와 다툰다.
 */
export function useDeferredPretendard() {
  useEffect(() => {
    if (document.querySelector(`link[href="${PRETENDARD_CSS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = PRETENDARD_CSS;
    link.addEventListener(
      "load",
      () => {
        document.fonts
          .load('16px "Pretendard Variable"', "가나다")
          .then((faces) => {
            if (faces.length === 0) return;
            try {
              localStorage.setItem(PRETENDARD_CACHED_KEY, "1");
            } catch {
              // 저장소를 쓸 수 없으면 다음 방문도 첫 방문처럼 늦게 붙는다
            }
          })
          .catch(() => {});
      },
      { once: true },
    );
    document.head.appendChild(link);
  }, []);
}

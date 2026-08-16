"use client";

import { useToast } from "@/shared/lib";

/**
 * 현재 화면의 링크 공유 — Web Share API가 있으면 OS 시트, 없으면 클립보드 복사.
 *
 * ⚠ **결과를 반드시 알린다.** 클립보드 폴백은 화면이 전혀 변하지 않아서, 토스트가 없으면
 *   눌러도 아무 일도 안 일어난 것처럼 보인다(앱의 다른 액션은 전부 토스트를 띄운다).
 * ⚠ `navigator.clipboard`는 **보안 컨텍스트에서만 존재한다.** http로 붙는 실기기 테스트
 *   (`http://192.168.x.x`)에서는 undefined라 그냥 두면 TypeError가 catch에 삼켜져 무반응이 된다.
 * ⚠ 사용자가 OS 공유 시트를 **취소하면 `AbortError`** 가 난다 — 이건 실패가 아니므로
 *   조용히 넘긴다. 구분하지 않으면 취소할 때마다 실패 토스트가 뜬다.
 */
export function useShareLink(title: string) {
  const toast = useToast();

  return async () => {
    const url = window.location.href;

    // ⚠ 공유 시트가 **있다고 성공하는 것은 아니다.** 권한 정책·비보안 컨텍스트·임베드에서는
    //   NotAllowedError로 거절된다. 전에는 이 경우에도 클립보드로 내려가지 못해
    //   "링크를 복사하지 못했어요"로 끝났다 — 복사는 시도조차 안 한 채였다.
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        // 사용자가 시트를 닫은 것은 실패가 아니다 — 여기서 폴백하면 원치 않은 복사가 된다
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("[share] 공유 시트 실패 — 클립보드로 폴백:", e);
      }
    }

    try {
      // navigator.clipboard는 보안 컨텍스트에서만 존재한다(http 실기기 테스트에서 undefined) —
      // 그냥 두면 TypeError가 catch에 삼켜져 무반응이 된다
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      toast("링크를 복사했어요");
    } catch (e) {
      console.error("[share] 링크 복사 실패:", e);
      toast("링크를 복사하지 못했어요");
    }
  };
}

"use client";

import { env } from "@/shared/config";
import { track, useToast } from "@/shared/lib";
import { preloadKakao, shareToKakao } from "./kakao-share";
import { shareUrl } from "./share-url";

/**
 * 분석용 분류 — 딜 상세의 공유가 이 버튼의 본래 쓰임이고, 그 밖의 화면은 한데 묶는다.
 * ⚠ `/transfers/` 접두로 가르지 않는다 — 구단·날짜 화면도 그 아래라 딜 상세로 잘못 센다. 경로 모양(`/transfers/<십진수>`)은
 *   하단 바 판정(`hasBottomBar`)과 같은 기준이다.
 */
function contentType(): string {
  return /^\/transfers\/\d+$/.test(window.location.pathname) ? "deal" : "page";
}

/**
 * 현재 화면의 링크 공유 — 카카오톡(키가 있을 때) · OS 공유 시트 · 링크 복사.
 *
 * 공유하는 주소에는 공유로 들어왔다는 표식(UTM)이 붙는다(`shareUrl`) — 경로마다 `utm_source`가 다르다.
 *
 * ⚠ **결과를 반드시 알린다.** 클립보드 복사는 화면이 전혀 변하지 않아서, 토스트가 없으면
 *   눌러도 아무 일도 안 일어난 것처럼 보인다(앱의 다른 액션은 전부 토스트를 띄운다).
 * ⚠ `navigator.clipboard`는 **보안 컨텍스트에서만 존재한다.** http로 붙는 실기기 테스트
 *   (`http://192.168.x.x`)에서는 undefined라 그냥 두면 TypeError가 catch에 삼켜져 무반응이 된다.
 * ⚠ 사용자가 OS 공유 시트를 **취소하면 `AbortError`** 가 난다 — 이건 실패가 아니므로
 *   조용히 넘긴다. 구분하지 않으면 취소할 때마다 실패 토스트가 뜬다.
 */
export function useShareLink(title: string) {
  const toast = useToast();

  const copyLink = async () => {
    try {
      // navigator.clipboard는 보안 컨텍스트에서만 존재한다(http 실기기 테스트에서 undefined) —
      // 그냥 두면 TypeError가 catch에 삼켜져 무반응이 된다
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl(window.location.href, "link_copy"));
      toast("링크를 복사했어요");
      track("share", { method: "clipboard", content_type: contentType() });
    } catch (e) {
      console.error("[share] 링크 복사 실패:", e);
      toast("링크를 복사하지 못했어요");
    }
  };

  /**
   * OS 공유 시트 — 없거나 거절되면 링크 복사로 내려간다.
   * ⚠ 공유 시트가 **있다고 성공하는 것은 아니다.** 권한 정책·비보안 컨텍스트·임베드에서는 NotAllowedError로 거절된다 —
   *   그때 복사로 내려가지 못하면 "링크를 복사하지 못했어요"로 끝난다(복사는 시도조차 안 한 채).
   */
  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl(window.location.href, "share_sheet") });
        track("share", { method: "sheet", content_type: contentType() });
        return;
      } catch (e) {
        // 사용자가 시트를 닫은 것은 실패가 아니다 — 여기서 폴백하면 원치 않은 복사가 된다
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("[share] 공유 시트 실패 — 클립보드로 폴백:", e);
      }
    }
    await copyLink();
  };

  /** 카카오톡 — SDK를 받지 못했거나 키가 등록된 도메인이 아니면 알리고 링크 복사를 권한다 */
  const shareKakao = async () => {
    if (!env.kakaoJsKey) return;
    try {
      await shareToKakao(env.kakaoJsKey, shareUrl(window.location.href, "kakaotalk"));
      track("share", { method: "kakao", content_type: contentType() });
    } catch (e) {
      console.error("[share] 카카오톡 공유 실패:", e);
      toast("카카오톡을 열지 못했어요. 링크 복사로 공유해 주세요");
    }
  };

  return {
    /** 카카오톡 공유를 쓸 수 있는가(키가 있다) — 없으면 공유 버튼이 시트 없이 곧바로 OS 공유로 간다 */
    kakaoEnabled: env.kakaoJsKey !== "",
    /** 공유 시트를 열 때 부른다 — 카카오 SDK를 미리 받아 누르는 순간 곧바로 창이 열리게 한다(실패는 누를 때 다시 알린다) */
    prepare: () => {
      if (env.kakaoJsKey) preloadKakao(env.kakaoJsKey).catch(() => {});
    },
    shareKakao,
    shareNative,
    copyLink,
  };
}

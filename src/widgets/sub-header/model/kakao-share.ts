/**
 * 카카오 JS SDK — "카카오톡으로 공유"(스크랩 공유) 하나만 쓴다.
 *
 * 스크랩 공유(`Kakao.Share.sendScrap`)는 주소만 넘기면 카카오가 그 페이지의 og 태그를 읽어 카드를 만든다 — 딜 상세의 딜 카드
 * (`opengraph-image.tsx`)·구단·날짜 화면의 제목·설명이 그대로 카드가 된다. 템플릿을 따로 짓지 않아 화면과 카드가 갈리지 않는다.
 *
 * ⚠ **공유 시트를 열 때 미리 싣는다**(`preloadKakao`) — 누른 뒤에 받기 시작하면 데스크톱의 공유 창이 사용자의 클릭에서 떨어져
 *   팝업 차단에 걸린다. 시트를 열지 않는 방문자에게는 내려가지 않는다(약 87KB).
 * ⚠ 스크립트는 **버전과 무결성 해시(SRI)를 고정**한다 — 카카오 CDN의 파일이 바뀌면 브라우저가 실행하지 않는다. 버전을 올리면
 *   해시도 함께 바꾼다(카카오 개발자 문서 "JavaScript SDK 다운로드"의 "SRI 해시 복사" 값과 대조한다).
 * ⚠ 카카오 개발자 콘솔의 "플랫폼 > Web > 사이트 도메인"에 등록한 도메인에서만 동작한다 — 공유할 주소도 그 도메인이어야 한다.
 */

const SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js";
const SDK_INTEGRITY = "sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy";
/** 스크립트가 끝내 오지 않는 경우의 상한 — 영영 기다리면 누른 항목이 무반응이 된다 */
const LOAD_TIMEOUT_MS = 8_000;

/** 이 파일이 쓰는 SDK 표면만 적는다 */
interface KakaoSdk {
  init(appKey: string): void;
  isInitialized(): boolean;
  Share: { sendScrap(settings: { requestUrl: string }): void };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let loading: Promise<KakaoSdk> | null = null;

/**
 * SDK를 한 번만 싣고 초기화한다. 실패하면 다음 호출이 다시 시도한다(일시 장애로 영영 막히지 않게).
 * ⚠ 브라우저에서만 부른다(이벤트 핸들러) — 렌더 중에 부르면 서버 HTML과 갈린다.
 */
export function preloadKakao(appKey: string): Promise<KakaoSdk> {
  loading ??= new Promise<KakaoSdk>((resolve, reject) => {
    // ⚠ `onload` 안에서 던진 예외는 이 Promise를 거절하지 않는다(실행자 밖이다) — 직접 잡아 거절한다
    const ready = () => {
      try {
        const sdk = window.Kakao;
        if (!sdk) throw new Error("카카오 SDK가 없어요");
        if (!sdk.isInitialized()) sdk.init(appKey);
        resolve(sdk);
      } catch (e) {
        reject(e);
      }
    };
    if (window.Kakao) return ready();
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.integrity = SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error("카카오 SDK를 받지 못했어요(시간 초과)")), LOAD_TIMEOUT_MS);
    script.onload = () => {
      clearTimeout(timer);
      ready();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("카카오 SDK를 받지 못했어요"));
    };
    document.head.appendChild(script);
  }).catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
}

/**
 * 카카오톡으로 그 주소를 보낸다. SDK가 아직 오지 않았으면 기다렸다 보낸다(그 사이 데스크톱의 공유 창은 팝업 차단에 걸릴 수 있다 —
 * 시트를 열 때 미리 실어 그 경우를 줄인다).
 */
export async function shareToKakao(appKey: string, url: string): Promise<void> {
  const sdk = await preloadKakao(appKey);
  sdk.Share.sendScrap({ requestUrl: url });
}

/**
 * 브라우저 푸시 구독의 **순수 메커니즘** — 누구의 구독인지·어디에 저장하는지는 모른다(도메인은 `entities/push`와
 * `features/push-notification`이 갖는다).
 *
 * ⚠ 전부 **브라우저에서만** 부른다(이벤트 핸들러 · effect · queryFn). 렌더 중에 부르면 서버에는 `navigator`가 없고,
 *   있더라도 서버 HTML과 첫 렌더가 갈린다.
 * ⚠ 서비스 워커는 **알림을 켤 때 처음 등록한다** — 알림을 쓰지 않는 방문자에게 워커를 깔지 않는다.
 */

/** 서비스 워커의 위치 — `public/sw.js`. 범위는 사이트 전체다 */
const SERVICE_WORKER_URL = "/sw.js";
/**
 * 워커가 준비되기를 기다리는 상한 — `navigator.serviceWorker.ready`는 **실패하지 않고 영영 기다린다.**
 * 설치가 멎으면(스크립트를 못 받았다 · 설치 중 오류) 상한 없이는 버튼이 "켜는 중…"에 갇힌다.
 */
const SERVICE_WORKER_READY_TIMEOUT_MS = 10_000;

/**
 * 이 브라우저에서 푸시를 켤 수 있는가.
 * - `supported` — 바로 켤 수 있다.
 * - `needs-install` — 아이폰·아이패드의 사파리 탭. 홈 화면에 추가한 뒤에만 된다(iOS 16.4 이상).
 * - `in-app-browser` — 카카오톡·네이버 앱 같은 앱 안 브라우저. 푸시 API가 없다.
 * - `unsupported` — 그 밖(구형 브라우저 · http 접속).
 */
export type PushSupport = "supported" | "needs-install" | "in-app-browser" | "unsupported";

/** 앱 안 브라우저의 UA 표지 — 국내 유입이 많은 것만 든다(카카오톡 · 네이버 · 인스타그램 · 페이스북 · 라인 · 다음) */
const IN_APP_BROWSER = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps/i;

export function detectPushSupport(): PushSupport {
  // ⚠ 기능이 있으면 UA를 보지 않는다 — 앱 안 브라우저라도 되는 곳에서는 켜게 둔다(UA 판정은 "왜 안 되는가"의 안내용이다)
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
    return "supported";
  }
  const ua = navigator.userAgent;
  if (IN_APP_BROWSER.test(ua)) return "in-app-browser";
  // 아이패드는 데스크톱 UA를 내므로 터치 지원으로 가른다
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "needs-install";
  return "unsupported";
}

/** base64url → 바이트. `applicationServerKey`가 이 모양을 받는다 */
function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** 바이트 → base64url */
function encodeBase64Url(buffer: ArrayBuffer | null): string | null {
  if (buffer === null) return null;
  let raw = "";
  for (const byte of new Uint8Array(buffer)) raw += String.fromCharCode(byte);
  return window.btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 이 브라우저의 지금 구독 — 워커가 등록된 적이 없거나 구독이 없으면 `null`. 워커를 새로 등록하지 않는다 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  return (await registration?.pushManager?.getSubscription()) ?? null;
}

/**
 * 워커를 등록하고 새 구독을 받는다.
 * ⚠ 알림 권한은 호출 전에 받아 둔다 — 권한 없이 부르면 브라우저가 여기서 권한을 묻는데, 그 물음은 사용자의 클릭에서
 *   곧바로 이어져야 한다(이 함수는 비동기 단계 뒤에 불린다).
 * ⚠ `updateViaCache: "none"` — 워커 스크립트를 HTTP 캐시에서 읽지 않는다(고친 워커가 하루 늦게 깔리지 않게).
 */
export async function subscribePush(vapidPublicKey: string): Promise<PushSubscription> {
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("service worker did not become ready")),
        SERVICE_WORKER_READY_TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(vapidPublicKey),
  });
}

/**
 * 이 브라우저의 구독을 버린다 — 푸시 서비스가 그 주소를 죽이므로 서버에 남은 행은 다음 발송에서 410을 받아 정리된다.
 * 구독이 없으면 아무 일도 하지 않는다.
 */
export async function unsubscribePush(): Promise<void> {
  const subscription = await getPushSubscription();
  await subscription?.unsubscribe();
}

/**
 * 이 구독이 **지금의 공개키**로 만든 것인가. 키를 바꾼 배포에서는 옛 키에 묶인 구독으로 보내는 발송이 전부 거부되므로,
 * 그런 구독은 "켜져 있다"고 보면 안 된다(버리고 새로 받아야 한다).
 * ⚠ 브라우저가 키를 알려 주지 않으면(`options.applicationServerKey`가 없다) 같다고 본다 — 모른다는 이유로 멀쩡한
 *   구독을 매번 버리지 않는다.
 */
export function pushSubscriptionUsesKey(subscription: PushSubscription, vapidPublicKey: string): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  return encodeBase64Url(current) === vapidPublicKey;
}

/** 서버에 저장할 모양 — 주소와 암호화 키 둘. 키를 읽지 못하면 `null`(그 구독으로는 보낼 수 없다) */
export function serializePushSubscription(
  subscription: PushSubscription,
): { endpoint: string; p256dh: string; auth: string } | null {
  const p256dh = encodeBase64Url(subscription.getKey("p256dh"));
  const auth = encodeBase64Url(subscription.getKey("auth"));
  if (p256dh === null || auth === null) return null;
  return { endpoint: subscription.endpoint, p256dh, auth };
}

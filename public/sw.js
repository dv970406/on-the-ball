/*
 * 온더볼 서비스 워커 — **웹 푸시 알림 전용**이다.
 *
 * 하는 일은 둘뿐이다: 푸시가 오면 알림을 띄우고, 알림을 누르면 그 화면을 연다.
 * ⚠ 캐시·오프라인 처리를 하지 않는다(`fetch` 핸들러가 없다) — 이 앱의 화면은 전부 서버가 그리는 동적 라우트라,
 *   워커가 응답을 가로채면 세션·관심 표시 같은 사용자별 HTML이 낡은 채로 남는다.
 * ⚠ 페이로드의 모양(`title`·`body`·`url`·`tag`)은 보내는 쪽(`scripts/lib/transfer/notify.mjs`의 `payloadsFor`)과
 *   한 쌍이다 — 한쪽만 고치지 않는다.
 * ⚠ 이 파일은 번들을 거치지 않는다(`public/`) — import도 타입도 없이 브라우저가 그대로 실행한다.
 *   고치면 브라우저가 다음 방문에 새 워커를 받아 곧바로 갈아 끼운다(아래 `skipWaiting`·`claim`).
 */

const FALLBACK_PATH = "/transfers";
const ICON = "/icons/icon-192.png";
// 안드로이드 상태 표시줄의 단색 아이콘 — 알파만 쓰인다(흰 마크 + 투명 배경)
const BADGE = "/icons/badge-96.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** 같은 출처의 주소만 연다 — 페이로드가 틀려도 알림이 바깥 사이트로 나가는 문이 되지 않게 */
function resolveTarget(url) {
  try {
    const target = new URL(typeof url === "string" ? url : FALLBACK_PATH, self.location.origin);
    return target.origin === self.location.origin ? target.href : new URL(FALLBACK_PATH, self.location.origin).href;
  } catch {
    return new URL(FALLBACK_PATH, self.location.origin).href;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // 읽지 못한 페이로드 — 그래도 알림은 띄운다(사파리는 푸시를 받고 알림을 띄우지 않으면 구독을 끊는다)
  }
  const title = typeof data.title === "string" && data.title ? data.title : "온더볼";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: ICON,
      badge: BADGE,
      // 같은 딜의 알림은 한 장으로 갈아 끼우되(`tag`), 갈아 끼울 때도 다시 알린다 — 상태가 바뀐 것이 소식이다
      tag,
      renotify: tag !== undefined,
      data: { url: resolveTarget(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = resolveTarget(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      // 이미 열린 창이 있으면 그 창을 앞으로 가져와 그 화면으로 보낸다 — 누를 때마다 창이 늘지 않게
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          await client.focus();
          await client.navigate(target);
          return;
        } catch {
          // 워커가 아직 그 창을 맡지 않았다(navigate는 맡은 창에서만 된다) — 새 창으로 연다
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

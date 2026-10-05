import type { PushSupport } from "@/shared/lib";

/**
 * 이 기기에서 지금 로그인한 사용자의 알림 상태.
 *
 * 앞의 셋은 **켤 수 없는 이유**다(`PushSupport`에서 `supported`를 뺀 것 — 화면이 이유마다 다른 안내를 낸다).
 * - `unconfigured` — 서버에 알림 키가 없다(기능을 켜지 않은 배포). 화면은 알림 자리를 아예 그리지 않는다.
 * - `denied` — 브라우저가 이 사이트의 알림을 막았다. 사용자가 브라우저 설정에서 풀어야 한다.
 * - `off` — 켤 수 있지만 꺼져 있다.
 * - `on` — 이 기기의 구독이 **지금 사용자 명의로** 서버에 있다.
 */
export type PushStatus = Exclude<PushSupport, "supported"> | "unconfigured" | "denied" | "off" | "on";

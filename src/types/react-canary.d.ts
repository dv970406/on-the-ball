/*
 * React canary 채널 타입(`ViewTransition` 등)을 켠다.
 * App Router는 React canary를 쓰므로 런타임에는 이미 있고, 타입만 여기서 붙인다
 * (`node_modules/@types/react/canary.d.ts` 머리말이 안내하는 세 방법 중 하나).
 * ⚠ `next.config.ts`의 `experimental.viewTransition`과 한 쌍이다 — 플래그 없이는 라우트
 *   이동에서 전환이 시작되지 않는다.
 */
/// <reference types="react/canary" />

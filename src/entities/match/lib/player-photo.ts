/**
 * 제공자 미디어 CDN — 선수·감독 사진이 여기 산다.
 * ⚠ **우리 스토리지가 아니다.** `publicStorageUrl`(supabase 공개 버킷)과 성격이 다르므로
 *   그 함수를 거치지 않는다.
 */
/**
 * 제공자 미디어 CDN의 **오리진** — `preconnect`가 이 값을 쓴다.
 * ⚠ 경로가 아니라 오리진이어야 한다(연결은 호스트 단위로 열린다).
 */
export const PHOTO_ORIGIN = "https://media.api-sports.io";

const MEDIA_ORIGIN = `${PHOTO_ORIGIN}/football`;

/**
 * 선수 사진 URL — `player.external_id`에서 **유도한다.**
 *
 * ⚠ **DB에 컬럼을 두지 않는 이유**가 규약이다. 주소가 id에서 결정적으로 나오므로 컬럼을 두면
 *   같은 사실을 두 곳이 갖게 된다 — 구단 엠블럼을 `team.code`에서 유도한 것과 같은 판단이다.
 *   ⚠ **거기까지만 같다.** 엠블럼은 우리가 줄인 사본을 `public/crests/`에 커밋해 서빙하고
 *   조립도 `ui/team-crest.tsx`의 로컬 상수가 한다(`@/shared/config`에는 엠블럼 심볼이 없다) —
 *   여기는 제공자 CDN 핫링크라 **자산의 성격이 반대**다.
 * ⚠ **`@/shared/config`가 아니라 이 슬라이스에 있다.** 소비자가 `ui/player-photo.tsx` 하나뿐이라
 *   `avatarUrl`이 shared에 있는 사정(entities 셋이 함께 쓰는데 서로 import할 수 없다)이 전혀
 *   성립하지 않는다 — 두 번째 도메인이 선수 사진을 쓰는 날 그때 올린다.
 *
 * ⚠ **핫링크다.** 엠블럼처럼 줄인 사본을 만들지 않았다 — 선수는 670명이고 이적마다 바뀌어
 *   커밋으로 관리하는 운영 모델이 성립하지 않는다. 대가는 무게다(150×150 PNG, 평균 27KB).
 *   한 경기 라인업이 40명이라 **약 1.1MB**가 나가므로, 화면은 `loading="lazy"`로 받고
 *   실패하면 등번호로 떨어진다.
 *
 * ⚠ **제공자가 이 자산의 권리자가 아니다.** 약관이 "identification and descriptive purposes"로
 *   제공할 뿐 게시 라이선스는 주지 않으며 권리자(리그·구단·촬영자)에게 직접 받으라고 명시한다.
 *   `public/crests/`의 엠블럼이 이미 같은 조항 아래 있고, 사진은 초상권까지 겹쳐 더 무겁다 —
 *   **공개 배포 전에 확인이 필요한 항목**이라는 사실을 여기 남긴다.
 */
export function playerPhotoUrl(externalId: string | null | undefined): string | null {
  // ⚠ 숫자만 받는다 — 이 값이 그대로 URL 경로가 되므로 형태를 좁혀 두지 않으면
  //   저장된 값 하나로 임의 경로를 만들 수 있다(동기화가 넣는 값이지만 방어는 여기 둔다).
  if (!externalId || !/^[0-9]+$/.test(externalId)) return null;
  return `${MEDIA_ORIGIN}/players/${externalId}.png`;
}

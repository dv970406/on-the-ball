"use client";

import { useState } from "react";
import { usePushStatusQuery } from "@/entities/push";
import { useToastStore } from "@/shared/lib";

interface UsePushNudgeArgs {
  /** 지금 보고 있는 딜 — 안내는 **그 딜을 방금 담았을 때만** 뜬다. 같은 자리에서 딜이 바뀌면(보드의 오른쪽 판) 안내도 걷힌다 */
  dealId: number;
  /** 그 딜이 지금 담겨 있는가(캐시 값 — 낙관적 갱신이 먼저 뒤집는다) */
  watched: boolean;
  /** 캐시 키와 같은 사용자 — 알림 상태 조회의 스코프 */
  userId: string | undefined;
}

/**
 * 관심 목록에 담은 **직후** 알림 안내(`PushNudge`)를 낼지 정한다. `WatchToggle`의 `onWatched`에 `onWatched`를 잇고,
 * `show`가 참일 때 `PushNudge`를 그린다.
 *
 * - 들어올 때 이미 담겨 있던 딜에는 내지 않는다(열 때마다 같은 물음이 뜨면 안내가 아니라 조르기다).
 * - 알림 상태는 안내를 낼 때만 조회한다 — 담기 전에는 브라우저 API와 서버 왕복을 붙이지 않는다.
 * - ⚠ **"담았어요" 토스트가 걷힌 뒤에 처음 낸다.** 토스트는 하단 바 바로 위에 뜨는데 안내가 뜨면 바가 그만큼 높아져,
 *   토스트가 방금 나타난 안내 문구를 정확히 덮는다(실측). 담았다는 확인이 먼저, 그다음이 물음이다.
 * - ⚠ **한번 뜬 뒤에는 토스트를 보지 않는다.** 토스트가 뜰 때마다 물러나게 두면 무관한 토스트에도 바가 오르내리고,
 *   안내가 언마운트될 때마다 켜기 훅(과 그 가드)이 새로 만들어진다.
 *   렌더 중에 state를 맞추는 형태다(조건이 한 번만 참이 되어 한 번만 돈다) — effect로 옮기면 한 프레임 늦는다.
 * - ⚠ 상태를 boolean이 아니라 **딜 id**로 든다 — 한 자리가 딜을 갈아 끼우는 화면(보드의 오른쪽 판)에서 앞 딜의 안내가
 *   다음 딜로 넘어가지 않게.
 */
export function usePushNudge({ dealId, watched, userId }: UsePushNudgeArgs) {
  const [justWatchedId, setJustWatchedId] = useState<number | null>(null);
  const [revealedId, setRevealedId] = useState<number | null>(null);
  const justWatched = justWatchedId === dealId;
  const status = usePushStatusQuery(justWatched ? userId : undefined);
  const toastShowing = useToastStore((s) => s.message !== null);
  if (justWatched && !toastShowing && revealedId !== dealId) setRevealedId(dealId);

  return {
    show: revealedId === dealId && watched && status.data === "off",
    /** 방금 담았다 — 다시 담을 때마다 "토스트 → 안내" 순서를 처음부터 밟는다 */
    onWatched: () => {
      setRevealedId(null);
      setJustWatchedId(dealId);
    },
  };
}

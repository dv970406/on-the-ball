"use client";

import { useState } from "react";
import { useDuplicateGuard, useToast } from "@/shared/lib";
import { type SyncMatchesResult, useSyncMatches } from "@/features/admin-match";

/**
 * '일정 가져오기' — 행이 쌓이는 뮤테이션이라 **중복 실행 가드가 필수**다.
 *
 * ⚠ `disabled={isPending}`만으로는 못 막는다. 상태 변경이 마이크로태스크로 배치되어
 *   같은 tick의 두 번째 클릭은 아직 enabled인 버튼을 누른다(실측: 3연타 → 3건 생성).
 * ⚠ 가드는 **뮤테이션을 조립하는 이 자리**가 갖는다 — 버튼 컴포넌트에 두면 부모가
 *   리렌더되기 전까지 낡은 값을 읽어 영구 잠금이 된다.
 */
export function useMatchSync() {
  const sync = useSyncMatches();
  const guard = useDuplicateGuard(sync);
  const toast = useToast();
  const [result, setResult] = useState<SyncMatchesResult | null>(null);

  const start = () => {
    if (guard.isLocked()) return;
    guard.lock();
    sync.mutate(undefined, {
      onSuccess: (data) => {
        setResult(data);
        toast(`경기 ${data.matches.saved}건을 받았어요`);
      },
    });
  };

  return { start, isPending: sync.isPending, result, error: sync.error };
}

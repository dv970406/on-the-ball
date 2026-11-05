/** 뮤테이션 캐시의 항목에서 이 장치가 보는 것뿐 — TanStack을 import하지 않는다(`useDuplicateGuard`와 같은 구조적 타입) */
interface PendingMutation {
  mutationId: number;
  state: { variables: unknown };
}

interface PendingOverlayOptions<TData, TEntry extends { userId: string }> {
  /** 뮤테이션 변수가 이 장치의 항목인가 */
  isEntry: (variables: unknown) => variables is TEntry;
  /** 항목을 입힌 결과 — 멱등해야 한다(응답이 이미 반영했으면 그대로) */
  apply: (data: TData, entry: TEntry) => TData;
}

/** 커밋된 항목을 기억하는 기간 — 어떤 조회도 이보다 오래 걸리지 않는다(넉넉히) */
const SETTLED_TTL_MS = 60_000;

/**
 * 조회 결과에 **아직 반영되지 않았을 수 있는 내 쓰기**를 다시 입히는 장치 — 줄 세운 낙관적 쓰기(댓글 표·딜 예측)의 조회 쪽 덮어 넣기다.
 *
 * ⚠ 쓰기가 날아가는 동안의 조회는 커밋 전의 DB를 읽어 **방금 누른 것을 되돌린다**(QA 실측). 쓰기는 조회를 취소하지 않으므로 — 취소하면 쓰기 뒤 리페치와 데이터가 없는
 *   첫 조회까지 되돌린다 — 조회 결과를 캐시에 넣기 전에 덮는다. 줄 선(대기 중) 쓰기도 pending이라 함께 입힌다 — 곧 그대로 커밋된다.
 * ⚠ **방금 커밋된 쓰기**도 입힌다(`record`) — 조회가 쓰기보다 먼저 시작해 쓰기가 끝난 뒤 도착하면 응답에 빠져 있는데 이미 pending이 아니다.
 *   "조회와 겹치면 줄 끝에서 다시 받기"로 메우면 그 재조회가 진행 중인 조회를 재시작해, 누를 때마다 GET이 늘고 토스트가 목록보다 앞선다(QA 실측).
 * ⚠ **이 데이터의 주인이 누른 것만** 입힌다(`userId`) — 뮤테이션 캐시는 사용자와 무관해서, 날아가는 중에 로그아웃하면 비로그인 목록에 이전 사용자의 값이 입혀졌다.
 * ⚠ 무엇을 어떻게 입히는지는 모른다 — 도메인은 엔티티의 얇은 래퍼가 갖는다(`Crest`↔`TransferCrest`와 같은 구조). 엔티티끼리 import할 수 없어 여기 둔다.
 *   뮤테이션 옵션(낙관적 갱신·롤백·토스트)은 묶지 않는다 — 각 훅의 책임이다(`code-quality.md`의 factory 금지).
 */
export function createPendingOverlay<TData, TEntry extends { userId: string }>({ isEntry, apply }: PendingOverlayOptions<TData, TEntry>) {
  const settled = new Map<number, (TEntry & { committedAt: number })[]>();

  return {
    /**
     * @param pending 이 범위의 진행 중 뮤테이션(엔티티가 자기 키로 찾아 넘긴다)
     * @param scopeId 범위(딜 id)
     * @param fetchStartedAt 이 조회가 요청을 보낸 시각(`performance.now()`) — 그 뒤에 커밋된 것은 응답에 빠져 있을 수 있다
     */
    applyTo(data: TData, pending: readonly PendingMutation[], scopeId: number, userId: string | undefined, fetchStartedAt: number): TData {
      if (!userId) return data;
      // 1) 이 조회가 시작된 뒤 커밋된 것(커밋 순서대로)
      const withSettled = (settled.get(scopeId) ?? [])
        .filter((e) => e.userId === userId && e.committedAt > fetchStartedAt)
        .reduce((acc, e) => apply(acc, e), data);
      // 2) 아직 끝나지 않은 것 — 곧 그대로 커밋된다(누른 순서대로, 같은 대상이면 마지막 것이 남는다)
      return [...pending]
        .sort((a, b) => a.mutationId - b.mutationId)
        .reduce((acc, { state: { variables } }) => (isEntry(variables) && variables.userId === userId ? apply(acc, variables) : acc), withSettled);
    },
    /** 커밋된 쓰기를 기억한다 — 훅의 `onSuccess`만 부른다(실패한 것은 커밋되지 않았다) */
    record(scopeId: number, entry: TEntry) {
      // ⚠ 단조 시계 — 조회의 시작 시각(`performance.now()`)과 같은 축이어야 비교가 성립한다. 성공 응답을 받은 시각이라 실제 커밋보다 늦어 "조회 뒤 커밋"을 넉넉히(멱등이라 안전하게) 잡는다
      const now = performance.now();
      const kept = (settled.get(scopeId) ?? []).filter((e) => now - e.committedAt < SETTLED_TTL_MS);
      kept.push({ ...entry, committedAt: now });
      settled.set(scopeId, kept);
    },
  };
}

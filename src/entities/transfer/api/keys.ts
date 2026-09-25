import { userScope } from "@/shared/lib/query-scope";

/**
 * 이적시장 쿼리 키.
 *
 * ⚠ **목록까지 userId로 스코프한다.** 행이 "내가 관심 등록했는가"를 `transfer_deal_watch`
 *   임베딩("내 행만")으로 그리므로 목록 응답 자체가 "나"에 종속된다 — 키에 유저가 없으면
 *   계정이 바뀐 뒤에도 이전 사용자의 관심 표시가 남는다(`userScope` 주석).
 *
 * ⚠ **정렬·리그는 키에 넣지 않는다.** 서버가 범위 안 딜 전체(≤`TRANSFER_DEAL_LIMIT`)를 내리고
 *   뷰가 같은 데이터로 필터·정렬한다 — 필터 객체가 훅과 키 하나라도 어긋나면 `initialData`가
 *   캐시에 닿지 못해 서버가 그린 목록을 첫 프레임에 스켈레톤이 덮는다(`nextjs.md`의 실측 사고).
 *   범위 시작(ISO)은 키에 들어간다 — 값이 다르면 다른 집합이다(창이 바뀌는 순간에만 바뀐다).
 *
 * ⚠ 타임라인은 "나"에 종속되지 않는다(임베딩에 정책 게이팅이 없다) → 스코프를 붙이지 않는다.
 */
export const transferKeys = {
  all: ["transfer"] as const,
  lists: () => [...transferKeys.all, "list"] as const,
  list: (userId: string | undefined, scopeStartIso: string) =>
    [...transferKeys.lists(), userScope(userId), scopeStartIso] as const,
  details: () => [...transferKeys.all, "detail"] as const,
  detail: (id: number, userId: string | undefined) =>
    [...transferKeys.details(), id, userScope(userId)] as const,
  /** 상세의 보도 타임라인 — 딜 단건과 키를 나눈다(관심 토글이 상세만 무효화한다) */
  reports: (id: number) => [...transferKeys.all, "reports", id] as const,
} as const;

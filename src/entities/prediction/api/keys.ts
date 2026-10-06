import { userScope } from "@/shared/lib/query-scope";

/**
 * 예측 쿼리 키.
 *
 * ⚠ **딜 단위 키는 userId로 스코프한다** — 내 표(`mine`)가 "내 행만" 정책에서 오므로 응답이 "나"에 종속된다.
 * ⚠ 랭킹·점수는 "나"와 무관한 공개 데이터라 스코프하지 않는다(점수는 사람 id가 곧 키다).
 */
export const predictionKeys = {
  all: ["prediction"] as const,
  deals: () => [...predictionKeys.all, "deal"] as const,
  /** 한 딜의 예측(사용자 무관) — 쓰기 뒤 무효화가 이 prefix로 잡는다 */
  dealAll: (dealId: number) => [...predictionKeys.deals(), dealId] as const,
  deal: (dealId: number, userId: string | undefined) =>
    [...predictionKeys.dealAll(dealId), userScope(userId)] as const,
  ranking: () => [...predictionKeys.all, "ranking"] as const,
  /** 점수 전부 — 닉네임·아바타를 바꾸면 랭킹과 함께 무효화한다(`invalidateProfileConsumers`) */
  scores: () => [...predictionKeys.all, "score"] as const,
  score: (userId: string) => [...predictionKeys.scores(), userId] as const,
  /** 예측 뮤테이션 키(쿼리 키가 아니다) — 줄 끝 판정(`isMutating`)이 이 키로 센다 */
  predictMutation: (dealId: number) => ["predict-deal", dealId] as const,
} as const;

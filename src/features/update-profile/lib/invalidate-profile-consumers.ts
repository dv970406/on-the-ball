import type { QueryClient } from "@tanstack/react-query";
import { commentKeys } from "@/entities/comment";
import { predictionKeys } from "@/entities/prediction";
import { profileKeys } from "@/entities/profile";

/**
 * 프로필(닉네임·아바타)이 바뀐 뒤 다시 받아야 하는 캐시 — 닉네임 훅과 아바타 훅이 **같은 목록**을 쓴다.
 *
 * ⚠ 프로필 컬럼을 새 select에 임베딩하면 **여기에** 더한다(`reuse.md`) — 댓글의 작성자 임베딩
 *   (`COMMENT_SELECT`의 `author`)과 예측 랭킹의 이름 임베딩(`SCORE_SELECT`의 `profile`)이 그 자리다. 두 훅에 따로 적혀 있던 시절엔 한쪽만 늘리면 아바타만 옛 값이 남았다.
 * ⚠ 무효화만 한다(지우지 않는다) — 지우면 뒤로가기가 되살린 **옛 서버 페이로드**가 빈 캐시에 신선한 데이터로
 *   앉아 옛 작성자 표기가 새로고침 전까지 남았다(QA 실측). stale로 남겨 두면 돌아온 순간 다시 받는다.
 * 무효화 Promise를 돌려준다 — 호출부가 그대로 반환해 리페치가 끝날 때까지 `isPending`을 유지한다.
 */
export function invalidateProfileConsumers(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: profileKeys.all }),
    queryClient.invalidateQueries({ queryKey: commentKeys.all }),
    queryClient.invalidateQueries({ queryKey: predictionKeys.ranking() }),
    queryClient.invalidateQueries({ queryKey: predictionKeys.scores() }),
  ]);
}

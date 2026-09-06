import type { TextLimit } from "@/shared/lib/text";
import type { Database } from "@/types/database.types";

export type PollRow = Database["public"]["Tables"]["post_poll"]["Row"];
export type PollOptionRow = Database["public"]["Tables"]["post_poll_option"]["Row"];
export type PollVoteRow = Database["public"]["Tables"]["post_poll_vote"]["Row"];

export interface PollOption {
  id: PollOptionRow["id"];
  label: PollOptionRow["label"];
  sortOrder: PollOptionRow["sort_order"];
}

export interface Poll {
  postId: PollRow["post_id"];
  question: PollRow["question"];
  /** `sort_order` 오름차순 */
  options: PollOption[];
  /**
   * 내가 고른 선택지. 비로그인·미투표면 `null`.
   * ⚠ `post_poll_vote`의 SELECT 정책이 "내 행만"이라 임베딩 결과가 곧 이 값이다
   *   (`post_like(user_id)`로 "내가 눌렀는지"를 얻는 것과 같은 트릭).
   */
  myOptionId: PollVoteRow["option_id"] | null;
}

/**
 * 선택지별 득표수.
 *
 * ⚠ **득표수는 컬럼이 아니다.** `post_poll_results` 함수가 그때그때 세고, **투표한 사람에게만**
 *   돌려준다 — 미투표자에게는 0행이 온다. 그래서 도메인 타입에서도 `Poll`과 분리해 둔다:
 *   "선택지는 있는데 결과는 아직 없다"가 정상 상태다.
 */
export interface PollResult {
  optionId: PollOptionRow["id"];
  voteCount: number;
}

/**
 * 투표 문구의 길이 한도 — **화면은 그래핌, DB는 코드포인트 K=10배**로 겹쳐 건다.
 *
 * ⚠ **여기(entities)에 있는 이유가 규약이다.** 한때 `features/write-post`가 갖고 있었는데
 *   어드민의 투표 문구 편집(`features/admin-post`)이 두 번째 소비자가 됐다 —
 *   **features끼리는 import할 수 없으므로** 도메인을 소유한 엔티티로 내리는 것 말고 길이 없다.
 *   값은 `20260817000003_poll.sql`의 CHECK와 한 쌍이다(한쪽만 고치지 말 것).
 * ⚠ 판정은 직접 짜지 말고 `lengthOverflow(value, LIMIT)`를 쓴다 — 1그래핌의 코드포인트 수에
 *   상한이 없어 그래핌 한도가 DB 한도를 함의하지 못한다.
 */
export const POLL_QUESTION_LIMIT: TextLimit = { grapheme: 100, codePoint: 1000 };
export const POLL_OPTION_LIMIT: TextLimit = { grapheme: 40, codePoint: 400 };

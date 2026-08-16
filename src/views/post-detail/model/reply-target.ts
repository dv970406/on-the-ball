/**
 * 답글 대상 — 상세 화면의 세 조각이 함께 쓴다(입력창·목록·화면 자신).
 *
 * ⚠ `ui/`가 아니라 여기 있는 이유: 입력 조립 훅(`use-comment-composer`)이 이 타입을 쓰는데,
 *   훅이 `ui/`에서 가져오면 `ui → model → ui` 참조가 된다. 타입 하나가 세 파일의 계약이므로
 *   슬라이스의 model이 자리가 맞다.
 */
export interface ReplyTarget {
  commentId: number;
  nickname: string;
}

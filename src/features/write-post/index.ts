export { useCreatePost } from "./model/use-create-post";
export { useUpdatePost } from "./model/use-update-post";
// ⚠ `TITLE_LIMIT`은 공개하지 않는다 — 한도 숫자를 화면에 노출하는 곳이 없고(닉네임과 달리
//   힌트 문구가 없다), 초과 안내는 `validatePost`가 문구째 돌려준다. 슬라이스 안에서는
//   상대 경로로 가져다 쓴다.
export { validatePost, CONTENT_MAX } from "./model/post-schema";
export type { PostInput, PostDraft, PostFieldErrors } from "./model/post-schema";
// ⚠ 투표도 같은 판단이다 — 한도 상수(`POLL_*_LIMIT`)는 공개하지 않고 타입만 낸다.
//   뷰가 `onSubmit`의 시그니처를 적어야 해서 `PollInput`은 필요하다.
export type { PollInput } from "./model/poll-schema";
export { PostForm } from "./ui/post-form";

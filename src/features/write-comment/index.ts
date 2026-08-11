// 한도 상수는 노출하지 않는다 — 검증이 슬라이스 안에 있으므로 뷰가 알 이유가 없다
// (write-post의 validatePost·update-profile의 validateNickname과 같은 형태).
export { useWriteComment, validateComment } from "./model/use-write-comment";

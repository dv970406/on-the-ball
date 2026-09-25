// 조회는 `@/entities/transfer`, 쓰기는 여기 — `entities/post` ↔ `features/toggle-post-like`와 같은 분업.
// ⚠ 훅(`useToggleTransferWatch`)은 올리지 않는다 — 토글은 상세의 `WatchToggle` 하나뿐이라
//   슬라이스 밖 호출부가 0이다(목록 행의 관심 표시는 표시일 뿐 토글이 아니다).
export { WatchToggle } from "./ui/watch-toggle";

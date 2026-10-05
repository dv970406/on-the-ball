// 조회(구단 목록·내 응원 구단)는 `@/entities/transfer`, 쓰기는 여기 — 관심(`features/watch-transfer`)과 같은 분업.
// ⚠ 훅을 그대로 올린다 — 고르는 화면(`views/profile`의 구단 시트)이 줄마다 `mutate`를 부르고, 누른 사람(`userId`)을
//   그 화면이 넘긴다. 가드가 없는 낙관적 토글이라 감출 방어가 없다(`data-and-state.md`의 가드 표).
export { useToggleClubFollow } from "./model/use-toggle-club-follow";

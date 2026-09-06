// ⚠ `TeamOption`은 올리지 않는다 — 호출부가 `useTeamListQuery`의 반환을 그대로 넘긴다
// ⚠ `TeamOption`·`MatchDraft`는 올리지 않는다 — 호출부가 훅의 반환과 폼의 초기값을
//   인라인으로 넘겨 이름이 필요 없다(슬라이스 밖 소비 0).
export { MatchForm } from "./ui/match-form";
export {
  type AdminMatchInput,
  type SyncMatchesResult,
  useDeleteMatch,
  useRestoreMatch,
  useSyncMatches,
  useUnlockMatch,
  useUpdateMatch,
} from "./model/use-admin-match-mutations";

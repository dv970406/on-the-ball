// poll 엔티티 public API
// ⚠ Route Handler에서는 이 배럴 대신 서버 안전 경로를 직접 import:
//   - "@/entities/poll/model/types" (타입)
//   - "@/entities/poll/api/mappers" (snake_case → camelCase 매퍼)
export type {
  PollType,
  BalanceSideMeta,
  RankingCandidateMeta,
  KitMeta,
  TmiOptionMeta,
  TmiPollMeta,
  PollOption,
  PollListItem,
  PollDemographic,
  PollDetail,
  PollComment,
  CastVoteResult,
} from "./model/types";
export {
  pollQueryKeys,
  usePollsQuery,
  usePollDetailQuery,
  usePollCommentsQuery,
} from "./api/queries";
export { SplitCard } from "./ui/split-card";
export { VsBadge } from "./ui/vs-badge";
export { PollMetaStrip } from "./ui/poll-meta-strip";
export { readSideMeta, pickSides } from "./lib/balance-side";
export {
  readKitMeta,
  readRankingMeta,
  readTmiOptionMeta,
  readTmiPollMeta,
} from "./lib/option-meta";

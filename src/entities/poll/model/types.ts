/**
 * poll 도메인 데이터 계약 — 다른 화면 담당자들이 이 타입에 의존한다.
 * DB(polls/poll_options/votes)의 snake_case를 camelCase로 매핑한 형태.
 */

/** 투표 4종 — polls.type (런타임 검증·순회의 단일 소스) */
export const POLL_TYPES = ["balance", "ranking", "kit", "tmi"] as const;
export type PollType = (typeof POLL_TYPES)[number];

/** poll_options.meta (balance side) — sublabel 컬럼 = 라틴 표기 */
export interface BalanceSideMeta {
  side: "a" | "b";
  /** 이름 아래 메타 카피 (예: "통산 850골 · 발롱도르 8회") */
  metaLine: string;
  /** 면 배경색 */
  tone: string;
  /** 면 글자색 ('#fff' 또는 잉크 계열) */
  text: string;
  /** 결과 화면 액센트 컬러 (없으면 null) */
  accent: string | null;
  /** 스탯 비교 행 [라벨, 값] 목록 */
  stats: [string, string][];
  /** 결과 화면 한 줄 코멘트 */
  blurb: string;
}

/** poll_options.meta (ranking 후보) — label=이름, sublabel=클럽 */
export interface RankingCandidateMeta { flag: string; hue: number }

/** poll_options.meta (kit 유니폼) */
export interface KitMeta { tone: string; stripe: "sash" | "h" | "v" | null; dark: boolean }

/** poll_options.meta (tmi 선택지) — label=진실/거짓 */
export interface TmiOptionMeta { verdict: "true" | "false" }

/** polls.meta (tmi) — TMI 카드 본문 */
export interface TmiPollMeta { player: string; club: string; flag: string; detail: string }

/** 투표 선택지 — votes = poll_results 뷰(시드 + 실투표 합) */
export interface PollOption {
  /** poll_options.id (정수 대리키) */
  id: number;
  position: number;
  label: string;
  sublabel: string | null;
  votes: number;
  /** votes / totalVotes (totalVotes 0이면 0) */
  ratio: number;
  meta: Record<string, unknown>;
}

/** 리스트/덱 카드용 투표 아이템 */
export interface PollListItem {
  /** 공개 식별자 = polls.slug (URL·쿼리키에 사용) */
  id: string;
  type: PollType;
  title: string;
  subtitle: string | null;
  tag: string | null;
  closesAt: string | null;
  /** 홈 히어로 노출 여부 */
  featured: boolean;
  position: number;
  meta: Record<string, unknown>;
  totalVotes: number;
  options: PollOption[];
  /** 내가 투표한 option id (미투표·비로그인 시 null) */
  myVote: number | null;
  /** 좋아요 수 (poll_like_stats) */
  likes: number;
  /** 내가 좋아요를 눌렀는지 (비로그인 시 false) */
  likedByMe: boolean;
}

/** 응답자 분석 한 줄 (poll_demographics — v1 시드 값) */
export interface PollDemographic {
  dimension: "age" | "region";
  bucket: string;
  optionId: number | null;
  ratio: number;
  position: number;
}

/** 디테일 화면용 — 리스트 아이템 + 응답자 분석 + 댓글 수 */
export interface PollDetail extends PollListItem {
  demographics: PollDemographic[];
  commentCount: number;
}

/** "한 줄 거들기" 댓글 */
export interface PollComment {
  id: number;
  author: { name: string; tag: string | null };
  body: string;
  /** seed_likes + comment_likes 카운트 */
  likes: number;
  likedByMe: boolean;
  isMine: boolean;
  createdAt: string;
}

/** cast_vote RPC 결과 — cancelled는 유니폼(kit) 재탭 취소 */
export interface CastVoteResult {
  status: "voted" | "cancelled" | "unchanged";
  optionId: number | null;
}

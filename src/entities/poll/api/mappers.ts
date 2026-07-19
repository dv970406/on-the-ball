/**
 * DB(snake_case) → 도메인 타입(camelCase) 매퍼.
 * ⚠ Route Handler에서 import하는 파일 — "use client" 금지.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PollComment,
  PollDemographic,
  PollListItem,
  PollOption,
  PollType,
} from "../model/types";

// ---------------------------------------------------------------------------
// select 컬럼 상수 (라우트들이 재사용)
// ---------------------------------------------------------------------------

export const POLL_SELECT =
  "id, type, title, subtitle, tag, closes_at, featured, position, meta";

export const POLL_OPTION_SELECT = "id, poll_id, position, label, sublabel, meta";

export const POLL_DEMOGRAPHIC_SELECT =
  "dimension, bucket, option_id, ratio, position";

/**
 * comments + 작성자 프로필 + 동감 목록 조인 select.
 * comments→profiles 경로가 둘(작성자 FK, comment_likes 경유)이라 FK 힌트로 명시해야 한다.
 */
export const COMMENT_SELECT =
  "id, user_id, display_name, display_tag, body, seed_likes, created_at, profiles!comments_user_id_fkey(nickname, fan_team), comment_likes(user_id)";

// ---------------------------------------------------------------------------
// DB 행 타입
// ---------------------------------------------------------------------------

/** polls 테이블 행 */
export type PollRow = {
  id: string;
  type: PollType;
  title: string;
  subtitle: string | null;
  tag: string | null;
  closes_at: string | null;
  featured: boolean;
  position: number;
  meta: Record<string, unknown> | null;
};

/** poll_options 테이블 행 */
export type PollOptionRow = {
  id: string;
  poll_id: string;
  position: number;
  label: string;
  sublabel: string | null;
  meta: Record<string, unknown> | null;
};

/** poll_results 뷰 행 — votes = 시드 + 실투표 합 */
export type PollResultRow = {
  poll_id: string;
  option_id: string;
  votes: number;
};

/** votes 테이블 행 (내 투표 조회용) */
export type VoteRow = {
  poll_id: string;
  option_id: string;
};

/** poll_demographics 테이블 행 */
export type PollDemographicRow = {
  dimension: "age" | "region";
  bucket: string;
  option_id: string | null;
  ratio: number;
  position: number;
};

/** comments 조인 행 (COMMENT_SELECT 결과) */
export type CommentRow = {
  id: number;
  user_id: string | null;
  display_name: string | null;
  display_tag: string | null;
  body: string;
  seed_likes: number;
  created_at: string;
  /** user_id가 있는 실사용자 댓글의 작성자 프로필 */
  profiles: { nickname: string; fan_team: string | null } | null;
  /** 동감 누른 사용자 목록 (카운트 + likedByMe 판별용) */
  comment_likes: { user_id: string }[];
};

// ---------------------------------------------------------------------------
// 매핑 함수
// ---------------------------------------------------------------------------

/** poll_results 행들을 option_id → votes 맵으로 변환 */
export function buildVotesByOption(results: PollResultRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of results) map.set(row.option_id, row.votes);
  return map;
}

/** poll_options 행들을 poll_id → 옵션 목록으로 그룹핑 (리스트/홈 라우트 공용) */
export function groupOptionsByPoll(
  rows: PollOptionRow[],
): Map<string, PollOptionRow[]> {
  const map = new Map<string, PollOptionRow[]>();
  for (const row of rows) {
    const group = map.get(row.poll_id);
    if (group) group.push(row);
    else map.set(row.poll_id, [row]);
  }
  return map;
}

/**
 * 세션 유저의 내 투표를 poll_id → option_id 맵으로 조회 (RLS로 본인 행만 반환).
 * userId가 없거나 pollIds가 비면 빈 맵. 실패 시 throw → 호출부 withSupabase가 500 처리.
 */
export async function fetchMyVotesByPoll(
  supabase: SupabaseClient,
  userId: string | null,
  pollIds: string[],
): Promise<Map<string, string>> {
  if (!userId || pollIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("votes")
    .select("poll_id, option_id")
    .eq("user_id", userId)
    .in("poll_id", pollIds);
  if (error) throw error;
  return new Map(
    ((data ?? []) as VoteRow[]).map((v) => [v.poll_id, v.option_id]),
  );
}

/** polls + poll_options + poll_results + 내 투표 → PollListItem */
export function buildPollListItem(
  poll: PollRow,
  optionRows: PollOptionRow[],
  votesByOption: Map<string, number>,
  myVote: string | null,
): PollListItem {
  const sorted = [...optionRows].sort((x, y) => x.position - y.position);
  const totalVotes = sorted.reduce(
    (sum, row) => sum + (votesByOption.get(row.id) ?? 0),
    0,
  );

  const options: PollOption[] = sorted.map((row) => {
    const votes = votesByOption.get(row.id) ?? 0;
    return {
      id: row.id,
      position: row.position,
      label: row.label,
      sublabel: row.sublabel,
      votes,
      // 비율 = 득표 / 전체 (전체 0이면 0)
      ratio: totalVotes === 0 ? 0 : votes / totalVotes,
      meta: row.meta ?? {},
    };
  });

  return {
    id: poll.id,
    type: poll.type,
    title: poll.title,
    subtitle: poll.subtitle,
    tag: poll.tag,
    closesAt: poll.closes_at,
    featured: poll.featured,
    position: poll.position,
    meta: poll.meta ?? {},
    totalVotes,
    options,
    myVote,
  };
}

/** poll_demographics 행 → PollDemographic */
export function mapDemographic(row: PollDemographicRow): PollDemographic {
  return {
    dimension: row.dimension,
    bucket: row.bucket,
    optionId: row.option_id,
    ratio: Number(row.ratio),
    position: row.position,
  };
}

/** 실사용자·시드 댓글 공통 폴백 닉네임 */
const FALLBACK_NICKNAME = "익명의 축덕";

/** comments 조인 행 → PollComment (viewerId = 세션 uid, 없으면 null) */
export function mapComment(row: CommentRow, viewerId: string | null): PollComment {
  // 실사용자 댓글은 프로필, 시드 댓글(user_id null)은 display_* 비정규화 필드 사용
  const name =
    (row.user_id ? row.profiles?.nickname : row.display_name) ?? FALLBACK_NICKNAME;
  const tag = row.user_id ? (row.profiles?.fan_team ?? null) : row.display_tag;

  return {
    id: row.id,
    author: { name, tag },
    body: row.body,
    likes: row.seed_likes + row.comment_likes.length,
    likedByMe:
      viewerId !== null && row.comment_likes.some((l) => l.user_id === viewerId),
    isMine: viewerId !== null && row.user_id === viewerId,
    createdAt: row.created_at,
  };
}

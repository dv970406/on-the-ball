import type { Database } from "@/types/database.types";

/**
 * 이적 딜 댓글 도메인 타입 (순수 — 서버에서도 import 가능).
 * DB 행 타입은 생성 타입에서 뽑는다(`pnpm db:types`).
 *
 * ⚠ 슬라이스 이름(`comment`)과 테이블 이름(`transfer_deal_comment`)이 다르다 — 슬라이스는 앱 안의
 *   도메인 개념이라 테이블명과 1:1이 아니다(`api-and-db.md` "테이블 이름이 부모를 말한다").
 */
export type CommentRow = Database["public"]["Tables"]["transfer_deal_comment"]["Row"];
export type CommentVoteRow = Database["public"]["Tables"]["transfer_deal_comment_vote"]["Row"];

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** 내 표 — 1 좋아요 · -1 싫어요 · 0 표 없음(행이 없다) */
export type CommentVote = 1 | -1 | 0;

export interface Comment {
  id: CommentRow["id"];
  dealId: CommentRow["deal_id"];
  userId: CommentRow["user_id"];
  /** profiles 임베딩에서 온다 */
  authorNickname: ProfileRow["nickname"];
  /** 아바타의 **경로**(전체 URL이 아니다) — 화면이 `avatarUrl()`로 조립한다 */
  authorAvatarPath: ProfileRow["avatar_path"];
  content: CommentRow["content"];
  /** null = 루트 댓글. 깊이는 DB 트리거(transfer_deal_comment_check_depth)가 1로 제한한다 */
  parentId: CommentRow["parent_id"];
  createdAt: CommentRow["created_at"];
  /** 좋아요·싫어요 합계 — 트리거가 관리하는 값이다(내 표도 이미 들어 있다) */
  upCount: CommentRow["up_count"];
  downCount: CommentRow["down_count"];
  /**
   * 내 표 — 투표 임베딩이 SELECT 정책상 "내 행만"이라 0~1개가 온다. 비로그인은 항상 0.
   * ⚠ 그래서 이 값을 담은 응답은 **사용자별**이다 → 쿼리 키가 userId로 스코프된다(`commentKeys`).
   */
  myVote: CommentVote;
  /**
   * **조회 시점의** 내 표 — 낙관적 갱신은 `myVote`만 바꾸고 이 값은 그대로 둔다.
   * 인기순 정렬이 "이번에 누른 변화분"만 빼는 데 쓴다(`sortThreads`) — 다시 받으면 `myVote`와 같아진다.
   */
  fetchedVote: CommentVote;
}

/** 루트 댓글 + 그 답글들. 깊이 1까지만이라 replies 안에 또 스레드가 들어가지 않는다 */
export interface CommentThread {
  comment: Comment;
  replies: Comment[];
}

/**
 * 받아 온 댓글 목록.
 * ⚠ `truncated`는 **상한보다 한 건 더 받아서** 판정한다(`buildCommentList`) — 상한과 같은 수만 보고
 *   "잘렸다"고 하면 정확히 상한만큼 있는 딜에서 거짓말이 된다.
 */
export interface CommentList {
  /** 오래된 순(루트·답글 섞여 있다 — 스레드는 `buildCommentThreads`가 만든다) */
  comments: Comment[];
  /** 상한을 넘어 오래된 댓글이 잘렸는가 */
  truncated: boolean;
}

/** 루트 댓글 정렬 — 인기순(좋아요 − 싫어요) · 최신순. 답글은 정렬하지 않고 작성순이다 */
export type CommentSort = "top" | "latest";

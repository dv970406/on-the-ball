"use client";

import { type ReactNode, type RefObject, useMemo, useState } from "react";
import {
  COMMENT_LIST_LIMIT,
  CommentItem,
  buildCommentThreads,
  sortThreads,
  type Comment,
  type CommentList,
  type CommentSort,
} from "@/entities/comment";
import type { SessionStatus } from "@/entities/session";
import { CommentVoteButtons } from "@/features/vote-comment";
import { cn, formatCount } from "@/shared/lib";
import { EmptyState, Skeleton, StaleBanner } from "@/shared/ui";
import { ReplyComposerProvider, useReplyField, useReplyTarget } from "../model/reply-composer";
import { useCommentComposer } from "../model/use-comment-composer";
import { CommentForm, CommentSignInField } from "./comment-form";

type Thread = ReturnType<typeof buildCommentThreads>[number];

interface CommentSectionProps {
  dealId: number;
  /** `undefined`면 아직 받지 못한 것(로딩 또는 실패) */
  list: CommentList | undefined;
  /** `list`가 자리 표시(다른 사용자로 그린 SSR 목록)인가 — 그동안 대상 소실을 판정하지 않는다 */
  isPlaceholder: boolean;
  error: Error | null;
  onRetry: () => void;
  /** 세션 상태 — 입력칸·답글·표를 3분기한다(`loading`을 비로그인처럼 다루지 않는다) */
  status: SessionStatus;
  /** `나` 뱃지·삭제 버튼 판정 — 복원 전에는 서버가 본 사용자다(뷰가 고른다) */
  userId: string | undefined;
  nowMs: number | null;
  /** 비로그인이 누른 동작 — `~하려면` 구절. 안내는 뷰가 **한 벌** 그린다 */
  onSignInRequired: (action: string) => void;
  /**
   * 댓글마다 붙는 `삭제` — 확인 요청과 진행 표시(`use-comment-deletion`의 `item` 묶음).
   * 다이얼로그는 뷰가 프레임 자리에 그린다(`Dialog`가 `absolute`다).
   */
  deletion: { request: (commentId: number) => void; isDeleting: (commentId: number) => boolean };
  /** 내가 삭제를 확정한 댓글 — 답글 칸이 "남이 지웠다" 안내를 가를 때 쓴다 */
  confirmedDeletes: ReadonlySet<number>;
  /** 답글 칸의 대상이 사라졌을 때 포커스를 받을 자리(댓글 탭 패널) */
  focusFallbackRef: RefObject<HTMLElement | null>;
}

const SORT_OPTIONS: { key: CommentSort; label: string }[] = [
  { key: "top", label: "인기순" },
  { key: "latest", label: "최신순" },
];

const PLACEHOLDER = "이 이적, 어떻게 보세요?";

/** 표·답글·삭제 줄의 텍스트 버튼 — 32px, 히트 영역은 위아래로 넓혀 44px, 가로는 최소 폭 44px */
const ACTION_BUTTON =
  "relative inline-flex h-8 min-w-11 items-center justify-center whitespace-nowrap rounded-sm px-2 text-[12px] text-ink-mute after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] disabled:opacity-40";

/**
 * 상세의 댓글 탭 — 입력칸 · 정렬 · 목록(답글 1단계) · 빈 상태.
 *
 * ⚠ **정렬은 받아 온 목록에서 뷰가 한다**(`sortThreads`) — 쿼리 키에 정렬을 넣으면 서버 프리페치와
 *   키가 갈려 `initialData`가 캐시에 닿지 못한다(보드의 리그·정렬과 같은 이유).
 * ⚠ 에러 화면은 **보여줄 댓글이 없을 때만** 띄운다 — 댓글 작성·삭제가 매번 무효화를 걸어 리페치
 *   실패 경로가 자주 열린다. 데이터가 있으면 배너로만 알린다(`data-and-state.md`).
 * ⚠ **입력값 state를 이 컴포넌트에 두지 않는다.** 루트 입력칸은 `RootComposer`가, 답글 칸은
 *   `ReplyComposerProvider`가 훅을 든다 — 여기 두면 글자마다 댓글 목록 전체(최대 200개 + 표 버튼 400개)가
 *   다시 그려졌다(INP). 스레드 계산도 목록·정렬이 바뀔 때만 한다.
 */
export function CommentSection({
  dealId,
  list,
  isPlaceholder,
  error,
  onRetry,
  status,
  userId,
  nowMs,
  onSignInRequired,
  deletion,
  confirmedDeletes,
  focusFallbackRef,
}: CommentSectionProps) {
  const [sort, setSort] = useState<CommentSort>("top");

  const threads = useMemo(
    () => (list ? sortThreads(buildCommentThreads(list.comments), sort) : undefined),
    [list, sort],
  );

  /** 표·답글·삭제 줄 — 답글에는 `답글` 버튼이 없다(깊이 1 — DB 트리거도 같은 제한) */
  const actions = (comment: Comment) => {
    const canReply = comment.parentId === null;
    const busy = deletion.isDeleting(comment.id);
    return (
      <>
        <CommentVoteButtons
          dealId={dealId}
          comment={comment}
          onSignInRequired={() => onSignInRequired("좋아요·싫어요를 남기려면")}
        />
        {canReply && (
          <ReplyButton comment={comment} status={status} onSignInRequired={onSignInRequired} />
        )}
        {comment.userId === userId && (
          <button
            type="button"
            disabled={busy}
            className={cn(ACTION_BUTTON, "ml-auto text-ink-mute-2")}
            onClick={() => deletion.request(comment.id)}
          >
            {busy ? "삭제 중…" : "삭제"}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="pt-3.5">
      <RootComposer
        dealId={dealId}
        status={status}
        onSignInRequired={onSignInRequired}
        // 등록하면 새 댓글이 맨 위에 오도록 최신순으로 바꾼다
        onPosted={() => setSort("latest")}
      />

      {/*
        정렬 — 목록을 제자리에서 다시 늘어놓는 선택 토글이라 `aria-pressed`다(이동이 아니므로
        `aria-current`가 아니고, 화살표 키 모델을 구현하지 않으므로 `radiogroup`도 아니다).
      */}
      {/* gap 16 — 두 버튼의 히트 영역(좌우 8px씩)이 겹치지 않는 간격 */}
      <div className="flex gap-4 pb-1 pt-4">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={sort === option.key}
            onClick={() => setSort(option.key)}
            className={cn(
              // 글자는 12px이지만 히트 영역은 투명 의사요소로 44px 이상(세로 18+28, 가로 글자+16)
              "relative text-[12px] text-ink-mute-2 transition-colors duration-150 ease-otb after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-['']",
              sort === option.key && "font-medium text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {list === undefined && error === null && (
        // 골격은 실제 항목(아바타 + 두 줄)과 같은 높이다
        <div aria-hidden className="flex flex-col gap-3 py-3.5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {list === undefined && error !== null && (
        <EmptyState title="댓글을 불러오지 못했어요" description={error.message} onRetry={onRetry} />
      )}

      {list !== undefined && error !== null && <StaleBanner noun="댓글" onRetry={onRetry} />}

      {threads && threads.length === 0 && (
        <p className="py-8 text-center text-[13px] text-ink-mute-2">
          아직 댓글이 없어요. 첫 댓글을 남겨 보세요.
        </p>
      )}

      {list?.truncated && (
        <p className="py-2 text-center text-[12px] text-ink-mute-2">
          최근 {formatCount(COMMENT_LIST_LIMIT)}개만 표시하고 있어요.
        </p>
      )}

      {/*
        답글 칸은 **섹션이 한 벌** 든다 — 한 번에 한 곳만 열리고, 칸을 닫아도 실패 롤백이 도착한다.
        대상이 목록에서 사라지면 칸을 닫는 판정도 그 훅이 갖는다(`watch`). 목록이 비어 있어도 마운트해
        둔다 — 답글을 쓰던 댓글이 지워져 목록이 비면 "삭제됐어요" 안내가 그 훅에서 나온다.
      */}
      <ReplyComposerProvider
        dealId={dealId}
        fallbackFocusRef={focusFallbackRef}
        watch={{
          comments: list?.comments,
          isPlaceholder,
          confirmedIds: confirmedDeletes,
          signedIn: status === "authenticated",
        }}
      >
        {threads && threads.length > 0 && (
          <ul>
            {threads.map(({ comment, replies }) => (
              // 구분선은 항목 사이에만 — 정렬 바로 아래 첫 항목에는 없다
              <li key={comment.id} className="border-t border-hairline-cool first:border-t-0">
                <CommentItem
                  comment={comment}
                  isMine={comment.userId === userId}
                  nowMs={nowMs}
                  actions={actions(comment)}
                >
                  <ReplyArea
                    comment={comment}
                    replies={replies}
                    status={status}
                    userId={userId}
                    nowMs={nowMs}
                    actions={actions}
                  />
                </CommentItem>
              </li>
            ))}
          </ul>
        )}
      </ReplyComposerProvider>
    </div>
  );
}

/**
 * 루트 입력칸 — 입력값 state를 **여기** 가둔다(글자마다 이 컴포넌트만 다시 그린다).
 * ⚠ 비로그인·복원 중에도 훅을 마운트해 둔다 — 로그인이 확정된 뒤에 만들면 그 사이 진행 중이던
 *   뮤테이션의 옵저버(실패 롤백)가 사라진다. 그리는 것만 세션으로 가른다.
 */
function RootComposer({
  dealId,
  status,
  onSignInRequired,
  onPosted,
}: {
  dealId: number;
  status: SessionStatus;
  onSignInRequired: (action: string) => void;
  onPosted: () => void;
}) {
  const root = useCommentComposer(dealId, { onPosted });

  if (status === "guest") {
    return (
      <CommentSignInField
        placeholder={PLACEHOLDER}
        onClick={() => onSignInRequired("댓글을 쓰려면")}
      />
    );
  }
  return (
    <CommentForm
      field={root.field}
      label="댓글 입력"
      placeholder={PLACEHOLDER}
      disabled={status === "loading"}
    />
  );
}

/** `답글` 버튼 — 답글 대상만 컨텍스트로 읽는다(칸을 여닫을 때만 다시 그려진다) */
function ReplyButton({
  comment,
  status,
  onSignInRequired,
}: {
  comment: Comment;
  status: SessionStatus;
  onSignInRequired: (action: string) => void;
}) {
  const { targetId, open } = useReplyTarget();
  return (
    <button
      type="button"
      className={ACTION_BUTTON}
      aria-expanded={targetId === comment.id}
      onClick={(e) => {
        if (status === "loading") return;
        if (status === "guest") {
          onSignInRequired("답글을 달려면");
          return;
        }
        // 누른 버튼을 넘긴다 — 칸이 닫히면 포커스를 여기로 돌려준다
        open({ commentId: comment.id, nickname: comment.authorNickname }, e.currentTarget);
      }}
    >
      답글
    </button>
  );
}

/** 답글 목록과 답글 입력칸 — 본문 칸 안쪽 · 왼쪽 1px 레일. 둘 다 없으면 아무것도 그리지 않는다 */
function ReplyArea({
  comment,
  replies,
  status,
  userId,
  nowMs,
  actions,
}: {
  comment: Comment;
  replies: Thread["replies"];
  status: SessionStatus;
  userId: string | undefined;
  nowMs: number | null;
  actions: (comment: Comment) => ReactNode;
}) {
  const { targetId } = useReplyTarget();
  const replying = targetId === comment.id && status === "authenticated";
  if (replies.length === 0 && !replying) return null;

  return (
    <div className="mt-1 border-l border-hairline-cool pl-3">
      {replies.length > 0 && (
        <ul>
          {replies.map((r) => (
            <li key={r.id}>
              <CommentItem
                comment={r}
                reply
                isMine={r.userId === userId}
                nowMs={nowMs}
                actions={actions(r)}
              />
            </li>
          ))}
        </ul>
      )}
      {replying && <ReplyForm nickname={comment.authorNickname} />}
    </div>
  );
}

/** 답글 입력칸 — 입력값(`field`)은 이 컴포넌트만 읽는다(글자마다 여기만 다시 그려진다) */
function ReplyForm({ nickname }: { nickname: string }) {
  const field = useReplyField();
  const { close } = useReplyTarget();
  return (
    <CommentForm
      field={field}
      label={`${nickname}님에게 답글 입력`}
      placeholder={`${nickname}님에게 답글`}
      onCancel={close}
      className="mb-1.5 mt-2"
    />
  );
}

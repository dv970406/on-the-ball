"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Bookmark,
  Flag,
  Flame,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserX,
} from "lucide-react";
import { ROUTES, avatarUrl } from "@/shared/config";
import { formatCount, formatRelativeTime, useNowMs } from "@/shared/lib";
import {
  ActionChip,
  Avatar,
  Dialog,
  EmptyState,
  Icon,
  Markdown,
  Pill,
  Sheet,
  SheetItem,
  Skeleton,
  buttonClassName,
} from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { usePollQuery } from "@/entities/poll";
import { isEdited, isHotPost, usePostQuery } from "@/entities/post";
import { useSessionStore } from "@/entities/session";
import { PollVote } from "@/features/cast-poll-vote";
import { LikeButton } from "@/features/toggle-post-like";
import { useRecordPostView } from "@/features/view-post";
import type { ReplyTarget } from "../model/reply-target";
import { usePostDeletion } from "../model/use-post-deletion";
import { CommentBar } from "./comment-bar";
import { CommentSection } from "./comment-section";

export function PostDetailView({ postId }: { postId: number }) {
  const router = useRouter();
  const { data: post, isPending, error, refetch } = usePostQuery(postId);
  const user = useSessionStore((s) => s.user);
  const sessionStatus = useSessionStore((s) => s.status);
  const deletion = usePostDeletion(postId);
  // ⚠ 키가 userId로 스코프된다 — `myOptionId`는 "나"에 종속된 값이라, 상세를 연 채 계정이
  //   바뀌면 이전 사용자의 선택이 남는다(`identityKeys`와 같은 이유).
  //   집계 조회는 뮤테이션과 같은 자리(`PollVote`)에 있다 — 사유는 그 파일 주석.
  // ⚠ 세션이 확정된 뒤에만 조회한다 — 키가 userId로 스코프돼 있어 복원 중에 부르면
  //   블록이 언마운트→리마운트되며 레이아웃이 두 번 튄다(사유는 usePollQuery 주석).
  const { data: poll, error: pollError } = usePollQuery(
    postId,
    user?.id,
    sessionStatus !== "loading",
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // HOT 판정용 — 렌더 중 Date.now()는 순수하지 않다(use-now.ts 주석 참고)
  const nowMs = useNowMs();

  // 상세 진입 시 조회수 +1 (세션당 1회, 실패는 삼킨다)
  useRecordPostView(postId);

  const header = (extra?: React.ReactNode) => (
    <SubHeader
      title={post?.category ?? "게시글"}
      fallbackHref={ROUTES.postList}
      actions={extra}
    />
  );

  if (isPending) {
    return (
      <>
        {header()}
        <main className="flex flex-col gap-3 px-5 py-6">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-3 h-40 w-full" />
        </main>
      </>
    );
  }

  /**
   * ⚠ 에러 화면으로 갈아치우는 건 **보여줄 글이 없을 때뿐이다.**
   *   TanStack Query는 성공 후 리페치가 실패해도 data를 유지하는데, 조건 없이 error를 먼저
   *   보면 이미 읽고 있던 글이 통째로 사라진다 — 좋아요 한 번(onSettled 무효화)에
   *   네트워크가 잠깐 끊기면 본문이 날아가는 식이다.
   *   캐시가 있으면 그대로 보여주고, 실패는 아래 배너로만 알린다.
   */
  if (error && !post) {
    return (
      <>
        {header()}
        <main>
          <EmptyState
            title="글을 불러오지 못했어요"
            description={error.message}
            onRetry={() => void refetch()}
          />
        </main>
      </>
    );
  }

  if (!post) {
    return (
      <>
        {header()}
        <main>
          <EmptyState
            title="글을 찾을 수 없어요"
            description="삭제되었거나 없는 글이에요."
          />
        </main>
      </>
    );
  }

  const isMine = post.authorId === user?.id;
  const hot = nowMs !== null && isHotPost(post, nowMs);

  return (
    <>
      {header(
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="더보기"
          aria-haspopup="dialog"
          className="flex size-11 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-otb active:bg-canvas-soft"
        >
          <Icon as={MoreHorizontal} size={20} />
        </button>,
      )}

      {/*
        하단 고정 댓글 입력이 본문을 가리지 않도록 그 높이만큼 패딩을 둔다.
        ⚠ `h-full`이 아니라 `min-h-0 flex-1` — SubHeader와 형제라 `h-full`이면 프레임이
          헤더 높이(71px)만큼 넘친다. `relative`는 sr-only가 새어나가지 않게 한다.
      */}
      <main className="relative min-h-0 flex-1 overflow-y-auto pb-[calc(84px+env(safe-area-inset-bottom))]">
        {/* 캐시된 글은 그대로 두고 최신화 실패만 알린다 */}
        {error && (
          <p
            className="border-b border-hairline bg-canvas-soft px-5 py-2.5 text-[12px] text-ink-mute"
          >
            최신 내용을 불러오지 못했어요. 표시된 내용이 오래된 것일 수 있어요.
          </p>
        )}

        {/* 독립 콘텐츠라 article + header */}
        <article className="px-5 pt-[18px]">
          <header>
            <div className="flex items-center gap-2">
              <Pill variant="soft">{post.category}</Pill>
              {hot && (
                <span className="inline-flex items-center gap-[3px] text-[10px] font-medium text-crimson">
                  <Icon as={Flame} size={11} />
                  HOT
                </span>
              )}
            </div>

            <h1 className="mt-2.5 text-pretty text-[23px] font-medium leading-[1.32] tracking-[-0.7px] text-ink">
              {post.title}
            </h1>

            <div className="mt-4 flex items-center gap-2.5">
              {/* 사진이 없으면 Avatar가 닉네임 첫 글자 이니셜로 떨어진다 */}
              <Avatar
                label={post.authorNickname}
                src={avatarUrl(post.authorAvatarPath)}
                size={34}
                className="text-[13px]"
              />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-ink">
                  {post.authorNickname}
                </div>
                <div className="mt-0.5 font-mono text-[10px] tabular-nums tracking-[0.2px] text-ink-mute-2">
                  <time dateTime={post.createdAt}>
                    {formatRelativeTime(post.createdAt)}
                  </time>
                  {isEdited(post) && " · 수정됨"} · 조회{" "}
                  {formatCount(post.viewCount)}
                </div>
              </div>
              {/*
                팔로우는 핸드오프 7장의 미구현 목록 — 자리만 두고 동작을 발명하지 않는다.
                ⚠ span + aria-disabled였는데, span의 암묵 role(generic)은 aria-* 상태를
                  지원하지 않아 그냥 본문 중간의 단어로 읽혔다. 진짜 disabled 버튼으로 둔다.
              */}
              <button
                type="button"
                disabled
                className={buttonClassName({
                  variant: "secondary",
                  size: "sm",
                  className: "ml-auto disabled:opacity-40",
                })}
              >
                팔로우
              </button>
            </div>
          </header>

          {/* 본문은 마크다운 원문이다 — 이미지는 에디터가 넣은 `![](…)`를 Markdown이 렌더한다 */}
          <div className="mt-5">
            <Markdown>{post.content}</Markdown>
          </div>

          {/* 투표는 본문 아래·액션 바 위 — 이 글의 일부이므로 <article> 안이다 */}
          {poll && <PollVote poll={poll} />}
          {/* ⚠ 조회 실패를 삼키면 **투표 없는 글과 구분되지 않는다.** 같은 화면의 본문 쿼리가
              배너로 알리는 것과 형태를 맞춘다(data-and-state.md). */}
          {pollError && !poll && (
            <p className="mt-5 text-[12px] text-ink-mute">투표를 불러오지 못했어요.</p>
          )}

          {/*
            액션 바 — 위아래 헤어라인.
            ⚠ 반드시 <article> **안**이다. 좋아요·댓글 수는 이 글의 메타데이터라,
              밖에 두면 보조기술이 글을 한 단위로 읽을 때 딸려오지 않는다.
          */}
          {/* -mx-5 px-5: article의 좌우 패딩 안에 있으면서 헤어라인만 화면 끝까지 긋는다 */}
          <footer className="-mx-5 mt-[22px] flex items-center gap-2 border-y border-hairline-cool px-5 py-3.5">
            <LikeButton
              postId={post.id}
              likeCount={post.likeCount}
              isLiked={post.isLiked}
            />
            {/* ⚠ 표시 전용이다 — 누를 수 있는데 아무 일도 안 일어나면 고장으로 읽힌다.
                  옆의 저장 칩과 같이 disabled로 둔다(댓글은 바로 아래에 이어진다). */}
            {/* ⚠ 라벨을 `aria-label`로 붙이지 않는다 — 그러면 버튼 **콘텐츠를 덮어써서**
                  정작 개수가 읽히지 않는다("댓글 수, 버튼"). sr-only 텍스트는 덮지 않는다. */}
            <ActionChip icon={MessageCircle} disabled>
              <span className="sr-only">댓글 </span>
              {formatCount(post.commentCount)}
            </ActionChip>
            {/* 저장(북마크)은 DB에 테이블이 없다 — 자리만 두고 토스트를 발명하지 않는다 */}
            <ActionChip
              icon={Bookmark}
              iconSize={17}
              aria-label="저장"
              disabled
              className="ml-auto border-0 px-1.5"
            />
          </footer>
        </article>

        <CommentSection
          postId={post.id}
          commentCount={post.commentCount}
          postAuthorId={post.authorId}
          onReply={setReplyTo}
        />
      </main>

      {/* 전송 실패 시 답글 대상까지 되돌려야 재전송이 루트 댓글이 되지 않는다 (comment-bar 주석) */}
      <CommentBar
        postId={post.id}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onRestoreReply={setReplyTo}
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        label="글 메뉴"
      >
        {isMine ? (
          <>
            <SheetItem
              icon={Pencil}
              onClick={() => {
                setSheetOpen(false);
                router.push(ROUTES.postEdit(post.id));
              }}
            >
              수정하기
            </SheetItem>
            <SheetItem
              icon={Trash2}
              danger
              onClick={() => {
                setSheetOpen(false);
                setAskDelete(true);
              }}
            >
              삭제하기
            </SheetItem>
          </>
        ) : (
          // 아래 3개는 핸드오프 7장의 미구현 목록 — 자리만 둔다
          <>
            <SheetItem icon={Bell} disabled>
              이 글 알림 끄기
            </SheetItem>
            <SheetItem icon={UserX} disabled>
              {post.authorNickname} 차단하기
            </SheetItem>
            <SheetItem icon={Flag} danger disabled>
              신고하기
            </SheetItem>
          </>
        )}
      </Sheet>

      <Dialog
        open={askDelete}
        onCancel={() => setAskDelete(false)}
        onConfirm={() => {
          setAskDelete(false);
          deletion.remove();
        }}
        title="이 글을 삭제할까요?"
        description={`댓글 ${formatCount(post.commentCount)}개도 같이 사라져요. 되돌릴 수 없습니다.`}
        cancelLabel="취소"
        confirmLabel="삭제"
        destructive
      />

      {deletion.error && (
        // 하단 고정 댓글 입력(z-60) 위, 오버레이(80~95) 아래 — 시트가 열린 동안은 가려도 된다
        <p
          className="absolute inset-x-0 bottom-24 z-[66] px-5 text-center text-[12px] text-crimson"
        >
          {deletion.error.message}
        </p>
      )}
    </>
  );
}

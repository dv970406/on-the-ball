"use client";

import { useEffect, useRef, useState } from "react";
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
import { ROUTES } from "@/shared/config";
import { clearScrollRestore, formatCount, formatRelativeTime, useNowMs } from "@/shared/lib";
import {
  ActionChip,
  Avatar,
  Dialog,
  EmptyState,
  Icon,
  Markdown,
  Pill,
  Sheet,
  SheetCloseItem,
  SheetItem,
  Skeleton,
  buttonClassName,
  useToast,
} from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import { isEdited, isHotPost, usePostQuery } from "@/entities/post";
import { useSessionStore } from "@/entities/session";
import { useDeletePost } from "@/features/delete-post";
import { LikeButton } from "@/features/toggle-post-like";
import { useRecordPostView } from "@/features/view-post";
import { CommentBar, type ReplyTarget } from "./comment-bar";
import { CommentSection } from "./comment-section";

export function PostDetailView({ postId }: { postId: number }) {
  const router = useRouter();
  const { data: post, isPending, error, refetch } = usePostQuery(postId);
  const user = useSessionStore((s) => s.user);
  const deletePost = useDeletePost(postId);
  const toast = useToast();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // HOT 판정용 — 렌더 중 Date.now()는 순수하지 않다(use-now.ts 주석 참고)
  const nowMs = useNowMs();

  /**
   * 삭제 중복 실행 동기 가드 — PostForm·CommentBar와 같은 패턴.
   * 다이얼로그가 확인 즉시 닫히지만 `disabled`는 렌더 이후에야 반영되므로, 같은 tick의
   * 두 번째 클릭이 RPC를 한 번 더 쏜다. 두 번째는 이미 삭제된 글이라
   * "존재하지 않는 게시글입니다"로 실패해 **이동 직전에 엉뚱한 에러가 깜빡인다.**
   */
  const deletingRef = useRef(false);
  useEffect(() => {
    if (!deletePost.isPending) deletingRef.current = false;
  }, [deletePost.isPending]);

  // 상세 진입 시 조회수 +1 (세션당 1회, 실패는 삼킨다)
  useRecordPostView(postId);

  const header = (extra?: React.ReactNode) => (
    <SubHeader title={post?.category ?? "게시글"} fallbackHref={ROUTES.postList} actions={extra} />
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
            live
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
          <EmptyState title="글을 찾을 수 없어요" description="삭제되었거나 없는 글이에요." />
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

      {/* 하단 고정 댓글 입력이 본문을 가리지 않도록 그 높이만큼 패딩을 둔다 */}
      <main className="h-full overflow-y-auto pb-[calc(84px+env(safe-area-inset-bottom))]">
        {/* 캐시된 글은 그대로 두고 최신화 실패만 알린다 */}
        {error && (
          <p
            role="status"
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
              {/* profiles에 아바타 이미지가 없다 — 닉네임 첫 글자 이니셜을 쓴다 */}
              <Avatar label={post.authorNickname} size={34} className="text-[13px]" />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-ink">
                  {post.authorNickname}
                </div>
                <div className="mt-0.5 font-mono text-[10px] tabular-nums tracking-[0.2px] text-ink-mute-2">
                  <time dateTime={post.createdAt}>{formatRelativeTime(post.createdAt)}</time>
                  {isEdited(post) && " · 수정됨"} · 조회 {formatCount(post.viewCount)}
                </div>
              </div>
              {/* 팔로우는 핸드오프 7장의 미구현 목록 — 자리만 두고 동작을 발명하지 않는다 */}
              <span
                aria-disabled
                className={buttonClassName({
                  variant: "secondary",
                  size: "sm",
                  className: "pointer-events-none ml-auto opacity-40",
                })}
              >
                팔로우
              </span>
            </div>
          </header>

          {/* 본문은 마크다운 원문이다 — 태그·본문 이미지는 데이터가 없어 렌더하지 않는다 */}
          <div className="mt-5">
            <Markdown>{post.content}</Markdown>
          </div>
        </article>

        {/* 액션 바 — 위아래 헤어라인 */}
        <div className="mt-[22px] flex items-center gap-2 border-y border-hairline-cool px-5 py-3.5">
          <LikeButton postId={post.id} likeCount={post.likeCount} isLiked={post.isLiked} />
          <ActionChip icon={MessageCircle} aria-label="댓글 수">
            {formatCount(post.commentCount)}
          </ActionChip>
          {/* 저장(북마크)은 DB에 테이블이 없다 — 자리만 두고 토스트를 발명하지 않는다 */}
          <ActionChip
            icon={Bookmark}
            iconSize={17}
            aria-label="저장"
            aria-disabled
            className="ml-auto border-0 px-1.5"
          />
        </div>

        <CommentSection
          postId={post.id}
          commentCount={post.commentCount}
          postAuthorId={post.authorId}
          onReply={setReplyTo}
        />
      </main>

      <CommentBar postId={post.id} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} label="글 메뉴">
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
        <SheetCloseItem onClick={() => setSheetOpen(false)} />
      </Sheet>

      <Dialog
        open={askDelete}
        onCancel={() => setAskDelete(false)}
        onConfirm={() => {
          setAskDelete(false);
          if (deletingRef.current) return;
          deletingRef.current = true;
          deletePost.mutate(undefined, {
            onSuccess: () => {
              // 방금 본 글이 목록에서 빠져 위치가 밀린다 → 복원하지 않고 맨 위에서 시작
              clearScrollRestore(ROUTES.postList);
              router.replace(ROUTES.postList);
              toast("글을 삭제했어요");
            },
          });
        }}
        title="이 글을 삭제할까요?"
        description={`댓글 ${formatCount(post.commentCount)}개도 같이 사라져요. 되돌릴 수 없습니다.`}
        cancelLabel="취소"
        confirmLabel="삭제"
        destructive
      />

      {deletePost.error && (
        <p role="alert" className="absolute inset-x-0 bottom-24 z-[90] px-5 text-center text-[12px] text-crimson">
          {deletePost.error.message}
        </p>
      )}
    </>
  );
}

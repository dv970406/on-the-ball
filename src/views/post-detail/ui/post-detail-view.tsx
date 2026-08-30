"use client";

import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Flag,
  Flame,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserX,
} from "lucide-react";
import { ROUTES, avatarUrl } from "@/shared/config";
import { formatCount, formatRelativeTime, useNowMs } from "@/shared/lib";
import {
  Avatar,
  Dialog,
  EmptyState,
  Icon,
  Markdown,
  Pill,
  Sheet,
  SheetItem,
  SignInDialog,
  Skeleton,
} from "@/shared/ui";
import { SubHeader } from "@/widgets/sub-header";
import type { Poll, PollResult } from "@/entities/poll";
import { type PostDetail, isEdited, isHotPost, usePostQuery } from "@/entities/post";
import { type Comment } from "@/entities/comment";
import { useSessionStore } from "@/entities/session";
import { PollVote } from "@/features/cast-poll-vote";
import { ReportReasonList } from "@/features/report-post";
import { LikeButton } from "@/features/toggle-post-like";
import { useRecordPostView } from "@/features/view-post";
import type { ReplyTarget } from "../model/reply-target";
import { usePostBlock } from "../model/use-post-block";
import { usePostPoll } from "../model/use-post-poll";
import { usePostDeletion } from "../model/use-post-deletion";
import { CommentBar } from "./comment-bar";
import { CommentSection } from "./comment-section";

/**
 * 본문 렌더는 **메모한다.**
 *
 * react-markdown v10의 `Markdown`은 평범한 함수라 내부에 `memo`도 `useMemo`도 없다 —
 * 호출될 때마다 unified 파이프라인(micromark → mdast → hast)을 처음부터 다시 돈다.
 * 이 뷰는 시트 열기·답글 대상 지정·좋아요 무효화로 자주 리렌더되는데, 그때마다 최대
 * `CONTENT_MAX`(20,000자) 본문이 통째로 재파싱됐다.
 *
 * ⚠ **메모는 `shared/ui/markdown.tsx`가 아니라 소비하는 이 뷰가 갖는다.** 그 파일은
 *   `"use client"`를 일부러 붙이지 않아 서버 렌더 여지를 남긴 모듈이라(architecture.md),
 *   거기에 `memo()`를 넣으면 그 성질이 깨진다.
 * ⚠ props가 `{ children: string, className? }` 뿐이라 얕은 비교가 정확히 맞는다.
 */
const MemoMarkdown = memo(Markdown);

interface PostDetailViewProps {
  postId: number;
  /**
   * 서버가 미리 조회한 글·댓글. **SEO를 위해 초기 HTML에 본문이 담기게 하는 장치다** —
   * 없으면 크롤러가 받는 것은 스켈레톤뿐이다.
   *
   * ⚠ **프리페치는 최적화일 뿐이다.** 서버 조회가 실패하면 `undefined`가 오고 화면은
   *   지금까지처럼 클라이언트 쿼리로 그린다(nextjs.md). 그래서 아래 로딩·에러 분기를
   *   그대로 둔다 — `initialData`가 있으면 애초에 그 분기에 들어가지 않는다.
   */
  initialPost?: PostDetail;
  initialComments?: Comment[];
  /**
   * 서버가 미리 조회한 투표. **질문·선택지도 그 글의 콘텐츠라 초기 HTML에 담는다.**
   * ⚠ **`null`과 `undefined`가 다른 뜻이다** — `null`은 "투표가 없는 글",
   *   `undefined`는 "프리페치하지 않았다"(클라이언트가 조회한다).
   */
  initialPoll?: Poll | null;
  /**
   * 서버가 미리 조회한 투표 집계 — **참여했을 때만 온다.**
   * ⚠ 없으면 참여한 사용자의 막대가 스켈레톤으로 그려졌다가 늘어나 시프트한다.
   */
  initialPollResults?: PollResult[];
  /**
   * 서버가 본 로그인 사용자.
   *
   * ⚠ **이게 없으면 투표 프리페치가 무의미해진다.** `pollKeys.detail`이 userId로 스코프돼
   *   있어서, 세션 복원 전 `undefined` 키로 찾으면 서버가 채운 캐시에 닿지 못하고 다시
   *   조회한다 — 블록이 한 번 스켈레톤으로 되돌아간다(`SurveyDetailView`와 같은 함정).
   */
  initialUserId?: string;
  /**
   * 서버가 렌더한 시점의 시각.
   *
   * ⚠ **없으면 "2시간 전"이 첫 렌더에 절대시각으로 나왔다가 마운트 직후 바뀐다** —
   *   글자 폭이 달라 눈에 띄는 시프트가 된다(FOUC처럼 보인다). 서버 시각을 받아 첫 렌더부터
   *   상대시각을 그리면 서버 HTML과 하이드레이션이 같은 문자열이라 시프트가 없다.
   *   `data-and-state.md`가 말한 "응답에 서버 기준 시각을 실어 초기 렌더에 쓴다"가 이것이다.
   */
  serverNowMs?: number;
}

export function PostDetailView({
  postId,
  initialPost,
  initialComments,
  initialPoll,
  initialPollResults,
  initialUserId,
  serverNowMs,
}: PostDetailViewProps) {
  const router = useRouter();
  const { data: post, isPending, isFetching: isFetchingPost, error, refetch } = usePostQuery(
    postId,
    initialPost,
  );
  const user = useSessionStore((s) => s.user);
  const sessionStatus = useSessionStore((s) => s.status);
  const deletion = usePostDeletion(postId);
  // ⚠ 훅은 조건 없이 부른다 — 아래에 로딩·에러 조기 반환이 있어 post가 아직 없을 수 있다.
  //   인자는 `block()`을 부를 수 있게 된 뒤(=글이 그려진 뒤)에만 쓰이므로 폴백이 무해하다.
  const blocking = usePostBlock(post?.authorId ?? "", post?.authorNickname ?? "");
  // 투표 조회의 **세션·프리페치 판정은 훅이 소유한다** — 네 신호(세션 상태·서버가 준
  // initialUserId·initialPoll의 undefined/null·스토어 user)가 서로를 조건으로 삼는 자리라
  // 뷰에 두면 입축구 상세와 판정이 갈린다(사유는 그 파일 주석).
  // 집계 조회는 뮤테이션과 같은 자리(`PollVote`)에 있다 — 사유는 그 파일 주석.
  const { poll, error: pollError } = usePostPoll({ postId, initialPoll, initialUserId });

  /**
   * 오버플로 시트의 **열림 여부와 단계를 따로 둔다.** 한 오버레이의 children만 바꾸는 이유는
   * 시트 위에 시트를 겹치면 useFocusTrap이 이중이 되고 aria-modal 노드도 둘이 되기 때문이다
   * (ReportReasonList 주석).
   *
   * ⚠ 닫을 때 **단계를 되돌리지 않는다.** 시트는 퇴장 애니메이션(140ms) 동안 DOM에 남으므로,
   *   닫으면서 단계를 "menu"로 되돌리면 사유 목록이 오버플로 메뉴로 갈아끼워진 채 내려간다
   *   — 사용자가 마지막으로 보는 프레임이 방금 떠난 화면이 아니다. 단계는 **다시 열 때** 정한다.
   */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStage, setSheetStage] = useState<"menu" | "report">("menu");
  const [askBlock, setAskBlock] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  /**
   * 비로그인이 로그인 필요한 액션을 눌렀을 때의 안내 — **무엇을 하려 했는지**를 담는다.
   *
   * ⚠ 다이얼로그는 **이 화면에 한 벌뿐이다.** 좋아요·투표·차단·신고가 같은 자리를 쓰고
   *   문구만 갈린다 — 액션마다 `Dialog`를 두면 `absolute` 기준이 스크롤 `<main>`이 되어
   *   스크롤한 만큼 화면 밖에 뜬다(`SignInDialog` 주석).
   */
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // HOT 판정용 — 렌더 중 Date.now()는 순수하지 않다(use-now.ts 주석 참고)
  // 마운트 전에는 서버가 준 시각을 쓴다 — 상대시각이 첫 렌더부터 그려진다
  // ⚠ **서버 시각이 우선이다** — `useNowMs()`는 모듈 스코프에 세션당 한 번 고정되어 앱을
  //   처음 연 순간에 굳는다(사유는 `use-now.ts`). 그 값을 앞에 두면 갓 받은 서버 시각을
  //   낡은 클라 시계가 이긴다.
  const clientNowMs = useNowMs();
  const nowMs = serverNowMs ?? clientNowMs ?? null;

  // 상세 진입 시 조회수 +1 (세션당 1회, 실패는 삼킨다)
  useRecordPostView(postId);

  const header = (extra?: React.ReactNode) => (
    <SubHeader
      title={post?.category ?? "게시글"}
      // 말머리는 바로 아래 칩이 이미 보여준다 — 헤더 라벨은 공유 시트에만 쓴다
      titleHidden
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
            onRetry={() => refetch()}
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
  // 내 글이면 삭제, 남의 글이면 차단 — 두 분기가 배타적이라 한쪽이 다른 쪽을 가릴 일이 없다
  const actionError = (isMine ? deletion.error : blocking.error)?.message ?? null;
  const hot = nowMs !== null && isHotPost(post, nowMs);

  return (
    <>
      {header(
        <button
          type="button"
          onClick={() => {
            setSheetStage("menu");
            setSheetOpen(true);
          }}
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
                    {formatRelativeTime(post.createdAt, nowMs)}
                  </time>
                  {isEdited(post) && " · 수정됨"} · 조회{" "}
                  {formatCount(post.viewCount)}
                </div>
              </div>
            </div>
          </header>

          {/* 본문은 마크다운 원문이다 — 이미지는 에디터가 넣은 `![](…)`를 Markdown이 렌더한다 */}
          <div className="mt-5">
            <MemoMarkdown>{post.content}</MemoMarkdown>
          </div>

          {/* 투표는 본문 아래·액션 바 위 — 이 글의 일부이므로 <article> 안이다 */}
          {poll && (
            <PollVote
              poll={poll}
              onSignInRequired={() => setSignInAction("투표에 참여하려면")}
              initialUserId={initialUserId}
              initialResults={initialPollResults}
            />
          )}
          {/* ⚠ 조회 실패를 삼키면 **투표 없는 글과 구분되지 않는다.** 같은 화면의 본문 쿼리가
              배너로 알리는 것과 형태를 맞춘다(data-and-state.md). */}
          {pollError && !poll && (
            <p className="mt-5 text-[12px] text-ink-mute">투표를 불러오지 못했어요.</p>
          )}

          {/*
            액션 바 — 위아래 헤어라인.
            ⚠ 반드시 <article> **안**이다. 좋아요 수는 이 글의 메타데이터라,
              밖에 두면 보조기술이 글을 한 단위로 읽을 때 딸려오지 않는다.
          */}
          {/* -mx-5 px-5: article의 좌우 패딩 안에 있으면서 헤어라인만 화면 끝까지 긋는다 */}
          <footer className="-mx-5 mt-[22px] flex items-center gap-2 border-y border-hairline-cool px-5 py-3.5">
            <LikeButton
              postId={post.id}
              likeCount={post.likeCount}
              isLiked={post.isLiked}
              onSignInRequired={() => setSignInAction("좋아요를 누르려면")}
            />
          </footer>
        </article>

        <CommentSection
          serverNowMs={serverNowMs}
          initialComments={initialComments}
          postId={post.id}
          commentCount={post.commentCount}
          commentCountFetching={isFetchingPost}
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
        label={sheetStage === "report" ? "신고 사유" : "글 메뉴"}
      >
        {sheetStage === "report" ? (
          <ReportReasonList postId={post.id} onDone={() => setSheetOpen(false)} />
        ) : isMine ? (
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
          /*
           * ⚠ 세션을 **3분기**한다 — `loading`을 비로그인과 같이 다루면 콜드 로드 직후
           *   로그인한 사용자가 로그인 안내를 본다. 같은 화면의 `LikeButton`·`CommentBar`·
           *   `PollVote`가 이미 그렇게 판정하므로 여기만 2분기면 한 화면 안에서 판정이 갈린다.
           * ⚠ `SheetItem`은 `button`이라 `Link`를 쓸 수 없다 → 비로그인은 항목을 **활성**으로
           *   두고 눌렀을 때 로그인 안내를 띄운다(시트를 먼저 닫는다 — 오버레이를 겹치지 않는다).
           */
          <>
            <SheetItem
              icon={UserX}
              disabled={sessionStatus === "loading"}
              onClick={() => {
                setSheetOpen(false);
                if (sessionStatus === "guest") {
                  setSignInAction(`${post.authorNickname}님을 차단하려면`);
                  return;
                }
                setAskBlock(true);
              }}
            >
              {post.authorNickname} 차단하기
            </SheetItem>
            <SheetItem
              icon={Flag}
              danger
              disabled={sessionStatus === "loading"}
              onClick={() => {
                if (sessionStatus === "guest") {
                  setSheetOpen(false);
                  setSignInAction("이 글을 신고하려면");
                  return;
                }
                // 시트를 닫지 않는다 — 같은 오버레이의 단계만 바꾼다(위 상태 주석)
                setSheetStage("report");
              }}
            >
              신고하기
            </SheetItem>
          </>
        )}
      </Sheet>

      <Dialog
        open={askBlock}
        onCancel={() => setAskBlock(false)}
        onConfirm={() => {
          setAskBlock(false);
          blocking.block();
        }}
        title={`${post.authorNickname}님을 차단할까요?`}
        description={
          "이 사람의 글과 댓글이 내 화면에서 보이지 않아요. " +
          "상대에게는 알리지 않고, 프로필의 “차단한 사용자”에서 언제든 해제할 수 있어요."
        }
        cancelLabel="취소"
        confirmLabel="차단"
        confirmTone="danger"
      />

      {/*
        로그인 안내 — 좋아요·투표·차단·신고가 **이 한 벌을 공유한다**(위 signInAction 주석).
        ⚠ `<main>` 밖이라야 한다 — `Dialog`의 `absolute`가 스크롤 영역을 기준으로 잡으면
          스크롤한 만큼 화면 밖에 뜬다.
      */}
      <SignInDialog
        open={signInAction !== null}
        onClose={() => setSignInAction(null)}
        action={signInAction ?? ""}
      />

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
        confirmTone="danger"
      />

      {actionError && (
        // 하단 고정 댓글 입력(z-60) 위, 오버레이(80~95) 아래 — 시트가 열린 동안은 가려도 된다
        <p
          className="absolute inset-x-0 bottom-24 z-[66] px-5 text-center text-[12px] text-crimson"
        >
          {actionError}
        </p>
      )}
    </>
  );
}

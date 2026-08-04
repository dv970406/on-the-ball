"use client";

import Link from "next/link";
import { Flame, Heart, MessageCircle } from "lucide-react";
import { ROUTES } from "@/shared/config";
import { cn, formatCount, formatRelativeTime, useNowMs } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import { isEdited } from "../api/mappers";
import { isHotPost } from "../lib/hot";
import type { PostListItem } from "../model/types";

/** 메타 구분자 — 2px 점 (프로토타입 `.cm-post-meta .sep`) */
function MetaDot() {
  return <span aria-hidden className="size-[2px] shrink-0 rounded-full bg-hairline-strong" />;
}

/**
 * 목록의 게시글 한 줄 (프로토타입 `.cm-post`).
 *
 * 썸네일은 렌더하지 않는다 — 이미지 데이터가 없고, 명세가 "이미지가 없는 자리에
 * 빈 박스를 두지 않는다"이므로 부재가 곧 규칙이다.
 *
 * 링크로 감싼 리스트 행이므로 article 래퍼 없이 li만 쓴다.
 * 제목은 페이지 h1(커뮤니티) 바로 아래 계층이라 h2.
 *
 * ⚠ HOT 판정은 useNowMs(마운트 후 값)로 한다 — 렌더 중 Date.now()는 순수하지 않다.
 *   첫 프레임에는 배지가 없다가 마운트 직후 나타난다(하이드레이션 안전).
 * ⚠ formatRelativeTime은 아직 내부에서 시계를 읽는다. 목록이 클라이언트 쿼리로만 그려져
 *   SSR HTML이 항상 스켈레톤이라 안전할 뿐이다 — 서버 프리페치를 붙이면 이것도
 *   서버 기준 시각을 받아 HOT 판정과 **한 곳에서 함께** 전환해야 한다.
 */
export function PostCard({ post }: { post: PostListItem }) {
  const nowMs = useNowMs();
  const hot = nowMs !== null && isHotPost(post, nowMs);

  return (
    <li>
      <Link
        href={ROUTES.post(post.id)}
        className="flex gap-3 border-b border-hairline-cool px-5 py-4 transition-colors duration-150 ease-otb active:bg-canvas-soft"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-ink-mute-2">
              {post.category}
            </span>
            {hot && (
              <span className="inline-flex items-center gap-[3px] text-[10px] font-medium text-crimson">
                <Icon as={Flame} size={11} />
                HOT
              </span>
            )}
          </div>

          <h2 className="mt-[5px] text-pretty text-[15px] font-medium leading-[1.4] tracking-[-0.3px] text-ink">
            {post.title}
          </h2>

          {/* 발췌는 2행에서 자른다 — 원문은 상세에서 본다 */}
          {post.excerpt && (
            <p className="mt-[5px] line-clamp-2 text-[13px] leading-[1.5] text-ink-mute">
              {post.excerpt}
            </p>
          )}

          <div className="mt-[9px] flex items-center gap-2 text-[11px] text-ink-mute-2">
            <span className="min-w-0 truncate">{post.authorNickname}</span>
            <MetaDot />
            <time dateTime={post.createdAt} className="shrink-0">
              {formatRelativeTime(post.createdAt)}
            </time>
            {isEdited(post) && (
              <>
                <MetaDot />
                <span className="shrink-0">수정됨</span>
              </>
            )}
            <MetaDot />
            {/* 목록에서는 좋아요를 잉크 래더로만 표현한다 — 이 화면의 컬러 이벤트는 0개다 */}
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-[3px] font-mono text-[10px] tabular-nums",
                post.isLiked && "text-ink",
              )}
            >
              <Icon as={Heart} size={11} className={post.isLiked ? "fill-current" : undefined} />
              {formatCount(post.likeCount)}
              <span className="sr-only">좋아요</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-[3px] font-mono text-[10px] tabular-nums">
              <Icon as={MessageCircle} size={11} />
              {formatCount(post.commentCount)}
              <span className="sr-only">댓글</span>
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

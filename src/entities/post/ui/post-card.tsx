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
 * ⚠ 렌더 중에 시계를 읽지 않는다 — HOT 판정도 상대시각도 `nowMs`를 받아 계산한다.
 * ⚠ **`serverNowMs`가 없으면 SSR에서 두 곳이 시프트한다**: HOT 배지가 서버 HTML에 아예
 *   없다가 마운트 직후 나타나고, 상대시각이 절대시각으로 그려졌다가 바뀐다.
 *   목록이 SSR되므로 서버 시각을 받아 **첫 프레임부터 최종 모습**을 그린다.
 */
export function PostCard({
  post,
  serverNowMs,
}: {
  post: PostListItem;
  /** 서버가 렌더한 시점의 시각 — 마운트 전 판정의 기준(PostDetailView와 같은 형태) */
  serverNowMs?: number;
}) {
  const nowMs = useNowMs() ?? serverNowMs ?? null;
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

          {/* 제목도 2행에서 자른다 — 화면 한도는 클라이언트만 강제하므로
              우회 삽입된 긴 제목이 카드를 세로로 늘이지 않게 여기서 막는다 */}
          <h2 className="mt-[5px] line-clamp-2 text-pretty text-[15px] font-medium leading-[1.4] tracking-[-0.3px] text-ink">
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
              {formatRelativeTime(post.createdAt, nowMs)}
            </time>
            {isEdited(post) && (
              <>
                <MetaDot />
                <span className="shrink-0">수정됨</span>
              </>
            )}
            <MetaDot />
            {/*
              내가 누른 좋아요는 **하트만** 에메랄드다(에메랄드 자리 표 — `styling.md`).
              윤곽선 없이 통짜로 칠한다 — 디자인 결정이다.
              ⚠ **숫자까지 물들이지 않는다.** 에메랄드(#3ecf8e)는 흰 배경 대비가 1.99:1이라
                10px 숫자를 실을 수 없다 — 색은 아이콘이 지고 값은 잉크가 진다.
              ⚠ **상태를 색 혼자 지지 않게 `fill-current`를 함께 둔다.** 안 누른 하트는 속이 빈
                윤곽이고 누른 하트는 꽉 찬 면이라, 색을 못 보아도 형태로 갈린다.
            */}
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-[3px] font-mono text-[10px] tabular-nums",
                post.isLiked && "text-ink",
              )}
            >
              <Icon
                as={Heart}
                size={11}
                className={post.isLiked ? "fill-current text-primary" : undefined}
              />
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

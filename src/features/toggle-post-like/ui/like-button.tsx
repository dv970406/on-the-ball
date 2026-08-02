"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { signInWithNext } from "@/shared/config";
import { cn, formatCount } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { useTogglePostLike } from "../model/use-toggle-post-like";

interface LikeButtonProps {
  postId: number;
  likeCount: number;
  isLiked: boolean;
}

/**
 * 상세 화면의 좋아요 버튼.
 *
 * 여기서는 좋아요가 이 뷰포트의 유일한 액션이라 활성 시 에메랄드를 쓴다
 * (목록 카드는 글쓰기 버튼이 컬러 이벤트를 가져가므로 잉크 래더로만 표현한다).
 *
 * disabled로 막지 않는다 — 낙관적 업데이트의 목적이 즉시 반응이고,
 * 최종 정답은 onSettled의 무효화가 확정한다.
 */
export function LikeButton({ postId, likeCount, isLiked }: LikeButtonProps) {
  const status = useSessionStore((s) => s.status);
  const pathname = usePathname();
  const toggleLike = useTogglePostLike(postId);

  const className = cn(
    "flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[13px] transition-colors duration-150 ease-otb",
    isLiked
      ? "border-primary bg-primary/[0.12] text-primary-deep"
      : "border-hairline-strong text-ink-mute",
  );

  // 비로그인은 아예 로그인으로 유도한다 — 훅의 RPC 호출은 어차피 DB가 거부한다
  if (status !== "authenticated") {
    return (
      <Link href={signInWithNext(pathname)} className={className}>
        <Icon as={Heart} size={15} />
        <span className="tnum">{formatCount(likeCount)}</span>
        <span className="sr-only">좋아요 (로그인 필요)</span>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => toggleLike.mutate()}
        aria-pressed={isLiked}
        className={className}
      >
        <Icon as={Heart} size={15} className={isLiked ? "fill-current" : undefined} />
        <span className="tnum">{formatCount(likeCount)}</span>
        <span className="sr-only">좋아요</span>
      </button>
      {toggleLike.error && (
        <span role="alert" className="text-[12px] text-crimson">
          {toggleLike.error.message}
        </span>
      )}
    </>
  );
}

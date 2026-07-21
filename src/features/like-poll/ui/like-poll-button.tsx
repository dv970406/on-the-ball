"use client";

import { Heart } from "lucide-react";
import { Icon } from "@/shared/ui";
import { cn, formatCount } from "@/shared/lib";
import { useTogglePollLike } from "../model/use-toggle-poll-like";

interface LikePollButtonProps {
  /** polls.slug (URL 식별자) */
  slug: string;
  likes: number;
  likedByMe: boolean;
}

/**
 * poll 좋아요 토글 버튼 — 하트 + 카운트.
 * Tifo 절제: 크롬에 에메랄드를 쓰지 않고 잉크 톤으로만(활성 시 채운 하트).
 */
export function LikePollButton({ slug, likes, likedByMe }: LikePollButtonProps) {
  const toggle = useTogglePollLike(slug);

  return (
    <button
      type="button"
      onClick={() => {
        if (!toggle.isPending) toggle.mutate();
      }}
      aria-pressed={likedByMe}
      aria-label={`좋아요 ${formatCount(likes)}개${likedByMe ? " — 좋아요 취소" : ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[12px] transition-colors",
        likedByMe
          ? "border-ink/[0.16] font-medium text-ink"
          : "border-hairline text-ink-mute",
      )}
    >
      <Icon as={Heart} size={13} className={cn(likedByMe && "fill-current")} />
      좋아요 <span className="tnum font-mono">{formatCount(likes)}</span>
    </button>
  );
}

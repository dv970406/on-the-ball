"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { signInWithNext } from "@/shared/config";
import { formatCount } from "@/shared/lib";
import { ActionChip, Icon, actionChipClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { useTogglePostLike } from "../model/use-toggle-post-like";

interface LikeButtonProps {
  postId: number;
  likeCount: number;
  isLiked: boolean;
}

/**
 * 상세 화면의 좋아요 칩 (프로토타입 `.cm-act`).
 *
 * 활성 시 배경이 에메랄드로 채워진다 — **이 화면의 유일한 컬러 이벤트**다
 * (목록 카드는 잉크 래더로만 표현한다).
 *
 * disabled로 막지 않는다 — 낙관적 업데이트의 목적이 즉시 반응이고,
 * 최종 정답은 onSettled의 무효화가 확정한다.
 */
export function LikeButton({ postId, likeCount, isLiked }: LikeButtonProps) {
  const status = useSessionStore((s) => s.status);
  const pathname = usePathname();
  const toggleLike = useTogglePostLike(postId);

  // 비로그인은 아예 로그인으로 유도한다 — 훅의 RPC 호출은 어차피 DB가 거부한다.
  // Link 안에 button을 넣지 않으므로 클래스만 공유한다(buttonClassName과 같은 패턴).
  if (status !== "authenticated") {
    return (
      <Link
        href={signInWithNext(pathname)}
        className={actionChipClassName({ className: "no-underline" })}
      >
        <Icon as={Heart} size={15} />
        {formatCount(likeCount)}
        <span className="sr-only">좋아요 (로그인 필요)</span>
      </Link>
    );
  }

  return (
    <>
      <ActionChip
        icon={Heart}
        active={isLiked}
        onClick={() => toggleLike.mutate()}
        className={isLiked ? "[&_svg]:fill-current" : undefined}
      >
        {formatCount(likeCount)}
        <span className="sr-only">좋아요</span>
      </ActionChip>
      {toggleLike.error && (
        <span role="alert" className="text-[12px] text-crimson">
          {toggleLike.error.message}
        </span>
      )}
    </>
  );
}

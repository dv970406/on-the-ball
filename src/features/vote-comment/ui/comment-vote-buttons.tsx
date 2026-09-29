"use client";

import { useEffect, useRef } from "react";
import { ThumbsDown, ThumbsUp, type LucideIcon } from "lucide-react";
import { cn, formatCount } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import type { Comment, CommentVote } from "@/entities/comment";
import { useSessionStore } from "@/entities/session";
import { useVoteComment } from "../model/use-vote-comment";

interface CommentVoteButtonsProps {
  dealId: number;
  comment: Comment;
  /**
   * 비로그인이 눌렀을 때 — 안내(`SignInDialog`)는 **뷰가 한 벌** 소유한다(`Dialog`가 `absolute`라
   * 댓글마다 두면 스크롤 영역 안에 항목 수만큼 생긴다 — `sign-in-dialog.tsx` 주석).
   */
  onSignInRequired: () => void;
}

/** 표 버튼 하나 — 32px 높이, 히트 영역은 위아래로 넓혀 44px, 가로는 최소 폭 44px로 채운다 */
function VoteButton({
  icon,
  label,
  count,
  pressed,
  activeClassName,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  pressed: boolean;
  activeClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "relative inline-flex h-8 min-w-11 items-center justify-center gap-1 whitespace-nowrap rounded-sm px-2 text-[12px] text-ink-mute transition-colors duration-150 ease-otb after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
        pressed && activeClassName,
      )}
    >
      {/* ⚠ 색만으로 상태를 말하지 않는다 — 누른 쪽은 아이콘을 채워 형태로도 구분한다(styling.md) */}
      <Icon as={icon} size={14} className={pressed ? "fill-current" : undefined} />
      {/*
        ⚠ `aria-label`을 쓰지 않는다 — 콘텐츠를 덮어써 **숫자가 읽히지 않는다**(code-quality.md).
          이름은 sr-only 글자 + 보이는 숫자로 "좋아요 12"가 된다.
      */}
      <span className="sr-only">{label}</span>
      <span className="font-mono text-[11px] tabular-nums">{formatCount(count)}</span>
    </button>
  );
}

/**
 * 댓글의 좋아요·싫어요. 같은 버튼을 다시 누르면 거두고, 반대 버튼을 누르면 옮긴다.
 *
 * - 좋아요 활성은 `primary-deep`(상승·확정의 색), 싫어요 활성은 `crimson`(하락·무산의 색) — 이적료
 *   변동폭(`FeeDelta`)과 같은 색 의미다. 에메랄드 자리는 styling.md 표에 등재돼 있다(상태 표시라 CTA 셈 밖이다).
 * - 숫자는 트리거가 관리하는 합계이고 **내 표가 이미 들어 있다**(낙관적 갱신이 함께 고친다).
 * - 세션 `status`를 3분기한다 — `loading`을 비로그인처럼 다루면 복원 중인 로그인 사용자가 안내를 본다.
 *
 * ⚠ **같은 tick의 연타를 prop으로 판정하지 않는다.** 낙관적 갱신은 캐시를 곧바로 고치지만 이 컴포넌트의
 *   `comment` prop은 다음 렌더에야 바뀌어서, 그 사이 들어온 두 번째 클릭은 옛 표를 보고 같은 요청을 한 번 더 만든다.
 *   → 마지막으로 요청한 표를 ref에 동기로 적어 두고, 캐시가 따라오면(`myVote`가 바뀌면) 비운다.
 *   롤백도 `myVote`를 바꾸므로 그때 함께 비워져 다시 캐시를 믿는다.
 */
export function CommentVoteButtons({ dealId, comment, onSignInRequired }: CommentVoteButtonsProps) {
  const status = useSessionStore((s) => s.status);
  const userId = useSessionStore((s) => s.user?.id);
  const vote = useVoteComment(dealId);
  const requestedRef = useRef<CommentVote | null>(null);

  useEffect(() => {
    requestedRef.current = null;
  }, [comment.myVote]);

  const press = (pressed: 1 | -1) => {
    if (status === "loading") return;
    if (status === "guest" || !userId) {
      onSignInRequired();
      return;
    }
    const current = requestedRef.current ?? comment.myVote;
    const next: CommentVote = current === pressed ? 0 : pressed;
    requestedRef.current = next;
    vote.mutate({ commentId: comment.id, userId, current, next });
  };

  return (
    // 두 버튼 사이 2px
    <span className="flex gap-0.5">
      <VoteButton
        icon={ThumbsUp}
        label="좋아요"
        count={comment.upCount}
        pressed={comment.myVote === 1}
        activeClassName="text-primary-deep"
        onClick={() => press(1)}
      />
      <VoteButton
        icon={ThumbsDown}
        label="싫어요"
        count={comment.downCount}
        pressed={comment.myVote === -1}
        activeClassName="text-crimson"
        onClick={() => press(-1)}
      />
    </span>
  );
}

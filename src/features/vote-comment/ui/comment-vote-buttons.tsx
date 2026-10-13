"use client";

import { useEffect, useRef } from "react";
import { ThumbsDown, ThumbsUp, type LucideIcon } from "lucide-react";
import { cn, formatCount } from "@/shared/lib";
import { Icon } from "@/shared/ui";
import type { Comment, CommentVote } from "@/entities/comment";
import type { CommentVoteFn } from "../model/use-comment-vote";

interface CommentVoteButtonsProps {
  comment: Comment;
  /**
   * 표 보내기 — 목록이 `useCommentVote`로 **한 벌** 만들어 행마다 내려보낸다(안정된 참조).
   * 세션 3분기와 비로그인 안내(`SignInDialog` — 뷰가 한 벌 소유한다)는 그 함수가 갖는다.
   */
  vote: CommentVoteFn;
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
        "hit-area inline-flex h-8 min-w-11 items-center justify-center gap-1 whitespace-nowrap rounded-sm px-2 text-[12px] text-ink-mute transition-colors duration-150 ease-otb",
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
 * - 세션 `status`의 3분기(`loading`을 비로그인처럼 다루지 않는다)는 `vote`(`useCommentVote`)가 누르는 순간에 한다 —
 *   이 버튼은 세션을 구독하지 않는다(댓글마다 구독이 둘씩 붙지 않게).
 *
 * ⚠ **같은 tick의 연타를 prop으로 판정하지 않는다.** 낙관적 갱신은 캐시를 곧바로 고치지만 이 컴포넌트의
 *   `comment` prop은 다음 렌더에야 바뀌어서, 그 사이 들어온 두 번째 클릭은 옛 표를 보고 같은 요청을 한 번 더 만든다.
 *   → 마지막으로 요청한 표를 ref에 동기로 적어 두고, 캐시가 따라오면(`myVote`가 바뀌면) 비운다.
 *   롤백도 `myVote`를 바꾸므로 그때 함께 비워져 다시 캐시를 믿는다. 이 ref는 **행마다** 둔다(뮤테이션은 목록이 한 벌).
 */
export function CommentVoteButtons({ comment, vote }: CommentVoteButtonsProps) {
  const requestedRef = useRef<CommentVote | null>(null);

  useEffect(() => {
    requestedRef.current = null;
  }, [comment.myVote]);

  const press = (pressed: 1 | -1) => {
    const current = requestedRef.current ?? comment.myVote;
    const next: CommentVote = current === pressed ? 0 : pressed;
    // 보내지 않았으면(복원 중·비로그인) 적어 두지 않는다 — 적으면 캐시가 따라오지 않아 다음 판정이 어긋난다
    if (vote(comment.id, current, next)) requestedRef.current = next;
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

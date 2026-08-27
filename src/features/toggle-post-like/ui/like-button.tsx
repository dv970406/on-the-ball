"use client";

import { Heart } from "lucide-react";
import { formatCount } from "@/shared/lib";
import { ActionChip, Icon, actionChipClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { useTogglePostLike } from "../model/use-toggle-post-like";

interface LikeButtonProps {
  postId: number;
  likeCount: number;
  isLiked: boolean;
  /**
   * 비로그인이 하트를 눌렀다.
   *
   * ⚠ **다이얼로그를 여기서 렌더하지 않고 위로 올린다.** `Dialog`는 `absolute`라 가장 가까운
   *   positioned 조상을 기준으로 잡는데, 이 칩은 상세의 `relative` 스크롤 `<main>` 안이라
   *   스크롤을 내린 만큼 화면 밖에 뜬다(`SurveyVote`와 같은 형태·같은 이유).
   */
  onSignInRequired: () => void;
}

/**
 * 상세 화면의 좋아요 칩 (프로토타입 `.cm-act`).
 *
 * 활성 시 배경이 에메랄드로 채워진다 — 상세 화면에서 에메랄드를 쓰는 자리는 여기뿐이다.
 * 어디에 에메랄드를 둘 수 있는지는 `styling.md`의 **에메랄드 자리 표**가 단독으로 정한다
 * (원칙만으로는 경계가 갈리지 않아 자리를 센다).
 *
 * disabled로 막지 않는다 — 낙관적 업데이트의 목적이 즉시 반응이고,
 * 최종 정답은 onSettled의 무효화가 확정한다.
 */
export function LikeButton({ postId, likeCount, isLiked, onSignInRequired }: LikeButtonProps) {
  const status = useSessionStore((s) => s.status);
  const toggleLike = useTogglePostLike(postId);

  // ⚠ 세션 복원 전(`loading`)에는 **판단을 미룬다.** 비로그인과 똑같이 다루면 로그인한
  //   사용자가 콜드 로드 직후 하트를 눌렀을 때 로그인 안내를 본다(같은 화면의 CommentBar는
  //   이미 loading을 따로 다룬다 — 두 컴포넌트의 판정이 갈리면 안 된다).
  if (status === "loading") {
    return (
      <span className={actionChipClassName({ className: "opacity-40" })}>
        <Icon as={Heart} size={15} />
        {formatCount(likeCount)}
      </span>
    );
  }

  /**
   * 비로그인도 **칩을 그대로 누를 수 있다** — 눌러야 로그인 안내가 뜬다.
   *
   * 전에는 로그인 화면으로 가는 `Link`였는데, 하트를 누른 사용자가 아무 설명도 없이
   * 읽던 글을 잃었다. 훅의 RPC는 어차피 DB가 거부하므로 여기서 갈라 안내로 보낸다.
   * ⚠ `!== "authenticated"`가 아니라 **`=== "guest"`로 판정한다.** 지금은 위에서 loading을
   *   걸렀으니 둘이 같지만, 상태가 하나 늘면 부정형만 그 새 상태를 조용히 게스트로 취급한다.
   *   같은 판정을 하는 CommentBar·AuthStatus가 긍정형이라 형태도 맞춘다.
   */
  if (status === "guest") {
    return (
      // ⚠ 인자 없이 감싼다 — `onClick`은 MouseEvent를 실어 부른다(`PollVote`와 같은 이유)
      <ActionChip icon={Heart} aria-haspopup="dialog" onClick={() => onSignInRequired()}>
        {formatCount(likeCount)}
        <span className="sr-only">좋아요 (로그인 필요)</span>
      </ActionChip>
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
        <span className="text-[12px] text-crimson">
          {toggleLike.error.message}
        </span>
      )}
    </>
  );
}

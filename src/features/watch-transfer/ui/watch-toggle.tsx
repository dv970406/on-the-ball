"use client";

import { Bell } from "lucide-react";
import { Icon, buttonClassName } from "@/shared/ui";
import { useSessionStore } from "@/entities/session";
import { useToggleTransferWatch } from "../model/use-toggle-transfer-watch";

interface WatchToggleProps {
  dealId: number;
  /** 지금 관심 상태 — 상세 쿼리의 `isWatched`(낙관적 갱신이 이 값을 먼저 뒤집는다) */
  watched: boolean;
  /**
   * 비로그인이 버튼을 눌렀다.
   * ⚠ **다이얼로그를 여기서 렌더하지 않고 위로 올린다.** `Dialog`는 `absolute`라 가장 가까운
   *   positioned 조상을 기준으로 잡는데, 이 버튼은 상세의 하단 고정 바 안이다
   *   (`data-and-state.md`의 세션 3분기).
   */
  onSignInRequired: () => void;
  /**
   * 방금 관심 목록에 **담았다**(뺀 것은 아니다) — 뷰가 이 순간에 알림 안내를 낸다.
   * ⚠ 호출 시점은 훅의 `onSuccess`(토스트) 뒤다. 그 사이 화면을 떠났으면 불리지 않는다 — 떠난 화면에 낼 안내가 없다.
   */
  onWatched?: () => void;
}

const LABEL_ADD = "관심 목록에 담기";
const LABEL_REMOVE = "관심 목록에서 빼기";

/**
 * 상세 하단의 관심 토글 — 블록 버튼 하나. 관심 중이면 `primary`(에메랄드 채움),
 * 아니면 `secondary`. **이 화면의 CTA**라 에메랄드 자리는 `buttonClassName primary`(기존 자리)다.
 *
 * ⚠ **세션 `status`를 3분기한다.** `loading`을 비로그인과 같이 다루면 콜드 로드 직후 로그인한
 *   사용자가 로그인 안내를 본다. `!== "authenticated"`가 아니라 **`=== "guest"`로 판정한다** —
 *   상태가 하나 늘면 부정형만 그 새 상태를 조용히 게스트로 취급한다.
 * ⚠ `disabled`도 중복 가드도 없다 — 낙관적 업데이트의 목적이 즉시 반응이고, 최종 정답은
 *   `onSettled`의 무효화가 확정한다(좋아요와 같은 판단). 연타해도 행은 하나뿐이다(PK).
 * ⚠ `aria-pressed`로 상태를 말한다 — 라벨도 함께 바뀌지만 토글 버튼의 롤 규약이다.
 */
export function WatchToggle({ dealId, watched, onSignInRequired, onWatched }: WatchToggleProps) {
  const status = useSessionStore((s) => s.status);
  const toggle = useToggleTransferWatch();

  // 세션 복원 전 — 누를 수는 없지만 **상태는 그대로 그린다.** `watched`는 서버가 쿠키 세션으로
  // 계산해 내려준 값이라 이미 정답이다(비로그인이면 false). 여기서 `false`로 접어 그리면
  // 관심 중인 사용자에게 첫 프레임이 "담기/secondary"였다가 복원 직후 "빼기/primary"로 바뀌는
  // 시프트가 난다(`data-and-state.md` — 사용자별 상태도 끝까지 서버가 그린다).
  if (status === "loading") {
    return (
      <button
        type="button"
        disabled
        aria-pressed={watched}
        className={buttonClassName({
          variant: watched ? "primary" : "secondary",
          block: true,
          disabled: true,
        })}
      >
        <Icon as={Bell} size={18} className={watched ? "fill-current" : undefined} />
        {watched ? LABEL_REMOVE : LABEL_ADD}
      </button>
    );
  }

  /**
   * 비로그인도 **버튼을 그대로 누를 수 있다** — 눌러야 로그인 안내가 뜬다. 훅의 insert는
   * 어차피 RLS가 거부하므로 여기서 갈라 안내로 보낸다.
   */
  if (status === "guest") {
    return (
      <button
        type="button"
        // ⚠ 인자 없이 감싼다 — `onClick`은 MouseEvent를 실어 부른다
        onClick={() => onSignInRequired()}
        className={buttonClassName({ variant: "secondary", block: true })}
      >
        <Icon as={Bell} size={18} />
        {LABEL_ADD}
        <span className="sr-only">(로그인 필요)</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={watched}
      onClick={() =>
        toggle.mutate(
          { dealId, watched },
          // `watched`는 누르기 전 상태다 — 담는 쪽(false → true)일 때만 알린다
          {
            onSuccess: () => {
              if (!watched) onWatched?.();
            },
          },
        )
      }
      className={buttonClassName({ variant: watched ? "primary" : "secondary", block: true })}
    >
      <Icon as={Bell} size={18} className={watched ? "fill-current" : undefined} />
      {watched ? LABEL_REMOVE : LABEL_ADD}
    </button>
  );
}

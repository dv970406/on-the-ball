"use client";

import { X } from "lucide-react";
import { cn } from "@/shared/lib";
import { Icon } from "@/shared/ui";

/**
 * 공유 링크로 처음 온 비로그인 방문자에게 — 이 사이트가 무엇인지와 담아 두면 무엇이 좋은지를 한 번 말한다.
 * 그릴지는 `useShareWelcome`이 정한다(공유 주소 · 비로그인 · 처음 · 담기 전).
 *
 * - ⚠ **알림을 단정하지 않는다** — 알림은 그 기기에서 켜 둔 사람에게만 간다. "담아 두고 알림을 켜면…"처럼 조건을 함께
 *   말한다(`nextjs.md` 웹 푸시 절). 담으려면 로그인해야 한다는 것도 숨기지 않는다 — 토글을 누르면 로그인 안내가 뜬다.
 * - ⚠ 에메랄드를 쓰지 않는다 — 이 화면의 에메랄드 CTA는 곁의 관심 토글 하나다(`styling.md`). 글자는 잉크 래더다.
 * - ⚠ 라이브 리전(`role="status"`)을 달지 않는다 — 알림 채널은 `ToastViewport` 하나다(`code-quality.md`).
 * - 등장 모션은 불투명도만이다 — 하이드레이션·세션 확인 뒤에 **늦게 도착하는** 구역이라 규약의 대상이고, 서버 HTML에는
 *   없다(`styling.md` 등장 모션). 퇴장은 즉시 언마운트한다.
 * - 자리마다 여백이 다르다 — 하단 고정 바에서는 토글 위, 넓은 화면의 곁 칸에서는 토글 아래(`PushNudge`와 같은 자리).
 */
export function ShareWelcome({ onDismiss, className }: { onDismiss: () => void; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 motion-safe:animate-[cm-fade_0.24s_cubic-bezier(0.2,0,0,1)_both]",
        className,
      )}
    >
      {/* 낱말 단위로 꺾는다(`break-keep`) — 기본 줄바꿈은 "담/아 두고"처럼 낱말 가운데를 자른다(곁 칸 실측) */}
      <p className="min-w-0 flex-1 break-keep text-[13px] leading-[1.45] text-ink-mute">
        <span className="font-medium text-ink">유럽 이적 소식을 모아 보는 온더볼이에요.</span> 로그인해 담아 두고
        알림을 켜면 상태가 바뀔 때 알려 드려요.
      </p>
      {/* 아이콘만 있는 버튼이라 이름을 준다. 색은 `ink-mute` — 비텍스트 최소 대비 3:1을 넘는다(`ink-mute-2`는 못 넘는다) */}
      <button
        type="button"
        aria-label="안내 닫기"
        onClick={onDismiss}
        className="hit-area flex size-6 shrink-0 items-center justify-center rounded-sm text-ink-mute transition-colors duration-150 ease-otb hover:text-ink"
      >
        <Icon as={X} size={16} />
      </button>
    </div>
  );
}

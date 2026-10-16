"use client";

import type { PushNudgeBlock } from "../model/use-push-nudge";
import { usePushToggle } from "../model/use-push-toggle";
import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui";

/**
 * 켤 수 없는 기기의 안내 — 이유마다 **무엇을 하면 되는지**를 한 줄로 말한다(프로필의 알림 섹션이 더 자세히 말한다).
 * `Record`라 이유가 늘면 누락이 컴파일 에러로 드러난다. 브라우저·OS마다 메뉴 이름이 달라 경로를 단정하지 않는다.
 */
const BLOCKED_HINT: Record<PushNudgeBlock, string> = {
  "needs-install":
    "아이폰·아이패드는 사파리 공유 버튼에서 ‘홈 화면에 추가’한 뒤, 홈 화면의 아이콘으로 열면 알림을 켤 수 있어요.",
  "in-app-browser":
    "앱 안에서 연 화면에서는 알림을 켤 수 없어요. 메뉴에서 ‘다른 브라우저로 열기’를 누르면 켤 수 있어요.",
  denied: "이 사이트의 알림이 브라우저에서 차단돼 있어요. 브라우저 설정에서 허용하면 다시 켤 수 있어요.",
};

/**
 * 알림 안내 — **방금 관심 목록에 담은 사람에게** 이 딜의 상태가 바뀌면 알려드리겠다고 묻는 한 줄.
 *
 * 권한을 묻기 가장 좋은 순간이 "이 딜이 궁금하다"고 말한 직후다 — 맥락 없이 첫 방문에 묻는 권한 요청은 거절되고,
 * 한 번 거절된 권한은 브라우저 설정에서만 되돌릴 수 있다.
 *
 * ⚠ **그릴지는 `usePushNudge`가 정한다**(방금 담았고 · 지금 담겨 있고 · 알림이 꺼져 있거나 사용자가 풀 수 있는 이유로 못 켤 때만). 이 컴포넌트는 그려졌으면 켤 수
 *   있는 상태라고 믿는다 — 켜지면 상태가 `on`이 되어 뷰가 걷어 낸다.
 * ⚠ 이 화면의 에메랄드는 곁의 관심 토글이다 — 여기 버튼은 잉크(`dark`)다(`styling.md` "CTA가 둘이면 나중 것을 잉크로").
 * ⚠ 가드는 훅이 갖는다(`enable`). `disabled`는 시각 표시일 뿐이다.
 * ⚠ 자리마다 여백이 다르다 — 하단 고정 바에서는 토글 위(`mb-2.5`, 기본값), 넓은 화면의 곁 칸에서는 토글 아래.
 */
export function PushNudge({
  className = "mb-2.5",
  blocked = null,
}: {
  className?: string;
  /** 켤 수 없는 이유(`usePushNudge`가 돌려준다) — 있으면 물음 대신 방법을 말한다 */
  blocked?: PushNudgeBlock | null;
}) {
  const toggle = usePushToggle("deal");

  if (blocked !== null) {
    return <p className={cn("text-[13px] leading-[1.5] text-ink-mute", className)}>{BLOCKED_HINT[blocked]}</p>;
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <p className="min-w-0 flex-1 text-[13px] leading-[1.4] text-ink-mute">
        상태가 바뀌면 알림으로 알려드릴까요?
      </p>
      <Button
        variant="dark"
        size="sm"
        className="shrink-0"
        disabled={toggle.isPending}
        onClick={toggle.enable}
      >
        {toggle.isPending ? "켜는 중…" : "알림 켜기"}
      </Button>
    </div>
  );
}

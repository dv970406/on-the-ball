"use client";

import { usePushToggle } from "@/features/push-notification";
import { Button } from "@/shared/ui";

/**
 * 알림 안내 — **방금 관심 목록에 담은 사람에게** 이 딜의 상태가 바뀌면 알려드리겠다고 묻는 한 줄.
 *
 * 권한을 묻기 가장 좋은 순간이 "이 딜이 궁금하다"고 말한 직후다 — 맥락 없이 첫 방문에 묻는 권한 요청은 거절되고,
 * 한 번 거절된 권한은 브라우저 설정에서만 되돌릴 수 있다.
 *
 * ⚠ **그릴지는 뷰가 정한다**(방금 담았고 · 지금 담겨 있고 · 알림이 꺼져 있을 때만). 이 컴포넌트는 그려졌으면 켤 수
 *   있는 상태라고 믿는다 — 켜지면 상태가 `on`이 되어 뷰가 걷어 낸다.
 * ⚠ 이 화면의 에메랄드는 아래 관심 토글이다 — 여기 버튼은 잉크(`dark`)다(`styling.md` "CTA가 둘이면 나중 것을 잉크로").
 * ⚠ 가드는 훅이 갖는다(`enable`). `disabled`는 시각 표시일 뿐이다.
 */
export function PushNudge() {
  const toggle = usePushToggle("deal");

  return (
    <div className="mb-2.5 flex items-center gap-3">
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

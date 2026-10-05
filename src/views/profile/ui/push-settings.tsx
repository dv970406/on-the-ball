"use client";

import { Bell, BellOff } from "lucide-react";
import { usePushStatusQuery, type PushStatus } from "@/entities/push";
import { usePushToggle } from "@/features/push-notification";
import { env } from "@/shared/config";
import { Button, EmptyState, Skeleton, StaleBanner } from "@/shared/ui";

/**
 * 켤 수 없는 상태의 안내 — 이유마다 **무엇을 하면 되는지**까지 말한다.
 * `Record`라 상태가 늘면 누락이 컴파일 에러로 드러난다(켤 수 있는 두 상태와 숨기는 상태는 `null`).
 */
const BLOCKED_MESSAGE: Record<PushStatus, string | null> = {
  on: null,
  off: null,
  unconfigured: null,
  "needs-install":
    "아이폰·아이패드는 홈 화면에 추가한 뒤에 알림을 켤 수 있어요. 사파리의 공유 버튼에서 ‘홈 화면에 추가’를 누르고, 홈 화면의 온더볼 아이콘으로 다시 열어 주세요.",
  "in-app-browser":
    "앱 안에서 연 화면에서는 알림을 켤 수 없어요. 사파리·크롬 같은 브라우저에서 온더볼을 열어 주세요.",
  unsupported: "이 브라우저는 알림을 지원하지 않아요.",
  denied:
    "이 사이트의 알림이 브라우저에서 차단돼 있어요. 브라우저 설정에서 알림을 허용한 뒤 다시 열어 주세요.",
};

/**
 * 알림 — 이 기기의 웹 푸시를 켜고 끈다.
 *
 * 알림이 가는 순간은 둘이다: 관심 목록에 담은 딜의 상태가 바뀔 때, 응원 구단에 새 딜이 생기거나 크게 진전될 때.
 * 보내는 쪽은 매시 도는 수집 스크립트다(`scripts/lib/transfer/notify.mjs`).
 *
 * ⚠ **서버에 알림 키가 없으면 섹션을 통째로 그리지 않는다** — 켤 수 없는 스위치를 두지 않는다. 키는 빌드에 박힌
 *   상수라 **조회를 기다리지 않고** 가른다. 조회 결과(`unconfigured`)로 가르면 제목과 스켈레톤이 잠깐 그려졌다가
 *   사라지면서 아래 섹션이 밀려 올라온다.
 * ⚠ 상태는 브라우저 API에서 나와 서버가 미리 그릴 수 없다 — 도착 전 자리는 스켈레톤이 잡는다.
 * ⚠ 이 화면의 에메랄드는 닉네임 저장 버튼 하나다 — 여기 버튼은 `secondary`다(`styling.md`).
 * ⚠ 가드는 훅이 갖는다(`enable`·`disable`). `disabled`는 시각 표시일 뿐이다.
 */
export function PushSettings({ userId }: { userId: string | undefined }) {
  const configured = env.vapidPublicKey !== "";
  // 키가 없으면 조회도 닫는다(브라우저 API를 건드릴 이유가 없다)
  const status = usePushStatusQuery(configured ? userId : undefined);
  const toggle = usePushToggle("profile");

  if (!configured || status.data === "unconfigured") return null;

  const blocked = status.data ? BLOCKED_MESSAGE[status.data] : null;

  return (
    <section aria-labelledby="push-heading" className="px-5 pt-7">
      <h2 id="push-heading" className="text-[15px] font-semibold tracking-[-0.3px] text-ink">
        알림
      </h2>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-mute">
        관심 목록에 담은 딜의 상태가 바뀌거나 응원 구단에 새 딜이 생기면 이 기기로 알려드려요.
      </p>

      {status.isPending && <Skeleton className="mt-4 h-12 w-full" />}

      {/* 보여줄 데이터가 없을 때만 전체 대체한다(data-and-state.md) */}
      {status.error && !status.data && (
        <EmptyState
          title="알림 상태를 확인하지 못했어요"
          description={status.error.message}
          onRetry={() => status.refetch()}
        />
      )}

      {status.error && status.data && (
        <div className="mt-4">
          <StaleBanner noun="알림 상태" onRetry={() => status.refetch()} />
        </div>
      )}

      {blocked !== null && (
        <p className="mt-4 rounded-sm border border-hairline-cool bg-canvas-soft px-4 py-3 text-[13px] leading-[1.6] text-ink-mute">
          {blocked}
        </p>
      )}

      {status.data === "off" && (
        <Button
          variant="secondary"
          block
          icon={Bell}
          className="mt-4"
          disabled={toggle.isPending}
          onClick={toggle.enable}
        >
          {toggle.isPending ? "알림 켜는 중…" : "이 기기에서 알림 켜기"}
        </Button>
      )}

      {status.data === "on" && (
        <div className="mt-4 flex items-center gap-3 rounded-sm border border-hairline-cool px-4 py-3">
          <p className="flex min-w-0 items-center gap-3">
            <span className="text-[14px] font-medium text-ink">이 기기</span>
            <span className="text-[12px] text-ink-mute-2">알림 받는 중</span>
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            icon={BellOff}
            disabled={toggle.isPending}
            onClick={toggle.disable}
          >
            {toggle.isPending ? "끄는 중…" : "끄기"}
          </Button>
        </div>
      )}

      {/*
        훅이 한국어로 바꿔 던진 에러 — 토스트는 곧 사라지므로 지속 표시를 함께 남긴다.
        ⚠ 켤 수 없는 이유의 안내가 떠 있으면 내지 않는다 — 권한을 거절하면 상태가 `denied`로 바뀌어 위 안내가 같은 말을
          더 자세히 한다(같은 실패를 두 번 적지 않는다).
      */}
      {toggle.error && blocked === null && (
        <p className="mt-3 text-[13px] leading-[1.5] text-crimson">{toggle.error.message}</p>
      )}
    </section>
  );
}

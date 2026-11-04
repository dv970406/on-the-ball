"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { env } from "@/shared/config";
import { cn } from "@/shared/lib";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * 구글 애드센스 광고 자리 하나(수동 광고 단위 — 자동 광고는 쓰지 않는다).
 *
 * 게시자 ID(`env.adsenseClient`)나 이 자리의 광고 단위 ID(`slot`)가 비어 있으면 **아무것도 그리지 않는다** —
 * 승인 전에 빈 상자가 생기지 않고, 로컬·프리뷰는 광고를 요청하지 않는다.
 *
 * ⚠ **자동 광고를 켜지 않는다.** 앱 프레임이 화면 높이에 고정되고 안쪽 영역만 스크롤되는 구조라, 자동 광고가 임의로 끼워
 *   넣는 요소는 React가 관리하는 트리와 부딪히고, 하단 고정 광고는 탭바·관심 토글 바를 덮고, 전면 광고는 링크 클릭을
 *   가로채 보드의 클릭 위임(2분할 선택)과 충돌한다. 애드센스 콘솔의 "자동 광고"는 꺼 둔다.
 * ⚠ **CSS로 가려질 수 있는 자리에 두지 않는다**(보드의 오른쪽 판 · 딜 상세의 `max-lg:hidden` 탭 패널). 가려진 광고는
 *   정책 위반이고, 폭이 0인 자리는 채워지지도 않는다(`availableWidth=0` 에러).
 * ⚠ **콘텐츠가 없는 화면에 두지 않는다** — 로그인·프로필·404·에러·빈 상태·스켈레톤(애드센스 정책 "게시자 콘텐츠가 없는 화면").
 *   누르는 컨트롤 바로 옆에도 두지 않는다(실수 클릭은 무효 트래픽이다).
 */
export function AdSlot({ slot, className }: { slot: string; className?: string }) {
  const pathname = usePathname();
  if (!env.adsenseClient || !slot) return null;
  // 화면을 옮기면 새 광고를 받는다 — 같은 `<ins>`에는 광고를 한 번만 요청할 수 있어서, 경로를 키로 새 요소를 만든다
  return <AdUnit key={pathname} client={env.adsenseClient} slot={slot} className={className} />;
}

function AdUnit({ client, slot, className }: { client: string; slot: string; className?: string }) {
  const insRef = useRef<HTMLModElement>(null);
  const requested = useRef(false);

  useEffect(() => {
    const ins = insRef.current;
    // ⚠ Strict Mode의 effect 재실행·이미 채워진 요소에 다시 요청하면 "already have ads in them" 예외가 난다
    if (!ins || requested.current || ins.dataset.adsbygoogleStatus) return;
    requested.current = true;
    try {
      // 스크립트가 아직 안 받아졌어도 된다 — 배열에 쌓아 두면 스크립트가 로드되며 처리한다
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch (e) {
      // 광고 실패는 화면의 실패가 아니다 — 사용자에게 알리지 않고 원본만 남긴다
      console.error("[ad] 광고를 요청하지 못했어요", e);
    }
  }, []);

  return (
    /*
      ⚠ 높이를 미리 잡는다(`min-h-[250px]`) — 광고는 하이드레이션 뒤에 채워져서, 자리가 없으면 그 아래 본문이 밀린다.
      ⚠ 채우지 못한 자리(`data-ad-status="unfilled"` — 애드센스가 붙인다)는 접는다. "광고" 라벨만 남은 빈 상자보다 낫고,
        자리는 본문 사이에 있어 접힐 때 위쪽 내용은 움직이지 않는다.
      라벨은 애드센스가 허용하는 표기("광고")다 — 광고를 콘텐츠와 구분한다.
      ⚠ 전체 폭 반응형(`data-full-width-responsive`)을 끈다 — 켜면 모바일에서 광고가 음수 여백으로 화면 끝까지 늘어나는데,
        이 앱의 스크롤 영역은 `overflow-y-auto`라 가로도 `auto`로 계산되어(`styling.md`) 본문에 가로 스크롤이 생긴다.
    */
    <aside
      className={cn(
        "has-[ins[data-ad-status=unfilled]]:hidden",
        className,
      )}
    >
      <p className="mb-1.5 text-[11px] leading-none text-ink-mute-2">광고</p>
      <ins
        ref={insRef}
        className="adsbygoogle block min-h-[250px] w-full"
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="false"
      />
      {/*
        스크립트는 광고 자리가 있는 화면에서만 싣는다 — Next가 같은 스크립트를 한 번만 받으므로(`id`) 자리가 여럿이어도 한 번이고,
        광고가 없는 화면(로그인·프로필)은 받지 않는다. 기본 전략(`afterInteractive`)이라 하이드레이션 뒤에 내려온다.
        ⚠ `id`를 `adsbygoogle`로 두지 않는다 — 브라우저가 id를 가진 요소를 같은 이름의 전역(`window.adsbygoogle`)으로 노출해,
          광고 요청 큐 자리에 이 `<script>` 요소가 앉고 `push`가 "is not a function"으로 실패했다(실측).
        콘솔의 "AdSense head tag doesn't support data-nscript attribute" 경고는 `next/script`가 붙이는 속성 때문이고 광고 동작과 무관하다.
      */}
      <Script
        id="adsense-script"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
    </aside>
  );
}

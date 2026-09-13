"use client";

import { useState } from "react";
import { cn } from "@/shared/lib";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * 한 자리 — 0~9를 세로로 쌓아 두고 값만큼 밀어 올린다(Apple Sports·FotMob의 스코어 롤).
 * ⚠ 마운트 순간에는 움직이지 않는다 — `transition`이라 **값이 바뀔 때만** 구른다. 하이드레이션
 *   HTML에는 최종 자리가 그대로 찍힌다.
 * ⚠ 바깥 상자가 `h-[1em] overflow-hidden`이라 `leading-none`이 필수다 — 줄높이가 1em보다 크면
 *   이웃 숫자가 비쳐 보인다.
 * ⚠ 이 요소에는 표준 translate 유틸이 없다 — `style`의 transform이 유일한 transform이다.
 */
function Digit({ digit }: { digit: number }) {
  return (
    <span className="inline-block h-[1em] overflow-hidden align-top">
      <span
        className="flex flex-col transition-transform duration-300 ease-otb"
        // 값(0~9)이 런타임이라 style — 10칸 중 몇 번째를 보일지가 곧 이동량이다
        style={{ transform: `translateY(-${digit}em)` }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block h-[1em] leading-none">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

/** 자릿수만큼 `Digit`을 놓는다 — 두 자리 스코어(10-0)도 자리마다 따로 구른다 */
function RollingNumber({ value, className }: { value: number; className?: string }) {
  const digits = String(value).split("").map(Number);
  return (
    <span className={cn("relative inline-flex leading-none", className)}>
      {/*
        ⚠ 구르는 열은 0~9를 전부 담고 있어 낭독하면 "0123456789"가 된다 — 접근성 트리에서 빼고
          실제 값은 `sr-only`로 준다(목록 카드의 링크 이름이 이 텍스트로 만들어진다).
      */}
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {/* 오른쪽 자리부터 키를 잡는다 — 9→10에서 새 자리가 왼쪽에 생기고 일의 자리는 그대로 구른다 */}
        {digits.map((d, i) => (
          <Digit key={digits.length - i} digit={d} />
        ))}
      </span>
    </span>
  );
}

interface ScorelineProps {
  home: number;
  away: number;
  /** 홈·원정 숫자의 색 — 이긴 쪽은 잉크, 진 쪽은 흐리게(호출부의 승패 판정을 그대로 받는다) */
  homeClassName?: string;
  awayClassName?: string;
  className?: string;
}

/**
 * `H - A` 스코어 — 숫자가 세로로 구르고, 바뀐 순간 칸이 한 번 밝아졌다 가라앉는다
 * (BBC Sport 스코어 센터의 goal flash).
 *
 * ⚠ **지금은 라이브 폴링이 꺼져 있어**(api-and-db.md) 화면에 떠 있는 동안 스코어가 바뀌는
 *   순간은 리페치(무효화·30초 stale 뒤 재마운트)뿐이다. 이 컴포넌트는 그 순간을 이미 받아
 *   그리므로, `--live` 폴러와 `refetchInterval`이 한 커밋으로 들어오는 날 화면 쪽은 손댈
 *   것이 없다.
 * ⚠ 플래시는 **키를 바꿔 다시 마운트**시킨다 — 같은 요소의 animation은 클래스를 다시 붙여도
 *   재생되지 않는다. 숫자는 그대로 마운트를 유지해야 구르므로 플래시만 별도 요소다.
 * ⚠ 바뀜 판정은 렌더 중 `setState`다(React의 "props에서 파생된 상태 조정" 패턴) — effect로
 *   미루면 한 프레임 늦게 번쩍인다.
 */
export function Scoreline({ home, away, homeClassName, awayClassName, className }: ScorelineProps) {
  const [seen, setSeen] = useState({ home, away });
  const [flash, setFlash] = useState(0);
  if (seen.home !== home || seen.away !== away) {
    setSeen({ home, away });
    setFlash((n) => n + 1);
  }

  return (
    <span className={cn("relative inline-flex items-center gap-2", className)}>
      {flash > 0 && (
        <span
          key={flash}
          aria-hidden
          // 숫자보다 먼저 두고 둘 다 positioned라 DOM 순서대로 칠해진다 — 숫자가 위에 온다
          className="absolute -inset-x-2 -inset-y-1 rounded-sm animate-[score-flash_300ms_cubic-bezier(0.2,0,0,1)_both]"
        />
      )}
      <RollingNumber value={home} className={homeClassName} />
      <span className="relative text-ink-faint">-</span>
      <RollingNumber value={away} className={awayClassName} />
    </span>
  );
}
